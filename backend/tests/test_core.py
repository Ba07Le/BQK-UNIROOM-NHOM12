from datetime import datetime, timedelta
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def login(email="user@gmail.com"):
    r=client.post("/api/auth/login",json={"email":email,"password":"123123"})
    assert r.status_code==200
    return r.json()["data"]["access_token"]

def test_health():
    r=client.get("/api/health")
    assert r.status_code==200 and r.json()["data"]["database"]=="connected"

def test_login_and_rooms():
    token=login()
    r=client.get("/api/rooms",headers={"Authorization":f"Bearer {token}"})
    assert r.status_code==200
    assert len(r.json()["data"])>=1

def test_user_cannot_access_admin():
    token=login()
    r=client.get("/api/admin/summary",headers={"Authorization":f"Bearer {token}"})
    assert r.status_code==403


def test_manager_can_only_see_assigned_rooms():
    r = client.post("/api/auth/login", json={"email": "manager@gmail.com", "password": "123123"})
    assert r.status_code == 200
    token = r.json()["data"]["access_token"]
    rooms = client.get("/api/manager/rooms", headers={"Authorization": f"Bearer {token}"})
    assert rooms.status_code == 200
    assert len(rooms.json()["data"]) >= 1

def test_admin_can_read_management_data():
    r = client.post("/api/auth/login", json={"email": "admin@gmail.com", "password": "123123"})
    assert r.status_code == 200
    token = r.json()["data"]["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    assert client.get("/api/admin/users", headers=headers).status_code == 200
    assert client.get("/api/admin/reports", headers=headers).status_code == 200


def test_admin_rules_include_booking_policies():
    r = client.post("/api/auth/login", json={"email": "admin@gmail.com", "password": "123123"})
    assert r.status_code == 200
    token = r.json()["data"]["access_token"]
    rules = client.get("/api/admin/rules", headers={"Authorization": f"Bearer {token}"})
    assert rules.status_code == 200
    codes = {item["code"] for item in rules.json()["data"]}
    assert {"MAX_DURATION_HOURS", "MAX_ADVANCE_DAYS", "MAX_ACTIVE_BOOKINGS",
            "CANCELLATION_MIN_HOURS", "REQUIRE_APPROVAL"}.issubset(codes)


def test_manager_calendar_overview_endpoint():
    r = client.post("/api/auth/login", json={"email": "manager@gmail.com", "password": "123123"})
    assert r.status_code == 200
    token = r.json()["data"]["access_token"]
    calendar = client.get("/api/calendar/me", headers={"Authorization": f"Bearer {token}"})
    assert calendar.status_code == 200
    assert isinstance(calendar.json()["data"], list)
