"""Regression: second chat turn provides Vietnamese date/time only."""
from datetime import datetime
from app.ai_service import _local_extract, parse_intent


def test_vietnamese_followup_date_and_half_hour():
    previous={'min_capacity':41,'room_type':'Lab','start_at':None,'end_at':None}
    intent,req,mode=_local_extract('muốn đặt ngày 14/11/2026 và 7 giờ sáng tới 10 giờ rưỡi sáng luôn',previous)
    assert intent=='search'
    assert req.start_at==datetime(2026,11,14,7,0)
    assert req.end_at==datetime(2026,11,14,10,30)
    assert req.room_type == "Lab"


def test_previous_filters_preserved():
    previous={'min_capacity':41,'room_type':'Lab'}
    _,req,_=_local_extract('14/11/2026 từ 7h đến 10h30',previous)
    assert req.min_capacity==41
    assert req.room_type=='Lab'
    assert req.start_at==datetime(2026,11,14,7)
    assert req.end_at==datetime(2026,11,14,10,30)


def test_written_vietnamese_date_and_time():
    previous={'min_capacity':41}
    _, req, _ = _local_extract('tôi cần đặt ngày 14 tháng 11 năm 2026 từ 7 giờ sáng tới 10 giờ sáng luôn',previous)
    assert req.start_at == datetime(2026,11,14,7)
    assert req.end_at == datetime(2026,11,14,10)
    assert req.min_capacity == 41


def test_equipment_and_capacity_persist_until_explicit_change():
    _, first, _ = _local_extract('tìm phòng lab trên 40 người')
    _, second, _ = _local_extract('có máy tính',first.model_dump(mode='json'))
    assert second.min_capacity == 41
    assert second.room_type == 'Lab'
    assert second.equipment == ['máy tính']
    _, third, _ = _local_extract('đổi sang phòng lý thuyết',second.model_dump(mode='json'))
    assert third.room_type == 'lý thuyết'
    assert third.equipment == []
