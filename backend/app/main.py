import os, io, csv, secrets
from datetime import datetime, timedelta
from typing import Optional
from pathlib import Path
FRONTEND_STATIC = Path(__file__).resolve().parents[2] / "frontend" / "static"
from fastapi import FastAPI, Depends, HTTPException, status, Header
from fastapi.responses import FileResponse, StreamingResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import and_, or_
from .database import Base, engine, get_db
from . import models, schemas
from .security import create_access_token, decode_token, verify_password, hash_password
from .seed import seed_database

app = FastAPI(title="UniRoom API", version="1.0.0", description="UniRoom – UC1 User + shared platform")
Base.metadata.create_all(bind=engine)
with next(get_db()) as db:
    seed_database(db)

app.mount("/static", StaticFiles(directory=str(FRONTEND_STATIC)), name="static")

@app.get("/", response_class=HTMLResponse)
def home():
    return FileResponse(str(FRONTEND_STATIC / "index.html"))

@app.get("/api/health")
def health(db: Session = Depends(get_db)):
    db.execute(__import__("sqlalchemy").text("SELECT 1"))
    return {"success": True, "data": {"database": "connected"}, "message": "UniRoom is running"}

def current_user(authorization: Optional[str] = Header(default=None), db: Session = Depends(get_db)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Bạn cần đăng nhập")
    payload = decode_token(authorization[7:])
    if not payload:
        raise HTTPException(401, "Token không hợp lệ hoặc đã hết hạn")
    user = db.query(models.User).options(joinedload(models.User.role)).filter_by(id=int(payload["sub"])).first()
    if not user or not user.is_active:
        raise HTTPException(401, "Tài khoản không tồn tại hoặc đã bị khoá")
    return user

def require_roles(*roles):
    def checker(user=Depends(current_user)):
        if user.role.name not in roles:
            raise HTTPException(403, "Bạn không có quyền thực hiện chức năng này")
        return user
    return checker

def user_dict(u):
    return {"id":u.id,"full_name":u.full_name,"email":u.email,"phone":u.phone,"role":u.role.name}

def room_dict(r):
    return {"id":r.id,"code":r.code,"name":r.name,"capacity":r.capacity,"floor":r.floor,"description":r.description,
            "status":r.status,"building":r.building.name,"building_id":r.building_id,"room_type":r.room_type.name,
            "room_type_id":r.room_type_id,"equipment":[x.equipment.name for x in r.equipment_links] if hasattr(r,"equipment_links") else []}

def booking_dict(b):
    return {"id":b.id,"room_id":b.room_id,"room":b.room.name,"room_code":b.room.code,"title":b.title,"purpose":b.purpose,
            "attendee_count":b.attendee_count,"start_at":b.start_at.isoformat(),"end_at":b.end_at.isoformat(),"status":b.status,
            "user":b.user.full_name if b.user else ""}

def notify(db, user_id, title, body, typ="BOOKING"):
    db.add(models.Notification(user_id=user_id,title=title,body=body,type=typ))

@app.post("/api/auth/register")
def register(data: schemas.RegisterIn, db: Session = Depends(get_db)):
    email = data.email.lower()
    if db.query(models.User).filter_by(email=email).first():
        raise HTTPException(409, "Email đã được sử dụng")
    role = db.query(models.Role).filter_by(name="USER").one()
    user = models.User(full_name=data.full_name, email=email, password_hash=hash_password(data.password), role_id=role.id)
    db.add(user); db.commit(); db.refresh(user)
    user = db.query(models.User).options(joinedload(models.User.role)).get(user.id)
    token = create_access_token(str(user.id), user.role.name)
    return {"success":True,"data":{"access_token":token,"token_type":"bearer","user":user_dict(user)},"message":"Đăng ký thành công"}

@app.post("/api/auth/login")
def login(data: schemas.LoginIn, db: Session = Depends(get_db)):
    user = db.query(models.User).options(joinedload(models.User.role)).filter_by(email=data.email.lower()).first()
    if not user or not verify_password(data.password, user.password_hash):
        raise HTTPException(401, "Email hoặc mật khẩu không chính xác")
    if not user.is_active:
        raise HTTPException(403, "Tài khoản đã bị khoá")
    token = create_access_token(str(user.id), user.role.name)
    return {"success":True,"data":{"access_token":token,"token_type":"bearer","user":user_dict(user)},"message":"Đăng nhập thành công"}

@app.post("/api/auth/forgot-password")
def forgot_password(payload: dict, db: Session = Depends(get_db)):
    # Demo/local flow: return a short-lived signed reset token. Production should email this link.
    email = str(payload.get("email", "")).lower().strip()
    user = db.query(models.User).options(joinedload(models.User.role)).filter_by(email=email).first()
    if not user:
        # Avoid exposing whether an account exists.
        return {"success": True, "message": "Nếu email tồn tại, hướng dẫn đặt lại mật khẩu sẽ được gửi."}
    from datetime import timezone
    from jose import jwt
    from .security import SECRET_KEY, ALGORITHM
    reset_token = jwt.encode({"sub": str(user.id), "purpose": "password_reset", "exp": datetime.utcnow() + timedelta(minutes=15)}, SECRET_KEY, algorithm=ALGORITHM)
    return {"success": True, "data": {"reset_token": reset_token}, "message": "Chế độ local: dùng reset_token để đặt lại mật khẩu. Khi triển khai thật, gửi token qua email."}

@app.post("/api/auth/reset-password")
def reset_password(payload: dict, db: Session = Depends(get_db)):
    from jose import jwt, JWTError
    from .security import SECRET_KEY, ALGORITHM
    try:
        data = jwt.decode(payload.get("token", ""), SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        raise HTTPException(400, "Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn")
    new_password = str(payload.get("new_password", ""))
    if data.get("purpose") != "password_reset" or len(new_password) < 8:
        raise HTTPException(400, "Yêu cầu đặt lại mật khẩu không hợp lệ")
    user = db.query(models.User).filter_by(id=int(data["sub"])).first()
    if not user: raise HTTPException(404, "Không tìm thấy tài khoản")
    user.password_hash = hash_password(new_password); db.commit()
    return {"success": True, "message": "Đặt lại mật khẩu thành công"}

@app.post("/api/auth/logout")
def logout(user=Depends(current_user)):
    return {"success":True,"data":None,"message":"Đã đăng xuất. Token được xoá ở trình duyệt."}

@app.get("/api/users/me")
def get_me(user=Depends(current_user)):
    return {"success":True,"data":user_dict(user)}

@app.patch("/api/users/me")
def update_me(data: schemas.ProfileUpdate, user=Depends(current_user), db: Session=Depends(get_db)):
    user.full_name=data.full_name; user.phone=data.phone
    db.commit(); db.refresh(user)
    return {"success":True,"data":user_dict(user),"message":"Đã cập nhật hồ sơ"}

@app.post("/api/users/me/change-password")
def change_password(payload: dict, user=Depends(current_user), db: Session=Depends(get_db)):
    if not verify_password(payload.get("current_password",""), user.password_hash):
        raise HTTPException(400,"Mật khẩu hiện tại không đúng")
    new = payload.get("new_password","")
    if len(new)<8: raise HTTPException(400,"Mật khẩu mới tối thiểu 8 ký tự")
    user.password_hash=hash_password(new); db.commit()
    return {"success":True,"message":"Đổi mật khẩu thành công"}

@app.get("/api/rooms")
def list_rooms(q:str="", building_id:int|None=None, room_type_id:int|None=None, min_capacity:int=1, db:Session=Depends(get_db)):
    query=db.query(models.Room).options(joinedload(models.Room.building),joinedload(models.Room.room_type)).filter(models.Room.status=="ACTIVE",models.Room.capacity>=min_capacity)
    if q: query=query.filter(or_(models.Room.name.ilike(f"%{q}%"),models.Room.code.ilike(f"%{q}%")))
    if building_id: query=query.filter(models.Room.building_id==building_id)
    if room_type_id: query=query.filter(models.Room.room_type_id==room_type_id)
    rooms=query.order_by(models.Room.code).all()
    data=[room_dict(r) for r in rooms]
    return {"success":True,"data":data,"message":"Danh sách phòng"}

@app.get("/api/rooms/meta")
def room_meta(db:Session=Depends(get_db)):
    return {"success":True,"data":{"buildings":[{"id":x.id,"name":x.name} for x in db.query(models.Building).all()],
        "room_types":[{"id":x.id,"name":x.name} for x in db.query(models.RoomType).all()]}}

@app.get("/api/rooms/{room_id}")
def room_detail(room_id:int, db:Session=Depends(get_db)):
    r=db.query(models.Room).options(joinedload(models.Room.building),joinedload(models.Room.room_type)).filter_by(id=room_id).first()
    if not r: raise HTTPException(404,"Không tìm thấy phòng")
    return {"success":True,"data":room_dict(r)}

def validate_booking(db, room_id, start, end, attendees, exclude_id=None):
    if start >= end: raise HTTPException(400,"Thời gian kết thúc phải sau thời gian bắt đầu")
    if start < datetime.now(): raise HTTPException(400,"Không thể đặt phòng trong quá khứ")
    room=db.query(models.Room).filter_by(id=room_id).first()
    if not room: raise HTTPException(404, "Không tìm thấy phòng")
    if room.status not in ("ACTIVE", "MAINTENANCE"):
        raise HTTPException(400, "Phòng đang ngừng hoạt động")
    if attendees > room.capacity: raise HTTPException(400,f"Số người vượt sức chứa ({room.capacity})")
    rules={r.code:r for r in db.query(models.Rule).filter_by(enabled=True).all()}
    max_rule=rules.get("MAX_DURATION_HOURS")
    if max_rule and (end-start).total_seconds()>int(max_rule.value)*3600:
        raise HTTPException(400,f"Thời lượng đặt tối đa {max_rule.value} giờ")
    advance_rule=rules.get("MAX_ADVANCE_DAYS")
    if advance_rule and start > datetime.now()+timedelta(days=int(advance_rule.value)):
        raise HTTPException(400,f"Chỉ được đặt trước tối đa {advance_rule.value} ngày")
    conflict=db.query(models.Booking).filter(models.Booking.room_id==room_id,models.Booking.status.in_(["PENDING","APPROVED","CHECKED_IN"]),
        models.Booking.start_at<end,models.Booking.end_at>start)
    if exclude_id: conflict=conflict.filter(models.Booking.id!=exclude_id)
    if conflict.first(): raise HTTPException(409,"Phòng đã có booking giao với khoảng thời gian này")
    maintenance=db.query(models.Maintenance).filter(models.Maintenance.room_id==room_id,models.Maintenance.status=="ACTIVE",
        models.Maintenance.start_at<end,models.Maintenance.end_at>start).first()
    if maintenance:
        raise HTTPException(409, f"Không thể đặt phòng {room.code}: trùng lịch bảo trì từ {maintenance.start_at.strftime('%d/%m/%Y %H:%M')} đến {maintenance.end_at.strftime('%d/%m/%Y %H:%M')}. Lý do: {maintenance.reason}")
    return room

@app.post("/api/bookings")
def create_booking(data:schemas.BookingIn, user=Depends(require_roles("USER","ROOM_MANAGER","ADMIN")), db:Session=Depends(get_db)):
    room=validate_booking(db,data.room_id,data.start_at,data.end_at,data.attendee_count)
    limit_rule=db.query(models.Rule).filter_by(code="MAX_ACTIVE_BOOKINGS",enabled=True).first()
    if limit_rule:
        active_count=db.query(models.Booking).filter(models.Booking.user_id==user.id,
            models.Booking.status.in_(["PENDING","APPROVED","CHECKED_IN"])).count()
        if active_count>=int(limit_rule.value):
            raise HTTPException(400,f"Bạn đã đạt giới hạn {limit_rule.value} booking đang hoạt động")
    approval=db.query(models.Rule).filter_by(code="REQUIRE_APPROVAL").first()
    auto_approve=(not approval) or (not approval.enabled) or approval.value.strip().lower() in ("false","0","no")
    b=models.Booking(user_id=user.id,room_id=room.id,title=data.title,purpose=data.purpose,attendee_count=data.attendee_count,
        start_at=data.start_at,end_at=data.end_at,status="APPROVED" if auto_approve else "PENDING")
    db.add(b); db.flush()
    for entry in db.query(models.WaitlistEntry).filter(
        models.WaitlistEntry.user_id == user.id, models.WaitlistEntry.room_id == room.id,
        models.WaitlistEntry.status.in_(["WAITING", "NOTIFIED"]),
        models.WaitlistEntry.start_at < data.end_at,
        models.WaitlistEntry.end_at > data.start_at).all():
        entry.status = "FULFILLED"
    notify(db,user.id,"Đã nhận yêu cầu đặt phòng",f"Yêu cầu {b.title} đã được xác nhận." if auto_approve else f"Yêu cầu {b.title} đang chờ quản lý duyệt.")
    db.commit(); db.refresh(b)
    return {"success":True,"data":{"id":b.id,"status":b.status},"message":"Đặt phòng thành công, đang chờ duyệt"}

@app.post("/api/bookings/recurring")
def create_recurring_booking(payload: dict, user=Depends(current_user), db: Session = Depends(get_db)):
    # Weekly recurrence. Validate every occurrence before writing any booking.
    try:
        room_id = int(payload["room_id"]); title = str(payload["title"]); purpose = str(payload.get("purpose", ""))
        attendees = int(payload.get("attendee_count", 1)); start = datetime.fromisoformat(payload["start_at"]); end = datetime.fromisoformat(payload["end_at"])
        count = int(payload.get("occurrences", 4))
    except Exception:
        raise HTTPException(400, "Dữ liệu lịch định kỳ không hợp lệ")
    if count < 2 or count > 12: raise HTTPException(400, "Số lần lặp phải từ 2 đến 12")
    duration = end - start
    if duration.total_seconds() <= 0: raise HTTPException(400, "Khoảng thời gian không hợp lệ")
    items=[]
    for i in range(count):
        st=start+timedelta(days=7*i); en=st+duration
        room=validate_booking(db, room_id, st, en, attendees)
        items.append(models.Booking(user_id=user.id,room_id=room.id,title=title,purpose=purpose,attendee_count=attendees,start_at=st,end_at=en,status="PENDING"))
    db.add_all(items); db.flush()
    for b in items:
        db.add(models.BookingOccurrence(booking_id=b.id,start_at=b.start_at,end_at=b.end_at,status="PENDING"))
        notify(db,user.id,"Đã nhận yêu cầu đặt phòng định kỳ",f"{b.title} – {b.start_at:%d/%m/%Y %H:%M}")
    db.commit()
    return {"success":True,"data":{"booking_ids":[b.id for b in items]},"message":f"Đã tạo {len(items)} yêu cầu đặt phòng định kỳ"}

@app.get("/api/bookings/me")
def my_bookings(user=Depends(current_user), db:Session=Depends(get_db)):
    items=db.query(models.Booking).options(joinedload(models.Booking.room),joinedload(models.Booking.user)).filter_by(user_id=user.id).order_by(models.Booking.start_at.desc()).all()
    return {"success":True,"data":[booking_dict(x) for x in items]}

@app.patch("/api/bookings/{booking_id}")
def update_booking(booking_id:int,data:schemas.BookingIn,user=Depends(current_user),db:Session=Depends(get_db)):
    b=db.query(models.Booking).filter_by(id=booking_id,user_id=user.id).first()
    if not b: raise HTTPException(404,"Không tìm thấy booking")
    if b.status!="PENDING": raise HTTPException(400,"Chỉ được sửa booking đang chờ duyệt")
    validate_booking(db,data.room_id,data.start_at,data.end_at,data.attendee_count,booking_id)
    b.room_id=data.room_id;b.title=data.title;b.purpose=data.purpose;b.attendee_count=data.attendee_count;b.start_at=data.start_at;b.end_at=data.end_at
    db.commit()
    return {"success":True,"message":"Đã cập nhật booking"}

@app.delete("/api/bookings/{booking_id}")
def cancel_booking(booking_id:int,user=Depends(current_user),db:Session=Depends(get_db)):
    b=db.query(models.Booking).filter_by(id=booking_id,user_id=user.id).first()
    if not b: raise HTTPException(404,"Không tìm thấy booking")
    if b.status in ["CANCELLED","COMPLETED"]: raise HTTPException(400,"Booking không thể huỷ")
    cancel_rule=db.query(models.Rule).filter_by(code="CANCELLATION_MIN_HOURS",enabled=True).first()
    if cancel_rule:
        hours=(b.start_at-datetime.now()).total_seconds()/3600
        if hours < int(cancel_rule.value):
            raise HTTPException(400,f"Chỉ được tự huỷ trước giờ bắt đầu ít nhất {cancel_rule.value} giờ")
    b.status="CANCELLED"
    notify_waitlist_available(db, b.room_id)
    db.commit()
    return {"success":True,"message":"Đã huỷ booking"}

@app.get("/api/calendar/me")
def calendar_me(user=Depends(current_user),db:Session=Depends(get_db)):
    query=db.query(models.Booking).options(joinedload(models.Booking.room),joinedload(models.Booking.user))
    if user.role.name == "USER":
        query=query.filter_by(user_id=user.id)
    elif user.role.name == "ROOM_MANAGER":
        assigned=[x.room_id for x in db.query(models.RoomManagerAssignment).filter_by(manager_id=user.id).all()]
        query=query.filter(models.Booking.room_id.in_(assigned)) if assigned else query.filter(models.Booking.id==-1)
    query=query.filter(models.Booking.status != "CANCELLED")
    # REJECTED chỉ hiện trong 120 giây tính từ thời điểm Admin/Manager từ chối.
    # DB lưu thời gian UTC (datetime.utcnow), nên so sánh bằng UTC để tránh lệch múi giờ.
    rows=query.order_by(models.Booking.start_at).all()
    now_utc = datetime.utcnow()
    result = []
    for b in rows:
        show_status = True
        if b.status in ("REJECTED", "APPROVED"):
            approval = (db.query(models.BookingApproval)
                        .filter_by(booking_id=b.id, decision=b.status)
                        .order_by(models.BookingApproval.decided_at.desc()).first())
            # Auto-approved bookings do not have an approval record; use creation time.
            changed_at = approval.decided_at if approval else (b.created_at if b.status == "APPROVED" else None)
            age = now_utc - changed_at if changed_at else timedelta(days=1)
            if b.status == "REJECTED" and not (timedelta(0) <= age < timedelta(minutes=2)):
                continue
            if b.status == "APPROVED":
                show_status = timedelta(0) <= age < timedelta(minutes=2)
        elif b.status == "CHECKED_IN":
            checkin = db.query(models.CheckIn).filter_by(booking_id=b.id).first()
            age = now_utc - checkin.check_in_at if checkin and checkin.check_in_at else timedelta(days=1)
            show_status = timedelta(0) <= age < timedelta(minutes=2)
        # Không ghép trạng thái vào tiêu đề; chỉ render thành badge riêng.
        result.append({"title": f"{b.room.code} – {b.title}" + (f" · {b.user.full_name}" if user.role.name != "USER" else ""),
                       "start": b.start_at.isoformat(), "end": b.end_at.isoformat(),
                       "status": b.status, "show_status": show_status})
    # Lịch bảo trì hiển thị rõ ràng cho các vai trò được phép xem phòng.
    maintenance_query = db.query(models.Maintenance).filter(models.Maintenance.status == "ACTIVE")
    if user.role.name == "ROOM_MANAGER":
        maintenance_query = maintenance_query.filter(models.Maintenance.room_id.in_(assigned))
    for item in maintenance_query.all():
        result.append({"title": f"{db.query(models.Room).filter_by(id=item.room_id).first().code} – Bảo trì: {item.reason}",
                       "start": item.start_at.isoformat(), "end": item.end_at.isoformat(),
                       "status": "MAINTENANCE", "show_status": True})
    return {"success": True, "data": result}

@app.get("/api/notifications/me")
def notifications(user=Depends(current_user),db:Session=Depends(get_db)):
    rows=db.query(models.Notification).filter_by(user_id=user.id).order_by(models.Notification.created_at.desc()).limit(100).all()
    return {"success":True,"data":[{"id":n.id,"title":n.title,"body":n.body,"type":n.type,"read":bool(n.read_at),"created_at":n.created_at.isoformat()} for n in rows]}

@app.patch("/api/notifications/{notification_id}/read")
def read_notification(notification_id:int,user=Depends(current_user),db:Session=Depends(get_db)):
    n=db.query(models.Notification).filter_by(id=notification_id,user_id=user.id).first()
    if not n: raise HTTPException(404,"Không tìm thấy thông báo")
    n.read_at=datetime.utcnow();db.commit()
    return {"success":True,"message":"Đã đánh dấu đã đọc"}

# Waitlist does not reserve the room. FIFO notification, with availability rechecked on booking.
def waitlist_payload(entry, db):
    room = db.query(models.Room).filter_by(id=entry.room_id).first()
    return {"id": entry.id, "room_id": entry.room_id, "room_code": room.code if room else "?",
            "user_id": entry.user_id, "start_at": entry.start_at.isoformat(),
            "end_at": entry.end_at.isoformat(), "status": entry.status,
            "created_at": entry.created_at.isoformat()}

def notify_waitlist_available(db, room_id):
    now = datetime.utcnow()
    waiting = db.query(models.WaitlistEntry).filter_by(room_id=room_id, status="WAITING").order_by(
        models.WaitlistEntry.created_at, models.WaitlistEntry.id).all()
    for entry in waiting:
        if entry.start_at <= now:
            entry.status = "EXPIRED"
            continue
        overlap = db.query(models.Booking.id).filter(
            models.Booking.room_id == room_id,
            models.Booking.status.in_(["PENDING", "APPROVED", "CHECKED_IN"]),
            models.Booking.start_at < entry.end_at,
            models.Booking.end_at > entry.start_at).first()
        maintenance = db.query(models.Maintenance.id).filter(
            models.Maintenance.room_id == room_id, models.Maintenance.status == "ACTIVE",
            models.Maintenance.start_at < entry.end_at,
            models.Maintenance.end_at > entry.start_at).first()
        if not overlap and not maintenance:
            entry.status = "NOTIFIED"
            room = db.query(models.Room).filter_by(id=room_id).first()
            notify(db, entry.user_id, "Waitlist: phòng đã có thể đặt",
                   f"Phòng {room.code if room else room_id} có khung giờ trống từ "
                   f"{entry.start_at:%d/%m/%Y %H:%M} đến {entry.end_at:%H:%M}. "
                   "Vào Theo dõi đặt phòng để đặt lại. Không tự động giữ chỗ.", "WAITLIST")
            # FIFO: notify one person per freed interval, not every competing waiter.
            break

@app.post("/api/waitlist")
def join_waitlist(data: schemas.BookingIn, user=Depends(require_roles("USER")), db: Session=Depends(get_db)):
    now = datetime.utcnow()
    if data.start_at >= data.end_at or data.start_at <= now:
        raise HTTPException(400, "Khoảng thời gian chờ không hợp lệ hoặc đã qua")
    room = db.query(models.Room).filter_by(id=data.room_id).first()
    if not room: raise HTTPException(404, "Không tìm thấy phòng")
    maintenance = db.query(models.Maintenance.id).filter(
        models.Maintenance.room_id == data.room_id, models.Maintenance.status == "ACTIVE",
        models.Maintenance.start_at < data.end_at, models.Maintenance.end_at > data.start_at).first()
    if maintenance: raise HTTPException(409, "Phòng có lịch bảo trì; không thể đăng ký chờ khoảng thời gian này")
    conflict = db.query(models.Booking.id).filter(
        models.Booking.room_id == data.room_id,
        models.Booking.status.in_(["PENDING", "APPROVED", "CHECKED_IN"]),
        models.Booking.start_at < data.end_at, models.Booking.end_at > data.start_at).first()
    if not conflict: raise HTTPException(400, "Phòng hiện chưa bị trùng lịch; vui lòng đặt phòng trực tiếp")
    duplicate = db.query(models.WaitlistEntry.id).filter(
        models.WaitlistEntry.user_id == user.id, models.WaitlistEntry.room_id == data.room_id,
        models.WaitlistEntry.start_at == data.start_at, models.WaitlistEntry.end_at == data.end_at,
        models.WaitlistEntry.status.in_(["WAITING", "NOTIFIED"])).first()
    if duplicate: raise HTTPException(409, "Bạn đã đăng ký chờ khung giờ này")
    entry = models.WaitlistEntry(user_id=user.id, room_id=data.room_id,
                                 start_at=data.start_at, end_at=data.end_at, status="WAITING")
    db.add(entry); db.commit(); db.refresh(entry)
    return {"success": True, "data": waitlist_payload(entry, db), "message": "Đã tham gia danh sách chờ"}

@app.get("/api/waitlist/me")
def my_waitlist(user=Depends(current_user), db: Session=Depends(get_db)):
    rows = db.query(models.WaitlistEntry).filter_by(user_id=user.id).order_by(
        models.WaitlistEntry.created_at.desc()).all()
    return {"success": True, "data": [waitlist_payload(x, db) for x in rows]}

@app.delete("/api/waitlist/{entry_id}")
def leave_waitlist(entry_id: int, user=Depends(current_user), db: Session=Depends(get_db)):
    entry = db.query(models.WaitlistEntry).filter_by(id=entry_id, user_id=user.id).first()
    if not entry: raise HTTPException(404, "Không tìm thấy yêu cầu chờ")
    if entry.status not in ("WAITING", "NOTIFIED"):
        raise HTTPException(400, "Yêu cầu chờ này không còn hiệu lực")
    entry.status = "CANCELLED"
    db.commit()
    return {"success": True, "message": "Đã rời danh sách chờ"}

@app.get("/api/manager/waitlist")
def manager_waitlist(user=Depends(require_roles("ROOM_MANAGER", "ADMIN")), db: Session=Depends(get_db)):
    query = db.query(models.WaitlistEntry)
    if user.role.name == "ROOM_MANAGER":
        ids = [x.room_id for x in db.query(models.RoomManagerAssignment).filter_by(manager_id=user.id).all()]
        query = query.filter(models.WaitlistEntry.room_id.in_(ids))
    rows = query.order_by(models.WaitlistEntry.created_at, models.WaitlistEntry.id).all()
    result = []
    for entry in rows:
        item = waitlist_payload(entry, db)
        person = db.query(models.User).filter_by(id=entry.user_id).first()
        item["user"] = person.full_name if person else "?"
        result.append(item)
    return {"success": True, "data": result}

@app.post("/api/bookings/{booking_id}/check-in")
def check_in(booking_id:int,user=Depends(current_user),db:Session=Depends(get_db)):
    b=db.query(models.Booking).filter_by(id=booking_id,user_id=user.id).first()
    if not b or b.status!="APPROVED": raise HTTPException(400,"Booking chưa được duyệt hoặc không hợp lệ")
    row=db.query(models.CheckIn).filter_by(booking_id=b.id).first()
    if not row:
        row=models.CheckIn(booking_id=b.id,qr_token=secrets.token_urlsafe(24));db.add(row);db.flush()
    row.check_in_at=datetime.utcnow();b.status="CHECKED_IN";db.commit()
    return {"success":True,"data":{"qr_token":row.qr_token,"check_in_at":row.check_in_at.isoformat()},"message":"Check-in thành công"}

@app.post("/api/bookings/{booking_id}/check-out")
def check_out(booking_id:int,user=Depends(current_user),db:Session=Depends(get_db)):
    b=db.query(models.Booking).filter_by(id=booking_id,user_id=user.id).first()
    if not b or b.status!="CHECKED_IN": raise HTTPException(400,"Booking chưa check-in")
    row=db.query(models.CheckIn).filter_by(booking_id=b.id).first()
    row.check_out_at=datetime.utcnow();b.status="COMPLETED";db.commit()
    return {"success":True,"message":"Check-out thành công"}

@app.get("/api/bookings/{booking_id}/qr")
def booking_qr(booking_id:int,user=Depends(current_user),db:Session=Depends(get_db)):
    b=db.query(models.Booking).filter_by(id=booking_id,user_id=user.id).first()
    if not b: raise HTTPException(404,"Không tìm thấy booking")
    from .qr_utils import qr_png
    row=db.query(models.CheckIn).filter_by(booking_id=b.id).first()
    if not row:
        row=models.CheckIn(booking_id=b.id,qr_token=secrets.token_urlsafe(24));db.add(row);db.commit()
    return StreamingResponse(io.BytesIO(qr_png(row.qr_token)),media_type="image/png")

@app.post("/api/ai/chat")
def ai_chat(payload:dict,user=Depends(current_user),db:Session=Depends(get_db)):
    question=str(payload.get("message","")).strip()
    if not question: raise HTTPException(400,"Vui lòng nhập nội dung")
    conv=models.AIConversation(user_id=user.id);db.add(conv);db.flush()
    db.add(models.AIMessage(conversation_id=conv.id,role="user",content=question))
    # Safe local fallback: assistant uses actual room catalogue; no external API key required.
    rooms=db.query(models.Room).filter_by(status="ACTIVE").all()
    answer="Mình có thể hỗ trợ bạn tìm phòng, đặt lịch và giải thích quy trình. "
    if "lab" in question.lower():
        labs=[r for r in rooms if "lab" in r.name.lower() or "lab" in r.code.lower()]
        answer += "Các phòng Lab hiện có: " + (", ".join(r.code for r in labs) if labs else "chưa có dữ liệu") + "."
    else:
        answer += "Bạn hãy cho biết ngày, giờ, số người và thiết bị cần dùng để mình gợi ý chính xác hơn."
    db.add(models.AIMessage(conversation_id=conv.id,role="assistant",content=answer));db.commit()
    return {"success":True,"data":{"conversation_id":conv.id,"answer":answer,"mode":"local-fallback"}}

@app.get("/api/calendar/export.csv")
def export_csv(user=Depends(current_user),db:Session=Depends(get_db)):
    query=db.query(models.Booking).options(joinedload(models.Booking.room),joinedload(models.Booking.user))
    if user.role.name == "USER": query=query.filter_by(user_id=user.id)
    elif user.role.name == "ROOM_MANAGER":
        assigned=[x.room_id for x in db.query(models.RoomManagerAssignment).filter_by(manager_id=user.id).all()]
        query=query.filter(models.Booking.room_id.in_(assigned)) if assigned else query.filter(models.Booking.id==-1)
    rows=query.order_by(models.Booking.start_at).all()
    out=io.StringIO();w=csv.writer(out);w.writerow(["ID","Người đặt","Phòng","Tiêu đề","Bắt đầu","Kết thúc","Trạng thái"])
    for b in rows:w.writerow([b.id,b.user.full_name,b.room.code,b.title,b.start_at,b.end_at,b.status])
    return StreamingResponse(iter([out.getvalue().encode("utf-8-sig")]),media_type="text/csv",headers={"Content-Disposition":"attachment; filename=uniroom-calendar.csv"})

@app.get("/api/calendar/export.pdf")
def export_pdf(user=Depends(current_user),db:Session=Depends(get_db)):
    from reportlab.lib.pagesizes import A4
    from reportlab.pdfgen import canvas
    from reportlab.pdfbase.ttfonts import TTFont
    from reportlab.pdfbase import pdfmetrics
    from reportlab.lib import colors
    query=db.query(models.Booking).options(joinedload(models.Booking.room),joinedload(models.Booking.user))
    if user.role.name == "USER": query=query.filter_by(user_id=user.id)
    elif user.role.name == "ROOM_MANAGER":
        assigned=[x.room_id for x in db.query(models.RoomManagerAssignment).filter_by(manager_id=user.id).all()]
        query=query.filter(models.Booking.room_id.in_(assigned)) if assigned else query.filter(models.Booking.id==-1)
    rows=query.order_by(models.Booking.start_at).all()
    buf=io.BytesIO(); c=canvas.Canvas(buf,pagesize=A4); width,height=A4
    c.setFont("Helvetica-Bold",16);c.drawString(45,height-50,"UniRoom – Booking calendar overview")
    c.setFont("Helvetica",9); y=height-85
    for b in rows:
        line=f"{b.user.full_name[:20]} | {b.room.code} | {b.title[:25]} | {b.start_at:%Y-%m-%d %H:%M} - {b.end_at:%H:%M} | {b.status}"
        c.drawString(45,y,line);y-=18
        if y<50:c.showPage();y=height-50;c.setFont("Helvetica",9)
    c.save();buf.seek(0)
    return StreamingResponse(buf,media_type="application/pdf",headers={"Content-Disposition":"attachment; filename=uniroom-calendar.pdf"})

@app.get("/api/manager/bookings")
def manager_bookings(user=Depends(require_roles("ROOM_MANAGER","ADMIN")),db:Session=Depends(get_db)):
    assigned_ids=[x.room_id for x in db.query(models.RoomManagerAssignment).filter_by(manager_id=user.id).all()]
    query=db.query(models.Booking).options(joinedload(models.Booking.room),joinedload(models.Booking.user)).filter_by(status="PENDING")
    if user.role.name == "ROOM_MANAGER": query=query.filter(models.Booking.room_id.in_(assigned_ids)) if assigned_ids else query.filter(models.Booking.id == -1)
    rows=query.order_by(models.Booking.created_at).all()
    return {"success":True,"data":[booking_dict(b) for b in rows]}

@app.post("/api/manager/bookings/{booking_id}/decision")
def decide_booking(booking_id:int,payload:dict,user=Depends(require_roles("ROOM_MANAGER","ADMIN")),db:Session=Depends(get_db)):
    b=db.query(models.Booking).options(joinedload(models.Booking.user),joinedload(models.Booking.room)).filter_by(id=booking_id).first()
    if not b:raise HTTPException(404,"Không tìm thấy booking")
    if user.role.name == "ROOM_MANAGER" and not db.query(models.RoomManagerAssignment).filter_by(manager_id=user.id, room_id=b.room_id).first():
        raise HTTPException(403,"Bạn không được phân công quản lý phòng này")
    decision=payload.get("decision")
    if decision not in ["APPROVED","REJECTED"]:raise HTTPException(400,"Quyết định không hợp lệ")
    if b.status!="PENDING":raise HTTPException(400,"Booking đã được xử lý")
    if decision=="APPROVED":
        # Re-check conflict at approval time.
        conflict=db.query(models.Booking).filter(models.Booking.id!=b.id,models.Booking.room_id==b.room_id,
            models.Booking.status.in_(["APPROVED","CHECKED_IN"]),models.Booking.start_at<b.end_at,models.Booking.end_at>b.start_at).first()
        if conflict:raise HTTPException(409,"Lịch đã phát sinh xung đột, không thể duyệt")
    b.status=decision
    if decision == "REJECTED": notify_waitlist_available(db, b.room_id)
    db.add(models.BookingApproval(booking_id=b.id,reviewer_id=user.id,decision=decision,note=payload.get("note","")))
    notify(db,b.user_id,"Booking đã được cập nhật",f"{b.room.code}: {decision}. {payload.get('note','')}")
    db.commit()
    return {"success":True,"message":f"Đã {('duyệt' if decision=='APPROVED' else 'từ chối')} booking"}

@app.post("/api/manager/rooms")
def create_room(data:schemas.RoomCreate,user=Depends(require_roles("ROOM_MANAGER","ADMIN")),db:Session=Depends(get_db)):
    if db.query(models.Room).filter_by(code=data.code).first():raise HTTPException(409,"Mã phòng đã tồn tại")
    r=models.Room(**data.model_dump());db.add(r);db.flush()
    if user.role.name == "ROOM_MANAGER": db.add(models.RoomManagerAssignment(manager_id=user.id, room_id=r.id))
    db.commit();db.refresh(r)
    return {"success":True,"data":{"id":r.id},"message":"Đã tạo phòng"}

@app.get("/api/admin/summary")
def admin_summary(user=Depends(require_roles("ADMIN")),db:Session=Depends(get_db)):
    return {"success":True,"data":{"users":db.query(models.User).count(),"rooms":db.query(models.Room).count(),
        "bookings":db.query(models.Booking).count(),"pending":db.query(models.Booking).filter_by(status="PENDING").count()}}

@app.get("/api/admin/rules")
def get_rules(user=Depends(require_roles("ADMIN")),db:Session=Depends(get_db)):
    return {"success":True,"data":[{"id":r.id,"code":r.code,"value":r.value,"enabled":r.enabled} for r in db.query(models.Rule).all()]}

@app.patch("/api/admin/rules/{rule_id}")
def update_rule(rule_id:int,payload:dict,user=Depends(require_roles("ADMIN")),db:Session=Depends(get_db)):
    r=db.query(models.Rule).filter_by(id=rule_id).first()
    if not r:raise HTTPException(404,"Không tìm thấy quy tắc")
    r.value=str(payload.get("value",r.value)); enabled=payload.get("enabled",r.enabled)
    r.enabled=enabled if isinstance(enabled,bool) else str(enabled).lower() in ("true","1","yes","on");db.commit()
    return {"success":True,"message":"Đã cập nhật quy tắc"}


# ---------------------------------------------------------------------------
# Unified administration API (migrated from BQK Django admin workflow)
# All operations use the existing FastAPI authentication and SQLAlchemy DB.
# ---------------------------------------------------------------------------
from sqlalchemy import func

@app.get("/api/admin/users")
def admin_users(q: str = "", role: str = "", user=Depends(require_roles("ADMIN")), db: Session = Depends(get_db)):
    query = db.query(models.User).options(joinedload(models.User.role))
    if q:
        query = query.filter(or_(models.User.full_name.ilike(f"%{q}%"), models.User.email.ilike(f"%{q}%")))
    if role:
        query = query.join(models.Role).filter(models.Role.name == role)
    rows = query.order_by(models.User.created_at.desc()).all()
    return {"success": True, "data": [{**user_dict(x), "is_active": x.is_active, "created_at": x.created_at.isoformat()} for x in rows]}

@app.patch("/api/admin/users/{user_id}")
def admin_update_user(user_id: int, payload: dict, user=Depends(require_roles("ADMIN")), db: Session = Depends(get_db)):
    target = db.query(models.User).options(joinedload(models.User.role)).filter_by(id=user_id).first()
    if not target: raise HTTPException(404, "Không tìm thấy người dùng")
    if target.id == user.id and payload.get("is_active") is False:
        raise HTTPException(400, "Không thể tự khóa tài khoản đang đăng nhập")
    if "is_active" in payload: target.is_active = bool(payload["is_active"])
    if payload.get("role"):
        role = db.query(models.Role).filter_by(name=payload["role"]).first()
        if not role: raise HTTPException(400, "Vai trò không hợp lệ")
        target.role_id = role.id
    db.commit(); db.refresh(target)
    target = db.query(models.User).options(joinedload(models.User.role)).get(target.id)
    return {"success": True, "data": {**user_dict(target), "is_active": target.is_active}, "message": "Đã cập nhật người dùng"}

@app.get("/api/admin/bookings")
def admin_bookings(status_filter: str = "", user=Depends(require_roles("ADMIN")), db: Session = Depends(get_db)):
    query = db.query(models.Booking).options(joinedload(models.Booking.room), joinedload(models.Booking.user))
    if status_filter: query = query.filter(models.Booking.status == status_filter)
    rows = query.order_by(models.Booking.created_at.desc()).limit(500).all()
    return {"success": True, "data": [booking_dict(x) for x in rows]}

@app.get("/api/admin/rooms")
def admin_rooms(user=Depends(require_roles("ADMIN")), db: Session = Depends(get_db)):
    rows = db.query(models.Room).options(joinedload(models.Room.building), joinedload(models.Room.room_type)).order_by(models.Room.code).all()
    return {"success": True, "data": [room_dict(x) for x in rows]}

@app.patch("/api/admin/rooms/{room_id}")
def admin_update_room(room_id: int, payload: dict, user=Depends(require_roles("ADMIN")), db: Session = Depends(get_db)):
    room = db.query(models.Room).filter_by(id=room_id).first()
    if not room: raise HTTPException(404, "Không tìm thấy phòng")
    if "status" in payload:
        if payload["status"] not in ["ACTIVE", "INACTIVE", "MAINTENANCE"]: raise HTTPException(400, "Trạng thái phòng không hợp lệ")
        room.status = payload["status"]
    if "capacity" in payload:
        capacity = int(payload["capacity"])
        if capacity < 1: raise HTTPException(400, "Sức chứa phải lớn hơn 0")
        room.capacity = capacity
    db.commit()
    return {"success": True, "message": "Đã cập nhật phòng"}

@app.get("/api/admin/roles")
def admin_roles(user=Depends(require_roles("ADMIN")), db: Session = Depends(get_db)):
    roles = db.query(models.Role).all()
    return {"success": True, "data": [{"id": r.id, "name": r.name, "description": r.description, "members": db.query(models.User).filter_by(role_id=r.id).count()} for r in roles]}

@app.get("/api/admin/reports")
def admin_reports(user=Depends(require_roles("ADMIN")), db: Session = Depends(get_db)):
    total = db.query(models.Booking).count()
    by_status = {status: db.query(models.Booking).filter_by(status=status).count() for status in ["PENDING", "APPROVED", "REJECTED", "CANCELLED", "CHECKED_IN", "COMPLETED"]}
    rooms = db.query(models.Room).count(); users = db.query(models.User).count()
    usage = db.query(models.Room.code, func.count(models.Booking.id)).outerjoin(models.Booking, models.Booking.room_id == models.Room.id).group_by(models.Room.id).order_by(func.count(models.Booking.id).desc()).all()
    year=datetime.now().year
    monthly=[]
    for month in range(1,13):
        start=datetime(year,month,1)
        end=datetime(year+1,1,1) if month==12 else datetime(year,month+1,1)
        monthly.append({"month":f"{month:02d}/{year}","bookings":db.query(models.Booking).filter(models.Booking.created_at>=start,models.Booking.created_at<end).count()})
    return {"success": True, "data": {"total_bookings": total, "users": users, "rooms": rooms, "by_status": by_status, "by_room": [{"room": x[0], "bookings": x[1]} for x in usage], "by_month":monthly}}

@app.get("/api/admin/logs")
def admin_logs(user=Depends(require_roles("ADMIN")), db: Session = Depends(get_db)):
    rows = db.query(models.BookingApproval).order_by(models.BookingApproval.decided_at.desc()).limit(200).all()
    out = []
    for x in rows:
        actor = db.query(models.User).filter_by(id=x.reviewer_id).first()
        booking = db.query(models.Booking).filter_by(id=x.booking_id).first()
        out.append({"time": x.decided_at.isoformat(), "actor": actor.full_name if actor else "Hệ thống", "action": x.decision, "target": f"Booking #{x.booking_id}" + (f" · phòng {booking.room_id}" if booking else "") , "note": x.note})
    return {"success": True, "data": out}

@app.post("/api/admin/notifications")
def admin_send_notification(payload: dict, user=Depends(require_roles("ADMIN")), db: Session = Depends(get_db)):
    title = str(payload.get("title", "")).strip(); body = str(payload.get("body", "")).strip(); audience = str(payload.get("audience", "ALL"))
    if not title or not body: raise HTTPException(400, "Vui lòng nhập tiêu đề và nội dung thông báo")
    query = db.query(models.User).filter(models.User.is_active == True)
    if audience in ["USER", "ROOM_MANAGER", "ADMIN"]:
        role = db.query(models.Role).filter_by(name=audience).first()
        if not role: raise HTTPException(400, "Đối tượng nhận không hợp lệ")
        query = query.filter(models.User.role_id == role.id)
    recipients = query.all()
    for recipient in recipients:
        db.add(models.Notification(user_id=recipient.id, title=title, body=body, type="ANNOUNCEMENT"))
    db.commit()
    return {"success": True, "data": {"recipients": len(recipients)}, "message": f"Đã gửi thông báo tới {len(recipients)} tài khoản"}

@app.get("/api/admin/notifications")
def admin_notifications(user=Depends(require_roles("ADMIN")), db: Session = Depends(get_db)):
    rows = db.query(models.Notification).order_by(models.Notification.created_at.desc()).limit(200).all()
    # Một lịch bảo trì gửi thông báo riêng cho từng tài khoản.
    # Trong bảng tổng hợp Admin chỉ hiển thị một bản ghi cho cùng một sự kiện.
    seen_maintenance = set()
    result = []
    for x in rows:
        if x.type == "MAINTENANCE":
            event_key = (x.title, x.body)
            if event_key in seen_maintenance:
                continue
            seen_maintenance.add(event_key)
        result.append({"id": x.id, "title": x.title, "body": x.body,
                       "type": x.type, "created_at": x.created_at.isoformat()})
    return {"success": True, "data": result}

@app.get("/api/manager/rooms")
def manager_rooms(user=Depends(require_roles("ROOM_MANAGER", "ADMIN")), db: Session = Depends(get_db)):
    query = db.query(models.Room).options(joinedload(models.Room.building), joinedload(models.Room.room_type))
    if user.role.name == "ROOM_MANAGER":
        assigned_ids=[x.room_id for x in db.query(models.RoomManagerAssignment).filter_by(manager_id=user.id).all()]
        query=query.filter(models.Room.id.in_(assigned_ids)) if assigned_ids else query.filter(models.Room.id == -1)
    rows = query.order_by(models.Room.code).all()
    return {"success": True, "data": [room_dict(x) for x in rows]}

@app.get("/api/manager/summary")
def manager_summary(user=Depends(require_roles("ROOM_MANAGER", "ADMIN")), db: Session = Depends(get_db)):
    assigned_ids=[x.room_id for x in db.query(models.RoomManagerAssignment).filter_by(manager_id=user.id).all()] if user.role.name == "ROOM_MANAGER" else None
    room_query=db.query(models.Room); booking_query=db.query(models.Booking); maintenance_query=db.query(models.Maintenance)
    if assigned_ids is not None:
        room_query=room_query.filter(models.Room.id.in_(assigned_ids)); booking_query=booking_query.filter(models.Booking.room_id.in_(assigned_ids)); maintenance_query=maintenance_query.filter(models.Maintenance.room_id.in_(assigned_ids))
    return {"success": True, "data": {"rooms": room_query.count(), "pending": booking_query.filter_by(status="PENDING").count(), "approved": booking_query.filter_by(status="APPROVED").count(), "maintenance": maintenance_query.filter_by(status="ACTIVE").count()}}

@app.get("/api/manager/maintenance")
def manager_maintenance(user=Depends(require_roles("ROOM_MANAGER", "ADMIN")), db: Session = Depends(get_db)):
    query = db.query(models.Maintenance)
    if user.role.name == "ROOM_MANAGER":
        assigned_ids=[x.room_id for x in db.query(models.RoomManagerAssignment).filter_by(manager_id=user.id).all()]
        query=query.filter(models.Maintenance.room_id.in_(assigned_ids)) if assigned_ids else query.filter(models.Maintenance.id == -1)
    rows = query.order_by(models.Maintenance.start_at.desc()).all()
    result=[]
    for x in rows:
        room=db.query(models.Room).filter_by(id=x.room_id).first()
        result.append({"id":x.id,"room_id":x.room_id,"room":room.code if room else "-","start_at":x.start_at.isoformat(),"end_at":x.end_at.isoformat(),"reason":x.reason,"status":x.status})
    return {"success":True,"data":result}

@app.post("/api/manager/maintenance")
def create_maintenance(payload: dict, user=Depends(require_roles("ROOM_MANAGER", "ADMIN")), db: Session=Depends(get_db)):
    try:
        start=datetime.fromisoformat(payload["start_at"]); end=datetime.fromisoformat(payload["end_at"]); room_id=int(payload["room_id"])
    except Exception: raise HTTPException(400,"Thông tin lịch bảo trì không hợp lệ")
    if start>=end: raise HTTPException(400,"Thời gian kết thúc phải sau thời gian bắt đầu")
    room=db.query(models.Room).filter_by(id=room_id).first()
    if not room: raise HTTPException(404,"Không tìm thấy phòng")
    if user.role.name == "ROOM_MANAGER" and not db.query(models.RoomManagerAssignment).filter_by(manager_id=user.id, room_id=room_id).first():
        raise HTTPException(403,"Bạn không được phân công quản lý phòng này")
    # Không cho lên lịch bảo trì chồng lên booking đang chiếm chỗ.
    conflict = db.query(models.Booking).filter(
        models.Booking.room_id == room_id,
        models.Booking.status.in_(["PENDING", "APPROVED", "CHECKED_IN"]),
        models.Booking.start_at < end, models.Booking.end_at > start
    ).first()
    if conflict:
        raise HTTPException(409, "Không thể bảo trì: phòng đã có yêu cầu đặt lịch trùng thời gian. Vui lòng xử lý booking trước.")
    reason = str(payload.get("reason", "Bảo trì")).strip() or "Bảo trì"
    item=models.Maintenance(room_id=room_id,start_at=start,end_at=end,reason=reason,status="ACTIVE")
    room.status="MAINTENANCE"
    db.add(item)
    # Thông báo cho User, Admin và Room Manager (bao gồm người tạo).
    message = f"Phòng {room.code} bảo trì từ {start.strftime('%d/%m/%Y %H:%M')} đến {end.strftime('%d/%m/%Y %H:%M')}. Lý do: {reason}. Không thể đặt phòng trong thời gian này."
    for recipient in db.query(models.User).all():
        notify(db, recipient.id, f"Thông báo bảo trì phòng {room.code}", message, "MAINTENANCE")
    db.commit()
    return {"success":True,"message":"Đã tạo lịch bảo trì và cập nhật trạng thái phòng"}

@app.patch("/api/manager/maintenance/{maintenance_id}")
def close_maintenance(maintenance_id:int, user=Depends(require_roles("ROOM_MANAGER", "ADMIN")), db: Session=Depends(get_db)):
    item=db.query(models.Maintenance).filter_by(id=maintenance_id).first()
    if not item: raise HTTPException(404,"Không tìm thấy lịch bảo trì")
    if user.role.name == "ROOM_MANAGER" and not db.query(models.RoomManagerAssignment).filter_by(manager_id=user.id, room_id=item.room_id).first():
        raise HTTPException(403,"Bạn không được phân công quản lý phòng này")
    item.status="COMPLETED"
    active=db.query(models.Maintenance).filter(models.Maintenance.room_id==item.room_id, models.Maintenance.id!=item.id, models.Maintenance.status=="ACTIVE").first()
    if not active:
        room=db.query(models.Room).filter_by(id=item.room_id).first()
        if room and room.status=="MAINTENANCE": room.status="ACTIVE"
    notify_waitlist_available(db, item.room_id)
    db.commit(); return {"success":True,"message":"Đã hoàn tất bảo trì"}

@app.get("/api/admin/room-managers")
def admin_room_managers(user=Depends(require_roles("ADMIN")), db: Session=Depends(get_db)):
    managers=db.query(models.User).join(models.Role).filter(models.Role.name=="ROOM_MANAGER").all()
    return {"success":True,"data":[{"id":x.id,"name":x.full_name,"email":x.email} for x in managers]}

@app.put("/api/admin/rooms/{room_id}/manager")
def admin_assign_room_manager(room_id:int,payload:dict,user=Depends(require_roles("ADMIN")),db:Session=Depends(get_db)):
    room=db.query(models.Room).filter_by(id=room_id).first()
    if not room: raise HTTPException(404,"Không tìm thấy phòng")
    manager_id=int(payload.get("manager_id",0))
    db.query(models.RoomManagerAssignment).filter_by(room_id=room_id).delete()
    if manager_id:
        manager=db.query(models.User).join(models.Role).filter(models.User.id==manager_id,models.Role.name=="ROOM_MANAGER").first()
        if not manager: raise HTTPException(400,"Tài khoản không có vai trò Room Manager")
        db.add(models.RoomManagerAssignment(manager_id=manager_id,room_id=room_id))
    db.commit(); return {"success":True,"message":"Đã cập nhật người phụ trách phòng"}

@app.get("/api/manager/bookings/all")
def manager_all_bookings(user=Depends(require_roles("ROOM_MANAGER", "ADMIN")), db: Session=Depends(get_db)):
    query=db.query(models.Booking).options(joinedload(models.Booking.room),joinedload(models.Booking.user))
    if user.role.name == "ROOM_MANAGER":
        assigned_ids=[x.room_id for x in db.query(models.RoomManagerAssignment).filter_by(manager_id=user.id).all()]
        query=query.filter(models.Booking.room_id.in_(assigned_ids)) if assigned_ids else query.filter(models.Booking.id == -1)
    rows=query.order_by(models.Booking.start_at.desc()).limit(300).all()
    return {"success":True,"data":[booking_dict(x) for x in rows]}

@app.get("/api/manager/equipment")
def manager_equipment(user=Depends(require_roles("ROOM_MANAGER", "ADMIN")), db: Session=Depends(get_db)):
    query=db.query(models.RoomEquipment).options(joinedload(models.RoomEquipment.room),joinedload(models.RoomEquipment.equipment))
    if user.role.name == "ROOM_MANAGER":
        assigned_ids=[x.room_id for x in db.query(models.RoomManagerAssignment).filter_by(manager_id=user.id).all()]
        query=query.filter(models.RoomEquipment.room_id.in_(assigned_ids)) if assigned_ids else query.filter(models.RoomEquipment.id == -1)
    rows=query.all()
    return {"success":True,"data":[{"id":x.id,"room_id":x.room_id,"room":x.room.code,"equipment_id":x.equipment_id,"equipment":x.equipment.name,"quantity":x.quantity} for x in rows]}

@app.post("/api/manager/equipment")
def manager_add_equipment(payload:dict,user=Depends(require_roles("ROOM_MANAGER", "ADMIN")),db:Session=Depends(get_db)):
    try: room_id=int(payload["room_id"]); quantity=int(payload.get("quantity",1)); name=str(payload["name"]).strip()
    except Exception: raise HTTPException(400,"Thông tin thiết bị không hợp lệ")
    if not name or quantity<1: raise HTTPException(400,"Tên thiết bị và số lượng phải hợp lệ")
    room=db.query(models.Room).filter_by(id=room_id).first()
    if not room: raise HTTPException(404,"Không tìm thấy phòng")
    if user.role.name=="ROOM_MANAGER" and not db.query(models.RoomManagerAssignment).filter_by(manager_id=user.id,room_id=room_id).first(): raise HTTPException(403,"Bạn không được phân công quản lý phòng này")
    item=db.query(models.Equipment).filter_by(name=name).first()
    if not item: item=models.Equipment(name=name); db.add(item); db.flush()
    link=db.query(models.RoomEquipment).filter_by(room_id=room_id,equipment_id=item.id).first()
    if link: link.quantity=quantity
    else: db.add(models.RoomEquipment(room_id=room_id,equipment_id=item.id,quantity=quantity))
    db.commit(); return {"success":True,"message":"Đã cập nhật thiết bị phòng"}
