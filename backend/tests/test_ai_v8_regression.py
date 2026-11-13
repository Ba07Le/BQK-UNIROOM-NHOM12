"""Regression cases based on the user's actual multi-turn conversation."""
from datetime import datetime
from app.ai_service import _local_extract


def test_new_search_replaces_old_constraints():
    _, first, _ = _local_extract('tôi cần tìm phòng có máy tính')
    _, second, _ = _local_extract('tôi cần tìm phòng tòa nhà A', first.model_dump(mode='json'))
    assert second.building == 'A'
    assert second.equipment == []  # Explicit new search, not stale equipment.
    _, third, _ = _local_extract('tôi cần tìm phòng đang ở trạng thái hoạt động', second.model_dump(mode='json'))
    assert third.status == 'ACTIVE'
    assert third.building is None


def test_followup_adds_constraints_and_time():
    _, first, _ = _local_extract('tôi cần phòng trên 40 người')
    _, second, _ = _local_extract('tòa nhà A nhé', first.model_dump(mode='json'))
    assert second.min_capacity == 41 and second.building == 'A'
    _, third, _ = _local_extract('14 tháng 11 năm 2026 từ 7 giờ sáng tới 10 giờ sáng', second.model_dump(mode='json'))
    assert third.building == 'A' and third.min_capacity == 41
    assert third.start_at == datetime(2026, 11, 14, 7)
    assert third.end_at == datetime(2026, 11, 14, 10)
