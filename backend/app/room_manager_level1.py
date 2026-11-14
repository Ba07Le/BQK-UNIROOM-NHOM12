from datetime import datetime, timedelta, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session, joinedload

from . import models
from .database import get_db
from .main import require_roles


router = APIRouter(prefix="/api/manager", tags=["Room Manager - Level 1"])


class BuildingInput(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    code: str = Field(min_length=1, max_length=30)
    address: str = Field(default="", max_length=255)


class BuildingPatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    code: str | None = Field(default=None, min_length=1, max_length=30)
    address: str | None = Field(default=None, max_length=255)


class RoomTypeInput(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    description: str = Field(default="", max_length=255)


class RoomTypePatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    description: str | None = Field(default=None, max_length=255)


class RoomPatch(BaseModel):
    building_id: int | None = Field(default=None, gt=0)
    room_type_id: int | None = Field(default=None, gt=0)
    code: str | None = Field(default=None, min_length=1, max_length=30)
    name: str | None = Field(default=None, min_length=1, max_length=120)
    capacity: int | None = Field(default=None, ge=1)
    floor: int | None = Field(default=None, ge=0)
    description: str | None = Field(default=None)
    status: Literal["ACTIVE", "INACTIVE"] | None = None


def _utc_naive(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value
    return value.astimezone(timezone.utc).replace(tzinfo=None)


def _now_utc_naive() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _room_ids(db: Session, user) -> list[int] | None:
    if user.role.name == "ADMIN":
        return None
    return [
        row.room_id
        for row in db.query(models.RoomManagerAssignment)
        .filter_by(manager_id=user.id)
        .all()
    ]


def _require_room_access(db: Session, user, room_id: int) -> models.Room:
    room = db.query(models.Room).filter_by(id=room_id).first()
    if not room:
        raise HTTPException(404, "Không tìm thấy phòng")
    if user.role.name == "ROOM_MANAGER" and not db.query(
        models.RoomManagerAssignment
    ).filter_by(manager_id=user.id, room_id=room_id).first():
        raise HTTPException(403, "Bạn không được phân công quản lý phòng này")
    return room


def _clean(value: str, label: str) -> str:
    result = value.strip()
    if not result:
        raise HTTPException(400, f"{label} không được để trống")
    return result


@router.get("/buildings")
def list_buildings(
    user=Depends(require_roles("ROOM_MANAGER", "ADMIN")),
    db: Session = Depends(get_db),
):
    rows = db.query(models.Building).order_by(models.Building.code).all()
    return {
        "success": True,
        "data": [
            {
                "id": item.id,
                "name": item.name,
                "code": item.code,
                "address": item.address,
                "room_count": db.query(models.Room).filter_by(
                    building_id=item.id
                ).count(),
            }
            for item in rows
        ],
    }


@router.post("/buildings", status_code=201)
def create_building(
    data: BuildingInput,
    user=Depends(require_roles("ROOM_MANAGER", "ADMIN")),
    db: Session = Depends(get_db),
):
    name = _clean(data.name, "Tên tòa nhà")
    code = _clean(data.code, "Mã tòa nhà").upper()
    if db.query(models.Building).filter_by(code=code).first():
        raise HTTPException(409, "Mã tòa nhà đã tồn tại")
    item = models.Building(name=name, code=code, address=data.address.strip())
    db.add(item)
    db.commit()
    db.refresh(item)
    return {"success": True, "data": {"id": item.id}, "message": "Đã tạo tòa nhà"}


@router.patch("/buildings/{building_id}")
def update_building(
    building_id: int,
    data: BuildingPatch,
    user=Depends(require_roles("ROOM_MANAGER", "ADMIN")),
    db: Session = Depends(get_db),
):
    item = db.query(models.Building).filter_by(id=building_id).first()
    if not item:
        raise HTTPException(404, "Không tìm thấy tòa nhà")
    values = data.model_dump(exclude_unset=True, exclude_none=True)
    if not values:
        raise HTTPException(400, "Không có thông tin cần cập nhật")
    if "name" in values:
        values["name"] = _clean(values["name"], "Tên tòa nhà")
    if "code" in values:
        values["code"] = _clean(values["code"], "Mã tòa nhà").upper()
        duplicate = db.query(models.Building).filter(
            models.Building.code == values["code"],
            models.Building.id != building_id,
        ).first()
        if duplicate:
            raise HTTPException(409, "Mã tòa nhà đã tồn tại")
    if "address" in values:
        values["address"] = values["address"].strip()
    for key, value in values.items():
        setattr(item, key, value)
    db.commit()
    return {"success": True, "message": "Đã cập nhật tòa nhà"}


@router.delete("/buildings/{building_id}")
def delete_building(
    building_id: int,
    user=Depends(require_roles("ROOM_MANAGER", "ADMIN")),
    db: Session = Depends(get_db),
):
    item = db.query(models.Building).filter_by(id=building_id).first()
    if not item:
        raise HTTPException(404, "Không tìm thấy tòa nhà")
    if db.query(models.Room.id).filter_by(building_id=building_id).first():
        raise HTTPException(409, "Không thể xóa tòa nhà đang có phòng")
    db.delete(item)
    db.commit()
    return {"success": True, "message": "Đã xóa tòa nhà"}


@router.get("/room-types")
def list_room_types(
    user=Depends(require_roles("ROOM_MANAGER", "ADMIN")),
    db: Session = Depends(get_db),
):
    rows = db.query(models.RoomType).order_by(models.RoomType.name).all()
    return {
        "success": True,
        "data": [
            {
                "id": item.id,
                "name": item.name,
                "description": item.description,
                "room_count": db.query(models.Room).filter_by(
                    room_type_id=item.id
                ).count(),
            }
            for item in rows
        ],
    }


@router.post("/room-types", status_code=201)
def create_room_type(
    data: RoomTypeInput,
    user=Depends(require_roles("ROOM_MANAGER", "ADMIN")),
    db: Session = Depends(get_db),
):
    name = _clean(data.name, "Tên loại phòng")
    if db.query(models.RoomType).filter_by(name=name).first():
        raise HTTPException(409, "Tên loại phòng đã tồn tại")
    item = models.RoomType(name=name, description=data.description.strip())
    db.add(item)
    db.commit()
    db.refresh(item)
    return {
        "success": True,
        "data": {"id": item.id},
        "message": "Đã tạo loại phòng",
    }


@router.patch("/room-types/{room_type_id}")
def update_room_type(
    room_type_id: int,
    data: RoomTypePatch,
    user=Depends(require_roles("ROOM_MANAGER", "ADMIN")),
    db: Session = Depends(get_db),
):
    item = db.query(models.RoomType).filter_by(id=room_type_id).first()
    if not item:
        raise HTTPException(404, "Không tìm thấy loại phòng")
    values = data.model_dump(exclude_unset=True, exclude_none=True)
    if not values:
        raise HTTPException(400, "Không có thông tin cần cập nhật")
    if "name" in values:
        values["name"] = _clean(values["name"], "Tên loại phòng")
        duplicate = db.query(models.RoomType).filter(
            models.RoomType.name == values["name"],
            models.RoomType.id != room_type_id,
        ).first()
        if duplicate:
            raise HTTPException(409, "Tên loại phòng đã tồn tại")
    if "description" in values:
        values["description"] = values["description"].strip()
    for key, value in values.items():
        setattr(item, key, value)
    db.commit()
    return {"success": True, "message": "Đã cập nhật loại phòng"}


@router.delete("/room-types/{room_type_id}")
def delete_room_type(
    room_type_id: int,
    user=Depends(require_roles("ROOM_MANAGER", "ADMIN")),
    db: Session = Depends(get_db),
):
    item = db.query(models.RoomType).filter_by(id=room_type_id).first()
    if not item:
        raise HTTPException(404, "Không tìm thấy loại phòng")
    if db.query(models.Room.id).filter_by(room_type_id=room_type_id).first():
        raise HTTPException(409, "Không thể xóa loại phòng đang được sử dụng")
    db.delete(item)
    db.commit()
    return {"success": True, "message": "Đã xóa loại phòng"}


@router.patch("/rooms/{room_id}")
def update_room(
    room_id: int,
    data: RoomPatch,
    user=Depends(require_roles("ROOM_MANAGER", "ADMIN")),
    db: Session = Depends(get_db),
):
    room = _require_room_access(db, user, room_id)
    values = data.model_dump(exclude_unset=True, exclude_none=True)
    if not values:
        raise HTTPException(400, "Không có thông tin cần cập nhật")

    if "building_id" in values and not db.query(models.Building).filter_by(
        id=values["building_id"]
    ).first():
        raise HTTPException(400, "Tòa nhà không tồn tại")
    if "room_type_id" in values and not db.query(models.RoomType).filter_by(
        id=values["room_type_id"]
    ).first():
        raise HTTPException(400, "Loại phòng không tồn tại")
    if "code" in values:
        values["code"] = _clean(values["code"], "Mã phòng")
        duplicate = db.query(models.Room).filter(
            models.Room.code == values["code"],
            models.Room.id != room_id,
        ).first()
        if duplicate:
            raise HTTPException(409, "Mã phòng đã tồn tại")
    if "name" in values:
        values["name"] = _clean(values["name"], "Tên phòng")

    new_status = values.get("status")
    if new_status == "INACTIVE":
        occupied = db.query(models.Booking.id).filter(
            models.Booking.room_id == room_id,
            models.Booking.status.in_(["PENDING", "APPROVED", "CHECKED_IN"]),
            models.Booking.end_at > _now_utc_naive(),
        ).first()
        if occupied:
            raise HTTPException(
                409,
                "Không thể khóa phòng khi còn booking đang hoạt động; hãy xử lý booking trước",
            )
    if new_status == "ACTIVE":
        maintenance = db.query(models.Maintenance.id).filter(
            models.Maintenance.room_id == room_id,
            models.Maintenance.status == "ACTIVE",
            models.Maintenance.end_at > _now_utc_naive(),
        ).first()
        if maintenance:
            raise HTTPException(
                409,
                "Phòng còn lịch bảo trì đang hoạt động; hãy hoàn tất bảo trì trước",
            )

    for key, value in values.items():
        setattr(room, key, value)
    db.commit()
    return {"success": True, "message": "Đã cập nhật phòng"}


@router.delete("/equipment/{room_equipment_id}")
def remove_room_equipment(
    room_equipment_id: int,
    user=Depends(require_roles("ROOM_MANAGER", "ADMIN")),
    db: Session = Depends(get_db),
):
    link = db.query(models.RoomEquipment).filter_by(id=room_equipment_id).first()
    if not link:
        raise HTTPException(404, "Không tìm thấy thiết bị trong phòng")
    _require_room_access(db, user, link.room_id)
    db.delete(link)
    db.commit()
    return {"success": True, "message": "Đã gỡ thiết bị khỏi phòng"}


@router.get("/calendar")
def manager_calendar(
    start_at: datetime | None = None,
    end_at: datetime | None = None,
    user=Depends(require_roles("ROOM_MANAGER", "ADMIN")),
    db: Session = Depends(get_db),
):
    start = _utc_naive(start_at) if start_at else _now_utc_naive()
    end = _utc_naive(end_at) if end_at else start + timedelta(days=60)
    if start >= end:
        raise HTTPException(400, "Thời gian kết thúc phải sau thời gian bắt đầu")

    ids = _room_ids(db, user)
    bookings = db.query(models.Booking).options(
        joinedload(models.Booking.room),
        joinedload(models.Booking.user),
    ).filter(
        models.Booking.start_at < end,
        models.Booking.end_at > start,
        models.Booking.status != "CANCELLED",
    )
    maintenance = db.query(models.Maintenance).filter(
        models.Maintenance.start_at < end,
        models.Maintenance.end_at > start,
        models.Maintenance.status == "ACTIVE",
    )
    if ids is not None:
        bookings = bookings.filter(models.Booking.room_id.in_(ids))
        maintenance = maintenance.filter(models.Maintenance.room_id.in_(ids))

    events = [
        {
            "id": f"booking-{item.id}",
            "type": "BOOKING",
            "title": f"{item.room.code} · {item.title}",
            "start": item.start_at.isoformat(),
            "end": item.end_at.isoformat(),
            "status": item.status,
            "room_id": item.room_id,
            "user": item.user.full_name if item.user else "",
        }
        for item in bookings.order_by(models.Booking.start_at).all()
    ]
    maintenance_rows = maintenance.order_by(models.Maintenance.start_at).all()
    room_codes = {
        room.id: room.code
        for room in db.query(models.Room).filter(
            models.Room.id.in_([item.room_id for item in maintenance_rows])
        ).all()
    }
    events.extend(
        {
            "id": f"maintenance-{item.id}",
            "type": "MAINTENANCE",
            "title": f"{room_codes.get(item.room_id, 'Phòng')} · Bảo trì: {item.reason}",
            "start": item.start_at.isoformat(),
            "end": item.end_at.isoformat(),
            "status": item.status,
            "room_id": item.room_id,
        }
        for item in maintenance_rows
    )
    return {"success": True, "data": events}


@router.get("/usage-report")
def usage_report(
    start_at: datetime | None = None,
    end_at: datetime | None = None,
    user=Depends(require_roles("ROOM_MANAGER", "ADMIN")),
    db: Session = Depends(get_db),
):
    end = _utc_naive(end_at) if end_at else _now_utc_naive()
    start = _utc_naive(start_at) if start_at else end - timedelta(days=30)
    if start >= end:
        raise HTTPException(400, "Thời gian kết thúc phải sau thời gian bắt đầu")

    ids = _room_ids(db, user)
    rooms_query = db.query(models.Room).options(
        joinedload(models.Room.building)
    )
    bookings_query = db.query(models.Booking).options(
        joinedload(models.Booking.room)
    ).filter(
        models.Booking.start_at < end,
        models.Booking.end_at > start,
    )
    if ids is not None:
        rooms_query = rooms_query.filter(models.Room.id.in_(ids))
        bookings_query = bookings_query.filter(models.Booking.room_id.in_(ids))

    by_room = {
        room.id: {
            "room_id": room.id,
            "room_code": room.code,
            "room_name": room.name,
            "building": room.building.name,
            "booking_count": 0,
            "usage_hours": 0.0,
        }
        for room in rooms_query.all()
    }
    by_status: dict[str, int] = {}
    total_hours = 0.0
    rows = bookings_query.all()
    for booking in rows:
        by_status[booking.status] = by_status.get(booking.status, 0) + 1
        target = by_room.get(booking.room_id)
        if target is None:
            continue
        target["booking_count"] += 1
        if booking.status in ("APPROVED", "CHECKED_IN", "COMPLETED"):
            clipped_start = max(booking.start_at, start)
            clipped_end = min(booking.end_at, end)
            hours = max(0.0, (clipped_end - clipped_start).total_seconds() / 3600)
            target["usage_hours"] += hours
            total_hours += hours

    return {
        "success": True,
        "data": {
            "start_at": start.isoformat(),
            "end_at": end.isoformat(),
            "total_bookings": len(rows),
            "usage_hours": round(total_hours, 2),
            "by_status": by_status,
            "by_room": sorted(
                [
                    {**item, "usage_hours": round(item["usage_hours"], 2)}
                    for item in by_room.values()
                ],
                key=lambda item: (-item["usage_hours"], item["room_code"]),
            ),
        },
    }
