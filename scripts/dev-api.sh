#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../apps/api"
export DATABASE_URL="${DATABASE_URL:-postgresql+psycopg2://baykus:baykus@localhost:5432/baykus}"
alembic upgrade head
python -m app.seed
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
