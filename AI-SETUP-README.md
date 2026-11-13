# UniRoom AI Assistant – Hướng dẫn tích hợp

## Kiến trúc và phạm vi
- FastAPI/SQLAlchemy truy vấn **PostgreSQL thật**; không đưa SQL do mô hình tạo vào database.
- OpenAI (nếu cấu hình key) **trích xuất điều kiện từ câu tiếng Việt** sang bộ lọc có kiểm tra kiểu. Không fine-tune: lịch phòng thay đổi liên tục, vì vậy truy vấn live phù hợp hơn huấn luyện dữ liệu tĩnh.
- Backend kiểm tra trạng thái phòng ACTIVE, sức chứa, tòa nhà, loại phòng, thiết bị, booking PENDING/APPROVED/CHECKED_IN, bảo trì ACTIVE và các lần xuất hiện của booking định kỳ (nếu có).
- Nếu chưa đủ ngày/giờ: kết quả ghi `not_checked`, tuyệt đối không xác nhận phòng trống.
- Kết quả gợi ý chỉ mang tính tham khảo, không tạo/duyệt booking. Khi tạo booking, API booking vẫn kiểm tra rules và xung đột.
- Lịch sử chat lưu vào các bảng `ai_conversations` và `ai_messages` đã có; API chỉ cho chủ sở hữu xem.
- Khi API OpenAI lỗi/hết hạn mức, tự chuyển sang bộ phân tích từ khóa nội bộ; fallback không hiểu ngày giờ tự nhiên, nên dùng API gợi ý với thời gian ISO để tra cứu chính xác.

## Lấy OpenAI API key
1. Vào https://platform.openai.com/api-keys , đăng nhập tài khoản OpenAI Platform.
2. Thiết lập billing/quota phù hợp (ChatGPT Plus không đồng nghĩa có API credit).
3. Tạo secret API key; sao chép một lần và lưu an toàn.
4. Trong `.env` ở thư mục gốc dự án (KHÔNG commit), thêm:

   OPENAI_API_KEY=sk-...your-real-key...
   OPENAI_MODEL=gpt-4o-mini

5. Đảm bảo `DATABASE_URL=postgresql+psycopg://...` trỏ tới Neon PostgreSQL đang dùng.
6. Cài `pip install -r backend/requirements.txt`.
7. Từ thư mục gốc, chạy `python -m uvicorn app.main:app --app-dir backend --reload --reload-dir backend --host 127.0.0.1 --port 8000`.
8. Đăng nhập bằng USER, mở menu **AI Assistant**. API key chỉ ở backend, không bao giờ đưa vào JS hoặc HTML.

## API
### POST /api/ai/chat (Bearer token)
```json
{"message":"Tìm phòng lab 30 người có máy chiếu ngày mai 8h-10h","conversation_id":null}
```
Trả về `data.answer`, `data.rooms`, `data.filters`, `data.mode`, `data.conversation_id`. `mode` là `openai` hoặc `local`.

### POST /api/ai/recommend-room (Bearer token)
```json
{"start_at":"2026-12-01T08:00:00","end_at":"2026-12-01T10:00:00","min_capacity":30,"equipment":["Máy chiếu"],"room_type":"Lab","limit":5}
```
Trả về `data.rooms` và `data.count`. Khung giờ là giờ địa phương trên máy chủ (khuyến nghị triển khai timezone thống nhất cho production).

### GET /api/ai/conversations
Danh sách tối đa 30 phiên gần đây của chính người dùng.

### GET /api/ai/conversations/{id}
Tối đa 100 tin nhắn của phiên, chỉ chủ sở hữu truy cập.

## Kiểm thử
- Không có API key: hỏi `Tìm phòng Lab 30 người` → có gợi ý từ PostgreSQL, trạng thái `Chưa kiểm tra lịch trống`.
- Có API key: hỏi `Tìm phòng Lab 30 người có máy chiếu ngày 01/12/2026 từ 8h đến 10h` → API trích xuất ngày/giờ, kiểm tra booking và bảo trì.
- Tạo booking trùng khung giờ rồi hỏi lại → phòng đó không được gợi ý.
- Thử hỏi quy trình duyệt → AI giải thích, không tự thay đổi trạng thái.
- Đăng nhập tài khoản khác và thử GET conversation ID của người đầu → 404.
- `pytest backend/tests/test_ai_service.py` (thiết lập `PYTHONPATH=backend` trước khi chạy).

## Hạn chế và an toàn
- Không có thao tác train/fine-tune mô hình. Truy vấn live + OpenAI trích xuất intent là cách đúng cho dữ liệu biến động.
- Chỉ gửi câu hỏi và tối đa 6 tin nhắn trước đó cho OpenAI; không gửi email, mật khẩu, token hay toàn bộ dữ liệu booking.
- Giới hạn tin nhắn 1200 ký tự, giới hạn kết quả và timeout API OpenAI; nên bổ sung rate limiting ở gateway nếu triển khai công khai.
- Chưa triển khai RAG tài liệu dài, streaming, cache, timezone chuẩn UTC, khóa DB chống booking đồng thời hoặc kiểm thử end-to-end với Neon/OpenAI thật.
- Khi chưa cung cấp đủ thời gian, không tuyên bố phòng có sẵn. Khi user nhấn đặt phòng, backend booking là nguồn quyết định cuối cùng.
