"""UniRoom AI assistant: OpenAI tool-calling on top of the existing booking logic.

Flow: user message -> OpenAI picks tools -> tools run real SQL / existing
validate_booking + create_booking (so every rule is enforced) -> answer in Vietnamese.
"""
import os
import json
import time
import logging
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import ValidationError
from sqlalchemy import and_, exists, or_
from sqlalchemy.orm import Session, joinedload
from openai import OpenAI, OpenAIError

from . import models, schemas
from .database import get_db
from .main import current_user, create_booking, validate_booking

log = logging.getLogger("uniroom.ai")
router = APIRouter()

OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
OPEN_STATUSES = ["PENDING", "APPROVED", "CHECKED_IN"]
MAX_TOOL_ROUNDS = 6
MAX_HISTORY = 10
MAX_INPUT_CHARS = 1000
PENDING_TTL = 600  # seconds a prepared booking stays confirmable
_PENDING: dict[int, dict] = {}  # user_id -> prepared booking (in-memory, single worker)

WEEKDAYS = ["Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy", "Chủ Nhật"]
FALSE_VALUES = ("false", "0", "no")


# ---------------------------------------------------------------- helpers
def _parse_dt(value: str) -> datetime:
    dt = datetime.fromisoformat(str(value).strip())
    return dt.replace(tzinfo=None)  # app stores naive local time


def _parse_range(start_at: str, end_at: str):
    start, end = _parse_dt(start_at), _parse_dt(end_at)
    if start >= end:
        raise ValueError("Thời gian kết thúc phải sau thời gian bắt đầu")
    return start, end


def _room_by_code(db: Session, code: str) -> models.Room:
    room = db.query(models.Room).filter(models.Room.code.ilike(str(code).strip())).first()
    if not room:
        raise ValueError(f"Không tìm thấy phòng có mã '{code}'")
    return room


def _needs_approval(db: Session) -> bool:
    rule = db.query(models.Rule).filter_by(code="REQUIRE_APPROVAL").first()
    auto = (not rule) or (not rule.enabled) or rule.value.strip().lower() in FALSE_VALUES
    return not auto


def _check_active_limit(db: Session, user):
    rule = db.query(models.Rule).filter_by(code="MAX_ACTIVE_BOOKINGS", enabled=True).first()
    if not rule:
        return
    count = db.query(models.Booking).filter(
        models.Booking.user_id == user.id, models.Booking.status.in_(OPEN_STATUSES)).count()
    if count >= int(rule.value):
        raise HTTPException(400, f"Bạn đã đạt giới hạn {rule.value} booking đang hoạt động")


def _rules_text(db: Session) -> list[str]:
    out = []
    for r in db.query(models.Rule).filter_by(enabled=True).all():
        v = r.value
        if r.code == "MAX_DURATION_HOURS":
            out.append(f"Mỗi lượt đặt tối đa {v} giờ")
        elif r.code == "MAX_ADVANCE_DAYS":
            out.append(f"Chỉ được đặt trước tối đa {v} ngày")
        elif r.code == "MAX_ACTIVE_BOOKINGS":
            out.append(f"Tối đa {v} booking đang hoạt động cùng lúc")
        elif r.code == "CANCELLATION_MIN_HOURS":
            out.append(f"Chỉ được huỷ trước giờ bắt đầu ít nhất {v} giờ")
        elif r.code == "REQUIRE_APPROVAL":
            out.append("Booking cần quản lý duyệt" if v.strip().lower() not in FALSE_VALUES
                       else "Booking được duyệt tự động")
        else:
            out.append(f"{r.code}: {v}")
    return out


def _room_card(r: models.Room) -> dict:
    return {
        "code": r.code, "name": r.name, "building": r.building.name,
        "room_type": r.room_type.name, "capacity": r.capacity, "floor": r.floor,
        "description": r.description,
        "equipment": [f"{l.equipment.name} x{l.quantity}" for l in r.equipment_links],
    }


# ---------------------------------------------------------------- tools
def tool_find_available_rooms(db, user, ctx, start_at, end_at, attendees=1,
                              room_type=None, building=None, equipment=None):
    start, end = _parse_range(start_at, end_at)
    busy = exists().where(and_(
        models.Booking.room_id == models.Room.id,
        models.Booking.status.in_(OPEN_STATUSES),
        models.Booking.start_at < end, models.Booking.end_at > start))
    maint = exists().where(and_(
        models.Maintenance.room_id == models.Room.id,
        models.Maintenance.status == "ACTIVE",
        models.Maintenance.start_at < end, models.Maintenance.end_at > start))

    q = (db.query(models.Room)
         .options(joinedload(models.Room.building), joinedload(models.Room.room_type),
                  joinedload(models.Room.equipment_links).joinedload(models.RoomEquipment.equipment))
         .filter(models.Room.status == "ACTIVE", models.Room.capacity >= int(attendees or 1),
                 ~busy, ~maint))
    if room_type:
        q = q.filter(models.Room.room_type.has(models.RoomType.name.ilike(f"%{room_type}%")))
    if building:
        q = q.filter(models.Room.building.has(or_(
            models.Building.name.ilike(f"%{building}%"), models.Building.code.ilike(f"%{building}%"))))
    for name in (equipment or []):
        q = q.filter(models.Room.equipment_links.any(
            models.RoomEquipment.equipment.has(models.Equipment.name.ilike(f"%{name}%"))))

    rooms = q.order_by(models.Room.capacity, models.Room.code).limit(10).all()
    return {"count": len(rooms),
            "note": "Sắp xếp từ phòng vừa sức chứa nhất. Rỗng nghĩa là không có phòng phù hợp.",
            "rooms": [_room_card(r) for r in rooms]}


def tool_get_room_details(db, user, ctx, room_code):
    room = _room_by_code(db, room_code)
    now = datetime.now()
    horizon = now + timedelta(days=7)
    bookings = (db.query(models.Booking)
                .filter(models.Booking.room_id == room.id, models.Booking.status.in_(OPEN_STATUSES),
                        models.Booking.end_at > now, models.Booking.start_at < horizon)
                .order_by(models.Booking.start_at).all())
    maint = (db.query(models.Maintenance)
             .filter(models.Maintenance.room_id == room.id, models.Maintenance.status == "ACTIVE",
                     models.Maintenance.end_at > now, models.Maintenance.start_at < horizon).all())
    card = _room_card(room)
    card["status"] = room.status
    return {
        "room": card,
        # no user names / titles: other people's bookings are private
        "busy_next_7_days": [{"start": b.start_at.isoformat(), "end": b.end_at.isoformat()} for b in bookings],
        "maintenance_next_7_days": [{"start": m.start_at.isoformat(), "end": m.end_at.isoformat(),
                                     "reason": m.reason} for m in maint],
    }


def tool_get_booking_rules(db, user, ctx):
    return {"rules": _rules_text(db)}


def tool_get_my_bookings(db, user, ctx):
    rows = (db.query(models.Booking).options(joinedload(models.Booking.room))
            .filter(models.Booking.user_id == user.id, models.Booking.status.in_(OPEN_STATUSES),
                    models.Booking.end_at > datetime.now())
            .order_by(models.Booking.start_at).limit(20).all())
    return {"bookings": [{"id": b.id, "room_code": b.room.code, "room": b.room.name, "title": b.title,
                          "start": b.start_at.isoformat(), "end": b.end_at.isoformat(),
                          "attendees": b.attendee_count, "status": b.status} for b in rows]}


def tool_prepare_booking(db, user, ctx, room_code, start_at, end_at, attendee_count, title, purpose=""):
    """Validate everything, write nothing. User must confirm before confirm_booking."""
    room = _room_by_code(db, room_code)
    start, end = _parse_range(start_at, end_at)
    data = {"room_id": room.id, "title": title, "purpose": purpose or "",
            "attendee_count": int(attendee_count), "start_at": start, "end_at": end}
    schemas.BookingIn(**data)                       # field validation (title >= 3 chars, ...)
    validate_booking(db, room.id, start, end, int(attendee_count))  # capacity/duration/advance/conflict/maintenance
    _check_active_limit(db, user)
    _PENDING[user.id] = {"data": data, "expires": time.time() + PENDING_TTL}
    ctx["prepared"] = True
    return {"ok": True, "booked": False,
            "summary": {"room": f"{room.code} - {room.name}", "start": start.isoformat(),
                        "end": end.isoformat(), "attendees": int(attendee_count), "title": title},
            "requires_approval": _needs_approval(db),
            "rules": _rules_text(db),
            "next": "CHƯA đặt. Tóm tắt cho người dùng, nhắc các quy định liên quan và hỏi họ có xác nhận không."}


def tool_confirm_booking(db, user, ctx):
    if ctx.get("prepared"):
        return {"error": "Phải chờ người dùng xác nhận ở tin nhắn tiếp theo, chưa được đặt."}
    pending = _PENDING.get(user.id)
    if not pending or pending["expires"] < time.time():
        _PENDING.pop(user.id, None)
        return {"error": "Không có yêu cầu đặt phòng nào đang chờ xác nhận (hoặc đã hết hạn). Hãy chuẩn bị lại."}
    res = create_booking(schemas.BookingIn(**pending["data"]), user, db)  # re-validates everything
    _PENDING.pop(user.id, None)
    ctx["booking_id"] = res["data"]["id"]
    return {"ok": True, "booked": True, "booking_id": res["data"]["id"], "status": res["data"]["status"]}


TOOL_FUNCS = {
    "find_available_rooms": tool_find_available_rooms,
    "get_room_details": tool_get_room_details,
    "get_booking_rules": tool_get_booking_rules,
    "get_my_bookings": tool_get_my_bookings,
    "prepare_booking": tool_prepare_booking,
    "confirm_booking": tool_confirm_booking,
}

_DT = {"type": "string", "description": "ISO 8601 giờ địa phương, ví dụ 2026-11-15T14:00:00"}
TOOLS = [
    {"type": "function", "function": {
        "name": "find_available_rooms",
        "description": "Tìm phòng TRỐNG (không trùng booking, không bảo trì) trong khoảng thời gian, đủ sức chứa.",
        "parameters": {"type": "object", "properties": {
            "start_at": _DT, "end_at": _DT,
            "attendees": {"type": "integer", "description": "Số người"},
            "room_type": {"type": "string", "description": "Tên loại phòng, ví dụ 'Lab', 'lý thuyết'"},
            "building": {"type": "string", "description": "Tên hoặc mã toà nhà"},
            "equipment": {"type": "array", "items": {"type": "string"},
                          "description": "Thiết bị bắt buộc, ví dụ ['Máy chiếu']"}},
            "required": ["start_at", "end_at"]}}},
    {"type": "function", "function": {
        "name": "get_room_details",
        "description": "Chi tiết một phòng và các khung giờ bận/bảo trì trong 7 ngày tới.",
        "parameters": {"type": "object", "properties": {"room_code": {"type": "string"}},
                       "required": ["room_code"]}}},
    {"type": "function", "function": {
        "name": "get_booking_rules",
        "description": "Quy định đặt phòng hiện hành.",
        "parameters": {"type": "object", "properties": {}}}},
    {"type": "function", "function": {
        "name": "get_my_bookings",
        "description": "Các booking sắp tới của người dùng hiện tại.",
        "parameters": {"type": "object", "properties": {}}}},
    {"type": "function", "function": {
        "name": "prepare_booking",
        "description": "Kiểm tra mọi quy định cho một lượt đặt phòng mà KHÔNG đặt. Gọi trước khi xin xác nhận.",
        "parameters": {"type": "object", "properties": {
            "room_code": {"type": "string"}, "start_at": _DT, "end_at": _DT,
            "attendee_count": {"type": "integer"},
            "title": {"type": "string", "description": "Tiêu đề, tối thiểu 3 ký tự"},
            "purpose": {"type": "string"}},
            "required": ["room_code", "start_at", "end_at", "attendee_count", "title"]}}},
    {"type": "function", "function": {
        "name": "confirm_booking",
        "description": "Đặt phòng đã chuẩn bị. CHỈ gọi sau khi người dùng đã xác nhận rõ ràng ở tin nhắn riêng.",
        "parameters": {"type": "object", "properties": {}}}},
]


def run_tool(db, user, ctx, name, raw_args):
    fn = TOOL_FUNCS.get(name)
    if not fn:
        return {"error": f"Công cụ không tồn tại: {name}"}
    try:
        args = json.loads(raw_args or "{}")
        return fn(db, user, ctx, **args)
    except HTTPException as e:       # business-rule violation from existing validators
        db.rollback()
        return {"error": e.detail}
    except (ValueError, TypeError, ValidationError) as e:
        db.rollback()
        return {"error": f"Dữ liệu không hợp lệ: {e}"}
    except Exception:
        db.rollback()
        log.exception("tool %s failed", name)
        return {"error": "Lỗi hệ thống khi xử lý yêu cầu"}

_INFO = {"t": 0.0, "v": None}

def _static_info(db):
    if _INFO["v"] is None or time.time() - _INFO["t"] > 60:
        _INFO["v"] = (
            [t.name for t in db.query(models.RoomType).all()],
            [f"{b.name} ({b.code})" for b in db.query(models.Building).all()],
            [e.name for e in db.query(models.Equipment).all()],
            "; ".join(_rules_text(db)),
        )
        _INFO["t"] = time.time()
    return _INFO["v"]
# ---------------------------------------------------------------- prompt + LLM loop
def build_system_prompt(db: Session, user) -> str:
    now = datetime.now()
    types, buildings, equip, rules = _static_info(db)
    return f"""Bạn là trợ lý đặt phòng của UniRoom (trường đại học). Luôn trả lời bằng tiếng Việt, ngắn gọn, thân thiện.
Người dùng: {user.full_name}.
Bây giờ là {WEEKDAYS[now.weekday()]}, {now.strftime('%d/%m/%Y %H:%M')} (giờ Việt Nam). Dùng mốc này để đổi "mai", "thứ Hai tuần sau"... thành ngày giờ cụ thể.

Dữ liệu hệ thống: loại phòng: {', '.join(types)}. Toà nhà: {', '.join(buildings)}. Thiết bị: {', '.join(equip)}.
Quy định đặt phòng hiện hành: {'; '.join(_rules_text(db)) or 'không có'}.

Nguyên tắc:
- Chỉ nêu phòng/giờ trống lấy từ công cụ. Không bịa phòng, thiết bị hay lịch.
- Gợi ý phòng phù hợp: ưu tiên phòng vừa sức chứa, đúng loại, đủ thiết bị người dùng cần.
- Thiếu thông tin (ngày, giờ bắt đầu/kết thúc, số người) thì hỏi lại, mỗi lần một câu ngắn.
- Quy trình đặt phòng: thu đủ thông tin (phòng, thời gian, số người, tiêu đề) -> gọi prepare_booking -> tóm tắt và nhắc quy định liên quan (có cần duyệt không, giới hạn huỷ...) và hỏi "Bạn xác nhận đặt chứ?" -> CHỈ khi người dùng đồng ý rõ ràng ở tin nhắn sau mới gọi confirm_booking.
- Không bao giờ gọi prepare_booking và confirm_booking trong cùng một lượt.
- Nếu công cụ trả lỗi vi phạm quy định, giải thích lý do bằng tiếng Việt và đề xuất cách khác (đổi giờ, đổi phòng bằng find_available_rooms).
- Sau khi đặt xong, nói rõ trạng thái: APPROVED = đã được duyệt, PENDING = đang chờ quản lý duyệt.
- Không tiết lộ thông tin cá nhân của người khác. Chỉ hỗ trợ việc liên quan đến phòng học và đặt phòng."""


def load_history(db: Session, conv_id: int) -> list[dict]:
    rows = (db.query(models.AIMessage).filter_by(conversation_id=conv_id)
            .order_by(models.AIMessage.id.desc()).limit(MAX_HISTORY).all())
    return [{"role": m.role, "content": m.content} for m in reversed(rows) if m.role in ("user", "assistant")]


def run_llm(db: Session, user, history: list[dict], question: str, ctx: dict) -> str:
    client = OpenAI(api_key=os.environ["OPENAI_API_KEY"], timeout=30)
    messages = [{"role": "system", "content": build_system_prompt(db, user)}] + history \
               + [{"role": "user", "content": question}]
    for _ in range(MAX_TOOL_ROUNDS):
        resp = client.chat.completions.create(
            model=OPENAI_MODEL, messages=messages, tools=TOOLS, temperature=0.2)
        msg = resp.choices[0].message
        if not msg.tool_calls:
            return (msg.content or "").strip()
        messages.append({
            "role": "assistant", "content": msg.content,
            "tool_calls": [{"id": tc.id, "type": "function",
                            "function": {"name": tc.function.name, "arguments": tc.function.arguments}}
                           for tc in msg.tool_calls]})
        for tc in msg.tool_calls:
            result = run_tool(db, user, ctx, tc.function.name, tc.function.arguments)
            messages.append({"role": "tool", "tool_call_id": tc.id,
                             "content": json.dumps(result, ensure_ascii=False, default=str)})
    return "Mình chưa xử lý xong yêu cầu này, bạn thử diễn đạt lại giúp mình nhé."


# ---------------------------------------------------------------- endpoint
@router.post("/api/ai/chat")
def ai_chat(payload: dict, user=Depends(current_user), db: Session = Depends(get_db)):
    question = str(payload.get("message", "")).strip()[:MAX_INPUT_CHARS]
    if not question:
        raise HTTPException(400, "Vui lòng nhập nội dung")
    if not os.getenv("OPENAI_API_KEY"):
        raise HTTPException(503, "Trợ lý AI chưa được cấu hình (thiếu OPENAI_API_KEY)")

    conv_id = payload.get("conversation_id")
    if conv_id:
        conv = db.query(models.AIConversation).filter_by(id=int(conv_id), user_id=user.id).first()
        if not conv:
            raise HTTPException(404, "Không tìm thấy cuộc trò chuyện")
    else:
        conv = models.AIConversation(user_id=user.id)
        db.add(conv)
        db.flush()

    history = load_history(db, conv.id)
    ctx: dict = {}
    try:
        answer = run_llm(db, user, history, question, ctx)
    except OpenAIError:
        db.rollback()
        log.exception("OpenAI call failed")
        raise HTTPException(502, "Không kết nối được dịch vụ AI, vui lòng thử lại sau")

    db.add(models.AIMessage(conversation_id=conv.id, role="user", content=question))
    db.add(models.AIMessage(conversation_id=conv.id, role="assistant", content=answer))
    db.commit()
    data = {"conversation_id": conv.id, "answer": answer, "mode": "openai"}
    if ctx.get("booking_id"):
        data["booking_id"] = ctx["booking_id"]   # lets the frontend refresh the booking list
    return {"success": True, "data": data}
