# UniRoom – Waitlist

## Nghiệp vụ
- Chỉ USER có thể đăng ký chờ khi booking PENDING/APPROVED/CHECKED_IN trùng thời gian.
- Không cho đăng ký chờ trong khoảng bảo trì; ngăn yêu cầu chờ trùng của cùng người.
- WAITING không giữ chỗ, không hiển thị trên lịch.
- Khi booking bị hủy hoặc từ chối, hệ thống kiểm tra khung giờ trống, thông báo người chờ đầu tiên (FIFO) và đổi sang NOTIFIED.
- User vào Theo dõi đặt phòng → Danh sách chờ → Đặt phòng để tạo booking mới. Phải kiểm tra lại xung đột; không tự duyệt.
- Khi booking mới được tạo, yêu cầu chờ giao thời gian của chính user chuyển FULFILLED.
- User có thể rời danh sách chờ (CANCELLED); yêu cầu quá giờ được đánh dấu EXPIRED khi hệ thống xử lý danh sách.
- Admin/Manager có API GET /api/manager/waitlist, lọc theo quyền quản lý phòng.

## API
POST /api/waitlist: BookingIn (room_id,title,purpose,attendee_count,start_at,end_at)
GET /api/waitlist/me
DELETE /api/waitlist/{entry_id}
GET /api/manager/waitlist

## Lưu ý
- Không có job nền; tự động kiểm tra người chờ tại các sự kiện hủy/từ chối booking hoặc hoàn tất bảo trì.
- Một thông báo NOTIFIED không đảm bảo giữ phòng; khi đặt lại phải kiểm tra khả dụng.
- Chưa áp dụng khóa giao dịch phân tán chống race condition trong trường hợp nhiều request đồng thời.
- Không cần migration bảng mới vì sử dụng WaitlistEntry hiện có.
