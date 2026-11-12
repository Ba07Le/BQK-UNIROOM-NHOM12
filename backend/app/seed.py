from sqlalchemy.orm import Session
from . import models
from .security import hash_password

def seed_database(db: Session):
    if db.query(models.Role).count() == 0:
        roles = [
            models.Role(name="USER", description="Người dùng/Giảng viên"),
            models.Role(name="ROOM_MANAGER", description="Nhân viên quản lý phòng"),
            models.Role(name="ADMIN", description="Quản trị viên"),
        ]
        db.add_all(roles)
        db.flush()
    role_map = {r.name: r for r in db.query(models.Role).all()}
    accounts = [
        ("Nguyễn Văn User", "user@gmail.com", "USER"),
        ("Nguyễn Văn Manager", "manager@gmail.com", "ROOM_MANAGER"),
        ("Nguyễn Văn Admin", "admin@gmail.com", "ADMIN"),
    ]
    for name, email, role in accounts:
        if not db.query(models.User).filter_by(email=email).first():
            db.add(models.User(full_name=name, email=email, password_hash=hash_password("123123"), role_id=role_map[role].id))
    if db.query(models.Building).count() == 0:
        b1 = models.Building(name="Toà nhà A", code="A", address="Khu giảng đường")
        b2 = models.Building(name="Toà nhà B", code="B", address="Khu thực hành")
        t1 = models.RoomType(name="Phòng lý thuyết", description="Phòng học thông thường")
        t2 = models.RoomType(name="Phòng Lab", description="Phòng thực hành máy tính")
        db.add_all([b1,b2,t1,t2]); db.flush()
        eqs = [models.Equipment(name="Máy chiếu"), models.Equipment(name="Máy tính"), models.Equipment(name="Bảng thông minh"), models.Equipment(name="Điều hoà")]
        db.add_all(eqs); db.flush()
        rooms = [
            models.Room(building_id=b1.id, room_type_id=t1.id, code="A.101", name="Phòng học A.101", capacity=60, floor=1, description="Phòng học tiêu chuẩn, có máy chiếu."),
            models.Room(building_id=b1.id, room_type_id=t1.id, code="A.202", name="Phòng học A.202", capacity=40, floor=2, description="Phòng học nhóm và seminar."),
            models.Room(building_id=b2.id, room_type_id=t2.id, code="B.LAB01", name="Phòng Lab 01", capacity=35, floor=1, description="Phòng máy tính phục vụ thực hành."),
            models.Room(building_id=b2.id, room_type_id=t2.id, code="B.LAB02", name="Phòng Lab 02", capacity=25, floor=2, description="Phòng Lab chuyên dụng."),
        ]
        db.add_all(rooms); db.flush()
        for room, eq in zip(rooms, [eqs[0], eqs[2], eqs[1], eqs[1]]):
            db.add(models.RoomEquipment(room_id=room.id, equipment_id=eq.id, quantity=1))
    # Gán các phòng mẫu cho tài khoản Room Manager mặc định.
    manager = db.query(models.User).filter_by(email="manager@gmail.com").first()
    if manager:
        for room in db.query(models.Room).all():
            assigned = db.query(models.RoomManagerAssignment).filter_by(manager_id=manager.id, room_id=room.id).first()
            if not assigned:
                db.add(models.RoomManagerAssignment(manager_id=manager.id, room_id=room.id))
    # Seed rules idempotently. SessionLocal uses autoflush=False, so do not
    # add a whole batch and then query before flushing: that can re-insert
    # codes which are already pending in this transaction.
    defaults = [
        ("MAX_DURATION_HOURS", "4"),
        ("MAX_ADVANCE_DAYS", "30"),
        ("MAX_ACTIVE_BOOKINGS", "5"),
        ("CANCELLATION_MIN_HOURS", "2"),
        ("REQUIRE_APPROVAL", "true"),
    ]
    for code, value in defaults:
        rule = db.query(models.Rule).filter_by(code=code).first()
        if rule is None:
            db.add(models.Rule(code=code, value=value, enabled=True))
    db.commit()
