# UNIROOM – ĐỐI CHIẾU NGHIỆP VỤ VÀ CẬP NHẬT

## 1. Baseline đối chiếu
Đối chiếu theo `UNIROOM.docx`: phân công Bảo – UC1 User/nền tảng; Quân – UC2 Admin; Khoa – UC3 Room Manager. Các nội dung trong tài liệu là phạm vi/đề xuất; chỉ đánh dấu đã có khi tìm thấy mã nguồn tương ứng.

## 2. Các thay đổi trong bản ZIP này

### Admin (Quân)
- Tách trang `Dashboard` thành trang đăng nhập mặc định của Admin; không còn dùng chung dashboard User.
- Dashboard dùng dữ liệu hiện có trong database: tổng người dùng, phòng, booking, chờ duyệt; biểu đồ trạng thái booking, lượt booking theo phòng và xu hướng booking theo tháng; danh sách booking mới; điều hướng nhanh.
- Khu thao tác chuyên sâu đổi tên thành `SYSTEM CONTROL CENTER`, giữ các nhóm quản trị: tài khoản/vai trò, booking, cơ sở vật chất, quy định, thông báo, báo cáo, nhật ký.
- Bổ sung seed rule mặc định: `MAX_ADVANCE_DAYS=30`, `MAX_ACTIVE_BOOKINGS=5`, `CANCELLATION_MIN_HOURS=2`, bên cạnh `MAX_DURATION_HOURS=4` và `REQUIRE_APPROVAL=true`.
- Áp dụng rule ở backend khi tạo booking: thời lượng tối đa, ngày đặt trước tối đa, số booking đang hoạt động/user, chế độ yêu cầu duyệt hoặc tự xác nhận.
- Áp dụng rule hủy ở backend: chặn user tự hủy khi còn ít hơn số giờ quy định trước giờ bắt đầu.
- Khi rule `REQUIRE_APPROVAL` tắt hoặc đặt false, booking được tự xác nhận. Các rule bị tắt sẽ không áp dụng.
- Sửa xử lý giá trị bật/tắt rule để giá trị chuỗi `"false"` không bị hiểu nhầm thành `true`.

### Manager (Khoa) và Admin
- Tên trang lịch theo vai trò: User là `Lịch cá nhân`; Manager/Admin là `Lịch tổng quan`.
- Lịch tổng quan Manager hiển thị booking thuộc các phòng được phân công; Admin xem booking toàn hệ thống.
- Xuất CSV và PDF dùng cùng phạm vi dữ liệu với lịch; bổ sung tên người đặt vào file xuất.
- Chip ở khu vực duyệt booking thể hiện `Manager` hoặc `Admin`.

### User/Giảng viên
- Thêm mục điều hướng nhanh `UniRoom AI Assistant` kèm biểu tượng nhỏ; chỉ hiển thị với tài khoản role USER.
- Không hiển thị mục AI ở Manager/Admin.

### Hồ sơ
- Ẩn trường số điện thoại khỏi biểu mẫu hồ sơ của Admin và Room Manager; User vẫn có trường này.

## 3. Ma trận đối chiếu chức năng so với ZIP gốc

| Actor / chức năng trong UNIROOM.docx | Bằng chứng mã nguồn ZIP gốc | Đánh giá |
|---|---|---|
| Bảo – Landing, Register/Login/Logout | `homePage`, `registerPage`, `loginPage`, `/api/auth/*` | Có |
| Bảo – Quên/đặt lại mật khẩu | API `/api/auth/forgot-password`, `/reset-password`; cần kiểm thử UX end-to-end | Có API; UI/luồng gửi email cần xác minh thêm |
| Bảo – Hồ sơ, đổi mật khẩu | `/api/users/me`, `/change-password`, `profilePage` | Có |
| Bảo – Lobby, booking gần đây, thông báo | `dashboardPage`, `/api/bookings/me`, `/api/notifications/me` | Có |
| Bảo – Tìm phòng theo ngày/giờ, tòa nhà, sức chứa, loại, thiết bị | `/api/rooms` hỗ trợ từ khóa, building, room type, min_capacity; chưa thấy lọc ngày/giờ và thiết bị trong API tìm phòng | Chưa đủ UC |
| Bảo – Chi tiết phòng/lịch trống | `/api/rooms/{id}`; chưa thấy endpoint availability riêng | Một phần |
| Bảo – Tạo/xem/sửa/hủy booking | `/api/bookings`, `/api/bookings/me`, PATCH/DELETE | Có; policy hủy nay được áp dụng |
| Bảo – Lịch cá nhân và xuất lịch | `/api/calendar/me`, export CSV/PDF | Có |
| Bảo – Booking định kỳ | `/api/bookings/recurring` | Có endpoint; cần kiểm thử xung đột từng occurrence và UI |
| Bảo – Waitlist | `/api/waitlist`, `/api/waitlist/me` | Có endpoint; cần kiểm thử xử lý tự động khi slot trống |
| Bảo – QR check-in/out | `/check-in`, `/check-out`, `/qr` | Có endpoint; cần kiểm thử quy trình thực tế |
| Bảo – AI Assistant | `/api/ai/chat`, `aiPage` | Có; AI fallback nội bộ nếu chưa cấu hình dịch vụ AI |
| Quân – Dashboard tổng quan | `/api/admin/summary`, `/api/admin/reports` | Có; đã bổ sung trang biểu đồ riêng |
| Quân – Quản lý tài khoản, khóa/mở khóa, vai trò | `/api/admin/users`, PATCH user | Có một phần; chưa thấy tạo user và ma trận permission CRUD hoàn chỉnh |
| Quân – Rules/Policy | `/api/admin/rules`, PATCH rule, `rules` table | Có; bản này bổ sung 3 policy còn thiếu và áp dụng backend |
| Quân – Booking toàn hệ thống | `/api/admin/bookings` | Có |
| Quân – Báo cáo | `/api/admin/reports` | Có thống kê cơ bản; chưa phải bộ báo cáo phân tích nâng cao |
| Quân – Audit Log | `/api/admin/logs` | Một phần: hiện đọc lịch sử BookingApproval, chưa có audit log tổng quát cho mọi thao tác |
| Quân – Theo dõi thông báo | `/api/admin/notifications`, POST notifications | Có |
| Khoa – Quản lý tòa nhà/loại phòng/phòng | Model có Building/RoomType/Room; API hiện thấy quản lý phòng hạn chế, chưa có CRUD đầy đủ cho tòa nhà và loại phòng | Chưa đủ UC |
| Khoa – Thiết bị | `/api/manager/equipment` | Có thao tác thêm/liệt kê; cần bổ sung sửa/xóa và kiểm thử |
| Khoa – Lịch phòng | `/api/manager/bookings/all`, calendar | Có dữ liệu lịch; cần kiểm thử hiển thị/ lọc lịch theo tuần-tháng |
| Khoa – Duyệt/từ chối booking, lý do | `/api/manager/bookings`, `/decision`, BookingApproval | Có |
| Khoa – Bảo trì/khóa phòng | `/api/manager/maintenance` và validate booking | Có |
| Khoa – Waitlist phòng, import/export phòng, báo cáo sử dụng | Chưa thấy luồng hoàn chỉnh tương ứng | Chưa đủ UC |

## 4. Các điểm cần nhóm hoàn thiện tiếp
1. **Bảo:** bổ sung lọc tìm phòng theo ngày/giờ và thiết bị; endpoint kiểm tra availability rõ ràng; kiểm thử sửa booking và recurring booking trên từng occurrence.
2. **Quân:** hoàn thiện tạo tài khoản Admin, quản lý permission thực sự (không chỉ xem role); xây audit log tổng quát cho thay đổi user, rule, room, notification; mở rộng báo cáo.
3. **Khoa:** hoàn thiện CRUD Building/RoomType/Room; sửa/xóa thiết bị; import/export phòng; waitlist phía phòng và báo cáo sử dụng.
4. **Cả nhóm:** test tích hợp từ tìm phòng → rules/conflict → booking → duyệt/từ chối → notification → lịch; kiểm thử request đồng thời để tránh booking trùng; bổ sung migration Alembic cho schema thay đổi trong tương lai.
5. Kiểm tra cấu hình production: secret JWT, email/AI provider, database production, và không dùng tài khoản demo/mật khẩu mặc định ngoài môi trường demo.

## 5. Lưu ý về kiểm thử bản cập nhật
- Python source compile: đạt.
- JavaScript syntax check bằng Node: đạt.
- Pytest chưa chạy được trong môi trường đóng gói hiện tại vì môi trường thực thi không có đủ thư viện (ví dụ `python-jose`) và không truy cập được package index. Cần chạy `pip install -r requirements.txt` trong máy phát triển trước khi chạy `pytest -q`.
- Các giá trị policy mặc định là cấu hình demo có thể chỉnh trong `SYSTEM CONTROL CENTER → Quy định`; nhóm cần thống nhất lại giá trị nghiệp vụ chính thức.
