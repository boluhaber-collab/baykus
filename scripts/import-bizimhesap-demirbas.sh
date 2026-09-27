#!/usr/bin/env bash
# BizimHesap → Baykuş demirbaş import (SQLite local).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/apps/api"
if [[ -f .venv/bin/activate ]]; then
  # shellcheck disable=SC1091
  source .venv/bin/activate
elif [[ -f .venv/Scripts/activate ]]; then
  # Windows git-bash
  # shellcheck disable=SC1091
  source .venv/Scripts/activate
fi
export DATABASE_URL="${DATABASE_URL:-sqlite:///./baykus.db}"
exec python scripts/import_bizimhesap_demirbas.py "$@"
