# UniRoom – Nhóm 12 (tách frontend/backend)

Dự án sử dụng FastAPI, HTML/CSS/JavaScript và PostgreSQL trên Neon. SQLite không được hỗ trợ.

## Cấu trúc
- `backend/app/`: Python FastAPI, database, models, services và API.
- `backend/migrations/`, `backend/tests/`, `backend/requirements.txt`, `backend/alembic.ini`.
- `frontend/static/`: giao diện SPA, JavaScript, CSS; `frontend/templates/`: template có sẵn.
- `.env`, `.env.example`, `docker-compose.yml`, `run.bat`, `run.sh`: đặt ở thư mục gốc.

## Cấu hình Neon
1. Tạo project/database trên Neon và lấy connection string trong mục **Connect**.
2. Tạo file `.env` từ `.env.example` nếu chưa có.
3. Đặt `DATABASE_URL` trong `.env` theo dạng:
   ```text
   postgresql+psycopg://USER:PASSWORD@YOUR-NEON-HOST/DBNAME?sslmode=require
   ```
   Thay các phần mẫu bằng thông tin kết nối Neon của bạn. Không chia sẻ hoặc commit file `.env`.

Ứng dụng yêu cầu `DATABASE_URL` PostgreSQL hợp lệ và sẽ dừng với thông báo lỗi nếu thiếu URL hoặc URL trỏ tới SQLite. Khi khởi động, ứng dụng tạo các bảng cần thiết trên database Neon. Dữ liệu trong `uniroom.db` không được tự động chuyển sang Neon.

## Chạy trên Windows
1. Mở thư mục dự án.
2. Nhấp đúp `run.bat` hoặc chạy `.\run.bat` trong PowerShell.
3. Mở http://127.0.0.1:8000

Nếu muốn chạy thủ công (PowerShell, từ thư mục gốc):
```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r backend/requirements.txt
Copy-Item .env.example .env   # chỉ khi chưa có .env; sau đó điền DATABASE_URL của Neon
$env:PYTHONPATH = (Join-Path (Get-Location) 'backend')
python -m uvicorn app.main:app --reload --reload-dir backend --host 127.0.0.1 --port 8000
```

## Linux/macOS
```bash
bash run.sh
```

## Alembic / kiểm thử
Chạy từ thư mục gốc với `PYTHONPATH` trỏ đến `backend`:
```bash
PYTHONPATH=backend alembic -c backend/alembic.ini upgrade head
PYTHONPATH=backend python -m pytest backend/tests
```

Các URL `/`, `/static/...`, `/api/...` được giữ nguyên. Các thay đổi mã nguồn bắt buộc chỉ là hai đường dẫn phục vụ static/HTML trong `backend/app/main.py`; mã nghiệp vụ và UI không thay đổi.
