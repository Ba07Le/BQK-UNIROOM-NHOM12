#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"
[ -d .venv ] || python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r backend/requirements.txt
[ -f .env ] || cp .env.example .env
export PYTHONPATH="$(pwd)/backend${PYTHONPATH:+:$PYTHONPATH}"
python -m uvicorn app.main:app --reload --reload-dir backend --host 127.0.0.1 --port 8000
