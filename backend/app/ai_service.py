"""Grounded room assistant. Database is authoritative; OpenAI only parses/phrases."""
import json
import logging
import httpx
import os
import re
import unicodedata
from datetime import datetime, timedelta, date
from typing import Optional
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import joinedload
from sqlalchemy import or_
from . import models

logger = logging.getLogger(__name__)

BLOCKING = ('PENDING', 'APPROVED', 'CHECKED_IN')

class SearchRequest(BaseModel):
    start_at: Optional[datetime] = None
    end_at: Optional[datetime] = None
    requested_date: Optional[date] = None  # Ngày đã biết, chưa có giờ bắt đầu
    min_capacity: int = Field(default=1, ge=1, le=10000)
    building: Optional[str] = Field(default=None, max_length=100)
    room_type: Optional[str] = Field(default=None, max_length=100)
    equipment: list[str] = Field(default_factory=list, max_length=12)
    keywords: Optional[str] = Field(default=None, max_length=100)
    room_code: Optional[str] = Field(default=None, max_length=50)
    title: Optional[str] = Field(default=None, max_length=180)
    purpose: Optional[str] = Field(default=None, max_length=500)
    floor: Optional[int] = Field(default=None, ge=0, le=200)
    status: Optional[str] = Field(default=None, max_length=30)
    limit: int = Field(default=5, ge=1, le=20)

    @field_validator('equipment')
    @classmethod
    def clean_equipment(cls, items):
        return [x.strip()[:60] for x in items if x.strip()]

    def check_window(self):
        if self.end_at and not self.start_at:
            raise ValueError('Cần cung cấp giờ bắt đầu trước giờ kết thúc.')
        if self.start_at and self.end_at:
            if self.start_at.tzinfo or self.end_at.tzinfo:
                raise ValueError('Vui lòng dùng giờ địa phương dạng YYYY-MM-DDTHH:MM, không kèm múi giờ.')
            if self.start_at >= self.end_at:
                raise ValueError('Thời gian kết thúc phải sau thời gian bắt đầu.')
            if self.start_at < datetime.now():
                raise ValueError('Không thể tìm phòng cho thời gian đã qua.')
            if (self.end_at-self.start_at).days > 7:
                raise ValueError('Một lần tra cứu không được dài quá 7 ngày.')


def search_rooms(db, req: SearchRequest):
    if (req.start_at is None) != (req.end_at is None):
        raise ValueError('Cần đủ giờ bắt đầu và kết thúc để kiểm tra phòng trống.')
    req.check_window()
    query = db.query(models.Room).options(
        joinedload(models.Room.building), joinedload(models.Room.room_type),
        joinedload(models.Room.equipment_links).joinedload(models.RoomEquipment.equipment)
    ).filter(models.Room.capacity >= req.min_capacity)
    query=query.filter(models.Room.status == (req.status or 'ACTIVE'))
    if req.building:
        term=f'%{req.building}%'
        query=query.join(models.Room.building).filter(or_(models.Building.name.ilike(term),models.Building.code.ilike(term)))
    if req.floor is not None:
        query=query.filter(models.Room.floor == req.floor)
    if req.room_code:
        query=query.filter(models.Room.code.ilike(req.room_code.strip()))
    if req.keywords:
        term=f'%{req.keywords}%'
        query=query.filter(or_(models.Room.code.ilike(term),models.Room.name.ilike(term),models.Room.description.ilike(term)))
    rooms=query.order_by(models.Room.code).limit(500).all()
    room_ids=[r.id for r in rooms]
    blocked=set()
    if req.start_at and room_ids:
        conflicts=db.query(models.Booking.room_id).filter(
            models.Booking.room_id.in_(room_ids),models.Booking.status.in_(BLOCKING),
            models.Booking.start_at < req.end_at,models.Booking.end_at > req.start_at).all()
        blocked.update(row[0] for row in conflicts)
        maint=db.query(models.Maintenance.room_id).filter(
            models.Maintenance.room_id.in_(room_ids),models.Maintenance.status=='ACTIVE',
            models.Maintenance.start_at < req.end_at,models.Maintenance.end_at > req.start_at).all()
        blocked.update(row[0] for row in maint)
        occurrences=db.query(models.BookingOccurrence,models.Booking).join(
            models.Booking,models.Booking.id==models.BookingOccurrence.booking_id).filter(
            models.Booking.room_id.in_(room_ids),models.Booking.status.in_(BLOCKING),
            models.BookingOccurrence.status.in_(BLOCKING),
            models.BookingOccurrence.start_at < req.end_at,models.BookingOccurrence.end_at > req.start_at).all()
        blocked.update(b.room_id for occ,b in occurrences)
    results=[]
    for r in rooms:
        if r.id in blocked or not _type_matches(r, req.room_type):continue
        equipment=[link.equipment.name for link in r.equipment_links]
        if not _equipment_matches(equipment, req.equipment):continue
        results.append({'id':r.id,'code':r.code,'name':r.name,'building':r.building.name,
            'room_type':r.room_type.name,'capacity':r.capacity,'floor':r.floor,'equipment':equipment,
            'status':r.status,'availability':'available' if req.start_at else 'not_checked'})
    results.sort(key=lambda x:(x['capacity']-req.min_capacity,x['code']))
    return results[:req.limit]


def _openai_chat_json(system: str, message: str) -> dict:
    """Call OpenAI Chat Completions over HTTP; no OpenAI SDK or jiter."""
    api_key = os.getenv('OPENAI_API_KEY', '').strip()
    if not api_key:
        raise RuntimeError('OPENAI_API_KEY is missing')
    with httpx.Client(timeout=20.0) as client:
        response = client.post(
            'https://api.openai.com/v1/chat/completions',
            headers={'Authorization': f'Bearer {api_key}'},
            json={
                'model': os.getenv('OPENAI_MODEL', 'gpt-4o-mini'),
                'temperature': 0,
                'response_format': {'type': 'json_object'},
                'messages': [
                    {'role': 'system', 'content': system},
                    {'role': 'user', 'content': message[:1200]},
                ],
                'max_tokens': 280,
            },
        )
        response.raise_for_status()
        payload = response.json()
    content = payload['choices'][0]['message']['content']
    if not isinstance(content, str):
        raise ValueError('OpenAI returned no JSON content')
    return json.loads(content)


def _normalized(value):
    return re.sub(r"\s+", " ", (value or "").casefold()).strip()


def _fold(value):
    """Vietnamese accent-insensitive comparison, including đ/d."""
    value = unicodedata.normalize('NFD', _normalized(value)).replace('đ', 'd')
    return ''.join(c for c in value if unicodedata.category(c) != 'Mn')


def _type_matches(room, requested):
    if not requested: return True
    value = _fold(' '.join((room.room_type.name, room.name, room.code)))
    target = _fold(requested)
    if target in ('lab', 'thuc hanh'):
        return any(word in value for word in ('lab', 'thuc hanh'))
    if target in ('ly thuyet', 'phong hoc'):
        return any(word in value for word in ('ly thuyet', 'phong hoc')) and 'lab' not in value
    return target in value


def _equipment_matches(available, required):
    available_fold = [_fold(x) for x in available]
    for item in required:
        wanted = _fold(item)
        synonyms = ('may tinh', 'computer', 'pc') if wanted == 'may tinh' else (wanted,)
        if not any(any(word in name for word in synonyms) for name in available_fold):
            return False
    return True



def _date_and_times(message, previous):
    """Return partial start/end/date; never guess a missing clock time."""
    low = _normalized(message)
    date_match = re.search(r"(?<!\d)(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?!\d)", low)
    if not date_match:
        date_match = re.search(r"(?<!\d)(\d{1,2})\s*tháng\s*(\d{1,2})\s*năm\s*(\d{4})(?!\d)", low)
    day = None
    if date_match:
        try:
            day = date(int(date_match[3]), int(date_match[2]), int(date_match[1]))
        except ValueError:
            raise ValueError('Ngày không hợp lệ. Hãy dùng ngày/tháng/năm.')
    elif re.search(r'\bngày kia\b|\bmốt\b', low):
        day = (datetime.now() + timedelta(days=2)).date()
    elif re.search(r'\bngày mai\b|\bmai\b', low):
        day = (datetime.now() + timedelta(days=1)).date()
    elif re.search(r'\bhôm nay\b', low):
        day = datetime.now().date()
    explicit_day = day is not None
    if day is None:
        if previous.get('start_at'):
            day = datetime.fromisoformat(str(previous['start_at'])).date()
        elif previous.get('requested_date'):
            day = date.fromisoformat(str(previous['requested_date']))
    clock = re.compile(r"(?<![\d/])(\d{1,2})\s*(?:h|giờ|:)\s*(\d{1,2}|rưỡi|ruoi)?\s*(sáng|chiều|tối|đêm)?", re.I)
    times = []
    for m in clock.finditer(low):
        hour = int(m[1]); minute = 30 if m[2] in ('rưỡi', 'ruoi') else int(m[2] or 0)
        if m[3] in ('chiều', 'tối') and hour < 12: hour += 12
        if m[3] == 'đêm' and hour == 12: hour = 0
        if hour > 23 or minute > 59: raise ValueError('Giờ không hợp lệ.')
        times.append((hour, minute))
    if day is None:
        return None, None, None, False
    make = lambda hm: datetime.combine(day, datetime.min.time()).replace(hour=hm[0], minute=hm[1])
    if len(times) >= 2:
        return make(times[0]), make(times[1]), day, True
    if len(times) == 1:
        # A short reply "đến 10h" completes the previous start time.
        end_only = bool(re.search(r'\b(?:đến|tới|kết thúc|cho tới|đến lúc)\b', low)) and previous.get('start_at')
        if end_only:
            old_start = datetime.fromisoformat(str(previous['start_at']))
            return datetime.combine(day, old_start.time()), make(times[0]), day, True
        return make(times[0]), None, day, True
    if explicit_day:
        if previous.get('start_at'):
            old_start = datetime.fromisoformat(str(previous['start_at']))
            old_end = datetime.fromisoformat(str(previous['end_at'])) if previous.get('end_at') else None
            return datetime.combine(day, old_start.time()), datetime.combine(day, old_end.time()) if old_end else None, day, True
        return None, None, day, True
    return None, None, day, False


def _local_extract(message, previous=None):
    old=dict(previous or {})
    low=_normalized(message)
    folded=_fold(message)
    # 'Tôi cần tìm phòng ...' is a NEW search, not a request to keep all
    # constraints from the previous search. Short follow-ups ('có máy tính',
    # 'ngày mai 8h-10h', 'tòa A nhé') retain previous constraints.
    new_search=bool(re.search(r'\b(?:toi|minh|em)\s+(?:can|muon)\s+(?:tim|kiem|tim kiem)\s+phong\b',folded))
    if new_search:
        old={}

    if re.search(r'\b(bắt đầu lại|tìm mới|xóa bộ lọc|reset)\b',low):
        return 'reset',SearchRequest(),'local'
    policy=any(t in low for t in ('cách đặt','quy trình','hướng dẫn','quy định','làm sao để'))
    intent='policy' if policy else 'search'
    data={k:v for k,v in old.items() if k in SearchRequest.model_fields and v is not None}
    data.pop('limit',None)
    # A new room type replaces an earlier room type; a new equipment request
    # replaces previous equipment (not an impossible accumulating AND filter).
    if re.search(r'\b(lý thuyết|ly thuyet|phòng học)\b',low):data['room_type']='lý thuyết';data.pop('room_code',None)
    elif re.search(r'\b(lab|thực hành|thuc hanh)\b',low):data['room_type']='Lab';data.pop('room_code',None)
    if re.search(r'\b(bất kỳ loại|loại nào cũng|không cần loại)\b',low):data.pop('room_type',None)
    # Switching category without repeating equipment starts a fresh equipment preference.
    if data.get('room_type') != old.get('room_type') and not any(w in low for w in ('máy chiếu','điều hòa','máy tính','micro','wifi','bảng thông minh')):
        data['equipment']=[]
    capacity=re.search(r'(trên|hơn|ít nhất|tối thiểu|dưới|không quá|cho|khoảng|chứa được|sức chứa)?\s*(\d{1,4})\s*(người|sinh viên|chỗ)',low)
    if capacity:
        num=int(capacity[2]);data['min_capacity']=num+1 if capacity[1] in ('trên','hơn') else num
    equipment=[w for w in ('máy chiếu','điều hòa','máy tính','micro','wifi','bảng thông minh') if w in low]
    if equipment:data['equipment']=equipment
    if re.search(r'không cần (?:thiết bị|máy tính|máy chiếu)|bỏ yêu cầu thiết bị',low):data['equipment']=[]
    if re.search(r'\b(?:trạng thái|tình trạng)\s*(?:đang\s*)?(?:hoạt động|active)\b|\bphòng\s+đang\s+hoạt động\b',low):
        data['status']='ACTIVE'
    elif re.search(r'\b(?:trạng thái|tình trạng)\s*(?:đang\s*)?(?:khóa|bảo trì|ngừng hoạt động)\b',low):
        data['status']='INACTIVE' if 'bảo trì' not in low else 'MAINTENANCE'
    # Explicitly relaxing a criterion replaces the previous constraint.
    if re.search(r'(?:không cần|bỏ|bất kỳ)\s+(?:tòa|toà|tầng|lầu)',low):
        data.pop('building',None);data.pop('floor',None)
    if re.search(r'(?:không cần|bỏ)\s+(?:sức chứa|số người)',low):data['min_capacity']=1
    building=re.search(r'(?:tòa|toà|khu)\s*(?:nhà\s*)?([a-z])\b',low)
    if building:data['building']=building[1].upper()
    floor=re.search(r'(?:tầng|lầu)\s*(\d{1,2})',low)
    if floor:data['floor']=int(floor[1])
    code=re.search(r'\b([a-z]\.?[a-z0-9]*\.?\d{2,3})\b',message,re.I)
    if code and not building:data['room_code']=code[1]
    start,end,day,changed=_date_and_times(message,old)
    if changed:
        data['requested_date']=day
        if start is not None:
            data['start_at']=start
            if end is not None:data['end_at']=end
            else:data.pop('end_at',None)
        else:
            data.pop('start_at',None);data.pop('end_at',None)
    return intent,SearchRequest.model_validate(data),'local'


def _merge_ai_fields(local, obj, message, previous):
    """Use AI for fields not confidently extracted locally; validate all results."""
    if not isinstance(obj, dict): raise ValueError('AI response is not an object')
    data = local.model_dump(mode='json')
    old = previous or {}
    folded = _fold(message)
    # Only accept fields that are explicitly present in the current message.
    # Local explicit constraints take precedence; AI must not fabricate availability.
    markers = {
        'min_capacity': ('nguoi', 'sinh vien', 'cho', 'suc chua'),
        'building': ('toa', 'khu'), 'floor': ('tang', 'lau'),
        'room_type': ('lab', 'thuc hanh', 'ly thuyet', 'loai phong'),
        'equipment': ('may chieu', 'may tinh', 'dieu hoa', 'wifi', 'micro', 'thiet bi', 'bang'),
        'room_code': ('phong', 'ma phong'),
    }
    for field, words in markers.items():
        if field not in obj or obj[field] is None or not any(w in folded for w in words):continue
        # Explicit local edits and existing filters should not be overwritten by a guess.
        if field == 'min_capacity' and data[field] != old.get(field, 1):continue
        if field in ('building','floor','room_type','room_code') and data.get(field) != old.get(field):continue
        if field == 'equipment' and data.get(field) != old.get(field, []):continue
        data[field] = obj[field]
    for field in ('title', 'purpose'):
        if isinstance(obj.get(field),str) and obj[field].strip():data[field]=obj[field].strip()
    # Date/time: only accept when the user actually mentioned a date/time.
    time_words = ('gio','luc','sang','chieu','toi','ngay','mai','hom nay','mot','h')
    if any(re.search(r'\b'+re.escape(w)+r'\b',folded) for w in time_words) or re.search(r'\d{1,2}[/:]\d',message):
        for field in ('start_at','end_at','requested_date'):
            value=obj.get(field)
            if not isinstance(value,str) or not value:continue
            if field in ('start_at','end_at') and data.get(field) and data.get(field)!=old.get(field):continue
            if field=='end_at' and not (data.get('start_at') or old.get('start_at')):continue
            data[field]=value
    # If AI changes only end time, retain previous start; reject invalid dates.
    candidate=SearchRequest.model_validate(data)
    if candidate.start_at and candidate.end_at:
        candidate.check_window()
    return candidate


def parse_intent(message,history=None,previous=None):
    intent,local,mode=_local_extract(message,previous)
    if intent in ('reset','policy'):return intent,local,mode
    if not os.getenv('OPENAI_API_KEY','').strip():
        logger.warning('UniRoom AI: OPENAI_API_KEY missing; using local parser')
        return intent,local,'local_no_api_key'
    try:
        system=(
            'Bạn là bộ phân tích yêu cầu UniRoom. Chỉ trả JSON object, không trả lời văn bản. '
            'Các trường có thể dùng: intent(search|policy|other), start_at, end_at, requested_date, '
            'min_capacity, building, room_type, room_code, equipment, floor, title, purpose. '
            'Chỉ xuất trường được nói rõ trong tin nhắn HIỆN TẠI; không đoán thông tin còn thiếu. '
            'Nếu chỉ có một giờ bắt đầu thì end_at=null; nếu người dùng nói "đến 10h" thì chỉ điền end_at. '
            'Ngày giờ theo YYYY-MM-DDTHH:MM, requested_date YYYY-MM-DD; múi giờ Việt Nam. '
            'Bối cảnh bộ lọc trước (chỉ để hiểu câu tiếp nối): '+json.dumps(previous or {},ensure_ascii=False,default=str)[:1500]+'. '
            'Ngày giờ hiện tại Việt Nam: '+datetime.now().isoformat(timespec='minutes')
        )
        obj=_openai_chat_json(system,message)
        if obj.get('intent')=='policy':return 'policy',local,'openai+local'
        merged=_merge_ai_fields(local,obj,message,previous)
        return intent,merged,'openai+local'
    except httpx.HTTPStatusError as exc:
        logger.warning('UniRoom AI HTTP status %s; using local parser',exc.response.status_code)
    except (httpx.RequestError,ValueError,KeyError,IndexError,TypeError) as exc:
        logger.warning('UniRoom AI parse failed (%s): %s; using local parser',type(exc).__name__,str(exc)[:150])
    return intent,local,'local_api_error'

POLICY=('UniRoom: chọn phòng và thời gian → gửi yêu cầu → chờ duyệt nếu cần → theo dõi trạng thái. '
        'Lịch đã đặt hoặc bảo trì có thể chặn yêu cầu. AI không tự đặt, hủy hay duyệt booking.')


def _conflict_details(db,req):
    if not req.start_at or not req.end_at:return []
    q=db.query(models.Room).filter(models.Room.status==(req.status or 'ACTIVE'),models.Room.capacity>=req.min_capacity)
    if req.room_code:q=q.filter(models.Room.code.ilike(req.room_code))
    if req.building:q=q.join(models.Room.building).filter(or_(models.Building.name.ilike('%'+req.building+'%'),models.Building.code.ilike('%'+req.building+'%')))
    if req.floor is not None:q=q.filter(models.Room.floor==req.floor)
    results=[]
    for r in q.limit(100).all():
        equipment=[link.equipment.name for link in r.equipment_links]
        if not _type_matches(r,req.room_type) or not _equipment_matches(equipment,req.equipment):continue
        booking=db.query(models.Booking).filter(models.Booking.room_id==r.id,models.Booking.status.in_(BLOCKING),models.Booking.start_at<req.end_at,models.Booking.end_at>req.start_at).first()
        maint=db.query(models.Maintenance).filter(models.Maintenance.room_id==r.id,models.Maintenance.status=='ACTIVE',models.Maintenance.start_at<req.end_at,models.Maintenance.end_at>req.start_at).first()
        occ=db.query(models.BookingOccurrence).join(models.Booking,models.BookingOccurrence.booking_id==models.Booking.id).filter(models.Booking.room_id==r.id,models.Booking.status.in_(BLOCKING),models.BookingOccurrence.status.in_(BLOCKING),models.BookingOccurrence.start_at<req.end_at,models.BookingOccurrence.end_at>req.start_at).first()
        if maint:reason='bảo trì'
        elif booking or occ:reason='đã có lịch đặt'
        else:continue
        results.append({'code':r.code,'reason':reason})
    return results[:5]


def respond(db,message,history=None,previous=None):
    intent,req,mode=parse_intent(message,history,previous)
    if intent=='reset':return {'answer':'Đã bắt đầu tìm kiếm mới. Bạn cần phòng cho bao nhiêu người?','rooms':[],'filters':{},'missing':['min_capacity'],'mode':mode}
    if intent=='policy':return {'answer':POLICY,'rooms':[],'filters':previous or {},'missing':[],'mode':mode}
    if intent=='other':return {'answer':'Mình hỗ trợ tìm phòng, kiểm tra lịch trống và hướng dẫn đặt phòng. Bạn cần hỗ trợ gì?','rooms':[],'filters':previous or {},'missing':[],'mode':mode}
    filters=req.model_dump(mode='json')
    if not req.start_at or not req.end_at:
        if req.start_at:
            answer=f'Mình đã ghi nhận giờ bắt đầu {req.start_at:%H:%M} ngày {req.start_at:%d/%m/%Y}. Bạn muốn sử dụng phòng đến mấy giờ?'
            missing=['end_at']
        elif req.requested_date:
            answer=f'Mình đã ghi nhận ngày {req.requested_date:%d/%m/%Y}. Bạn muốn bắt đầu và kết thúc lúc mấy giờ?'
            missing=['start_at','end_at']
        else:
            answer='Bạn muốn sử dụng phòng vào ngày nào, từ mấy giờ đến mấy giờ?'
            missing=['start_at','end_at']
        return {'answer':answer,'rooms':[],'filters':filters,'missing':missing,'conflicts':[],'mode':mode}
    req.check_window()
    rooms=search_rooms(db,req)
    conflicts=_conflict_details(db,req)
    if conflicts:
        summary='; '.join(x['code']+' ('+x['reason']+')' for x in conflicts[:3])
        answer='Một số phòng không khả dụng trong khung giờ này: '+summary+'. Bạn muốn đổi phòng hay đổi ngày/giờ?'
        if rooms:answer+=' Có '+str(len(rooms))+' phòng thay thế phù hợp bên dưới.'
    elif rooms:
        answer='Tìm thấy '+str(len(rooms))+' phòng trống phù hợp. Chọn “Đặt phòng này” để mở biểu mẫu đã điền sẵn; lịch sẽ được kiểm tra lại khi gửi.'
    else:
        answer='Không tìm thấy phòng còn trống phù hợp với điều kiện và thời gian đã chọn. Bạn muốn đổi thời gian hoặc bộ lọc nào?'
    return {'answer':answer,'rooms':rooms,'filters':filters,'missing':[],'conflicts':conflicts,'mode':mode}
