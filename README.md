# UniRoom – Nhóm 12 (tách frontend/backend)

Dự án **vẫn sử dụng FastAPI**, HTML/CSS/JavaScript và database/config như bản gốc. Không chuyển sang Django.

## Cấu trúc
- `backend/app/`: Python FastAPI, database, models, services và API.
- `backend/migrations/`, `backend/tests/`, `backend/requirements.txt`, `backend/alembic.ini`.
- `frontend/static/`: giao diện SPA, JavaScript, CSS; `frontend/templates/`: template có sẵn.
- `.env`, `.env.example`, `docker-compose.yml`, `run.bat`, `run.sh`: đặt ở thư mục gốc.

## Chạy trên Windows
1. Giải nén và mở thư mục `UniRoom-Nhom12-Fullstack-Organized`.
2. Nhấp đúp `run.bat` hoặc chạy `./run.bat` trong terminal PowerShell.
3. Mở http://127.0.0.1:8000

Nếu muốn chạy thủ công (PowerShell, từ thư mục gốc):
```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r backend/requirements.txt
Copy-Item .env.example .env   # chỉ khi chưa có .env
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

## Dữ liệu hiện có
Nếu bản cũ có `.env` và `uniroom.db` thật (không nằm trong ZIP), hãy sao chép chúng vào **thư mục gốc** dự án mới trước khi chạy để giữ dữ liệu và cấu hình cũ. Đừng xóa database.

Các URL `/`, `/static/...`, `/api/...` được giữ nguyên. Các thay đổi mã nguồn bắt buộc chỉ là hai đường dẫn phục vụ static/HTML trong `backend/app/main.py`; mã nghiệp vụ và UI không thay đổi.
