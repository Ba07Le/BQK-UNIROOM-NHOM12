import uuid

from fastapi.testclient import TestClient

from app.room_manager_app import app


client = TestClient(app)


def _token(email: str) -> str:
    response = client.post(
        "/api/auth/login",
        json={"email": email, "password": "123123"},
    )
    assert response.status_code == 200
    return response.json()["data"]["access_token"]


def test_room_manager_can_create_update_and_delete_unused_building():
    headers = {"Authorization": f"Bearer {_token('manager@gmail.com')}"}
    code = f"T{uuid.uuid4().hex[:8].upper()}"

    created = client.post(
        "/api/manager/buildings",
        headers=headers,
        json={"name": "Tòa nhà kiểm thử", "code": code, "address": "Địa chỉ cũ"},
    )
    assert created.status_code == 201
    building_id = created.json()["data"]["id"]

    updated = client.patch(
        f"/api/manager/buildings/{building_id}",
        headers=headers,
        json={"address": "Địa chỉ mới"},
    )
    assert updated.status_code == 200

    deleted = client.delete(
        f"/api/manager/buildings/{building_id}",
        headers=headers,
    )
    assert deleted.status_code == 200


def test_regular_user_cannot_access_room_manager_catalog():
    headers = {"Authorization": f"Bearer {_token('user@gmail.com')}"}
    response = client.get("/api/manager/buildings", headers=headers)
    assert response.status_code == 403


def test_standalone_room_manager_page_is_served():
    response = client.get("/static/room-manager.html")

    assert response.status_code == 200
    assert "/static/js/room-manager-level1.js" in response.text


def test_room_manager_calendar_and_usage_report_are_scoped_api_responses():
    headers = {"Authorization": f"Bearer {_token('manager@gmail.com')}"}
    calendar = client.get("/api/manager/calendar", headers=headers)
    report = client.get("/api/manager/usage-report", headers=headers)

    assert calendar.status_code == 200
    assert isinstance(calendar.json()["data"], list)
    assert report.status_code == 200
    assert {"total_bookings", "usage_hours", "by_status", "by_room"}.issubset(
        report.json()["data"]
    )
