@echo off
cd /d "%~dp0"
if not exist .venv (
  python -m venv .venv
  if errorlevel 1 goto :error
)
call .venv\Scripts\activate.bat
".venv\Scripts\python.exe" -m pip install -r backend\requirements.txt
if errorlevel 1 goto :error
if not exist .env copy .env.example .env
set "PYTHONPATH=%CD%\backend"
".venv\Scripts\python.exe" -m uvicorn app.room_manager_app:app --app-dir backend --reload --reload-dir backend --host 127.0.0.1 --port 8000
pause
exit /b
:error
echo Khong the khoi dong UniRoom Room Manager. Kiem tra Python va requirements.
pause
exit /b 1
