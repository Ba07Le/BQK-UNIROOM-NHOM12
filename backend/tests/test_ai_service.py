"""Run: pytest backend/tests/test_ai_service.py"""
from datetime import datetime, timedelta
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from app.database import Base
from app import models
from app.ai_service import SearchRequest, search_rooms

@pytest.fixture
def db():
    engine=create_engine('sqlite:///:memory:')
    Base.metadata.create_all(engine)
    with Session(engine) as s:
        s.add_all([models.Building(id=1,code='A',name='Tòa A'),models.RoomType(id=1,name='Lab')])
        s.flush()
        s.add(models.Room(id=1,building_id=1,room_type_id=1,code='A101',name='Lab A101',capacity=40,status='ACTIVE'))
        s.commit()
        yield s
    engine.dispose()

def test_search_by_capacity(db):
    assert len(search_rooms(db,SearchRequest(min_capacity=30)))==1
    assert search_rooms(db,SearchRequest(min_capacity=50))==[]

def test_booking_overlap_and_adjacent(db):
    start=datetime.now().replace(microsecond=0)+timedelta(days=2)
    end=start+timedelta(hours=2)
    db.add(models.Booking(user_id=1,room_id=1,title='Booked',start_at=start,end_at=end,status='APPROVED'))
    # Avoid FK issues in SQLite by disabling FK enforcement in this isolated fixture.
    db.commit()
    assert search_rooms(db,SearchRequest(start_at=start+timedelta(minutes=30),end_at=end))==[]
    assert len(search_rooms(db,SearchRequest(start_at=end,end_at=end+timedelta(hours=1))))==1

def test_maintenance_blocks(db):
    start=datetime.now().replace(microsecond=0)+timedelta(days=2)
    end=start+timedelta(hours=1)
    db.add(models.Maintenance(room_id=1,start_at=start,end_at=end,status='ACTIVE'))
    db.commit()
    assert search_rooms(db,SearchRequest(start_at=start,end_at=end))==[]

def test_invalid_interval(db):
    start=datetime.now()+timedelta(days=2)
    with pytest.raises(ValueError):search_rooms(db,SearchRequest(start_at=start,end_at=start))

from app.ai_service import parse_intent, respond

def test_vietnamese_followup_time():
    first=parse_intent('phòng lab trên 40 người có không vậy')[1]
    second=parse_intent('muốn đặt ngày 14/11/2026 và 7 giờ sáng tới 10 giờ rưỡi sáng luôn',previous=first.model_dump(mode='json'))[1]
    assert second.min_capacity==41 and second.room_type=='Lab'
    assert second.start_at==datetime(2026,11,14,7,0)
    assert second.end_at==datetime(2026,11,14,10,30)

def test_change_room_type_replaces_old_type_and_equipment():
    first=parse_intent('cần phòng lab có máy tính')[1]
    second=parse_intent('tôi cần phòng lý thuyết',previous=first.model_dump(mode='json'))[1]
    assert second.room_type=='lý thuyết' and second.equipment==[]

def test_capacity_floor_building_equipment():
    req=parse_intent('phòng 5 người có máy chiếu ở tòa A tầng 2')[1]
    assert req.min_capacity==5 and req.equipment==['máy chiếu']
    assert req.building=='A' and req.floor==2

def test_complete_slot_enables_availability(db):
    from datetime import timedelta
    start=datetime.now().replace(microsecond=0)+timedelta(days=2)
    req=SearchRequest(min_capacity=20,start_at=start,end_at=start+timedelta(hours=2))
    result=respond(db,'tìm phòng',previous=req.model_dump(mode='json'))
    assert result['missing']==[] and result['rooms'][0]['availability']=='available'

def test_lab_alias_and_equipment_filter(db):
    db.add(models.Equipment(id=1,name='Máy tính'))
    db.add(models.RoomEquipment(room_id=1,equipment_id=1,quantity=10))
    db.commit()
    found=search_rooms(db,SearchRequest(room_type='thực hành',equipment=['máy tính'],min_capacity=20))
    assert [r['code'] for r in found]==['A101']
    assert search_rooms(db,SearchRequest(room_type='lý thuyết',equipment=['máy tính']))==[]


def test_followup_slot_returns_bookable_room(db):
    from app.ai_service import respond
    from datetime import timedelta
    day=(datetime.now()+timedelta(days=2)).strftime('%d/%m/%Y')
    first=respond(db,'cần phòng lab trên 30 người')
    second=respond(db,f'ngày {day} từ 7 giờ sáng tới 10 giờ sáng',previous=first['filters'])
    assert second['missing']==[]
    assert second['rooms'][0]['availability']=='available'
    assert second['filters']['start_at'].endswith('07:00:00')

# Multi-turn partial-time behavior and HTTP-model extraction are regression tests.
def test_partial_time_asks_end_without_rooms(db, monkeypatch):
    monkeypatch.delenv('OPENAI_API_KEY', raising=False)
    first=respond(db, 'tôi muốn đặt phòng lúc 7 giờ sáng ngày 15/11/2026')
    assert first['rooms']==[]
    assert first['missing']==['end_at']
    assert first['filters']['start_at'].startswith('2026-11-15T07:00')
    second=parse_intent('đến 10 giờ sáng',previous=first['filters'])[1]
    assert second.start_at==datetime(2026,11,15,7)
    assert second.end_at==datetime(2026,11,15,10)


def test_date_only_and_followup_start(db, monkeypatch):
    monkeypatch.delenv('OPENAI_API_KEY', raising=False)
    first=respond(db,'tìm phòng ngày 20/11/2026')
    assert first['rooms']==[] and first['filters']['requested_date']=='2026-11-20'
    second=parse_intent('bắt đầu lúc 8h sáng',previous=first['filters'])[1]
    assert second.start_at==datetime(2026,11,20,8)
    assert second.end_at is None


def test_openai_fields_used_and_validated(monkeypatch):
    from app import ai_service
    monkeypatch.setenv('OPENAI_API_KEY','test-key')
    monkeypatch.setattr(ai_service,'_openai_chat_json',lambda system,message:{'min_capacity':30,'title':'Học nhóm'})
    intent,req,mode=parse_intent('cần phòng cho khoảng 30 người')
    assert req.min_capacity==30 and req.title=='Học nhóm' and mode=='openai+local'


def test_openai_error_fallback(monkeypatch):
    from app import ai_service
    monkeypatch.setenv('OPENAI_API_KEY','test-key')
    def broken(*args):raise ValueError('invalid JSON')
    monkeypatch.setattr(ai_service,'_openai_chat_json',broken)
    _,req,mode=parse_intent('phòng cho 25 người')
    assert req.min_capacity==25 and mode=='local_api_error'
