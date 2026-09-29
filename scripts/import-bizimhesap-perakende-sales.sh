#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/apps/api"
if [[ -f .venv/bin/activate ]]; then source .venv/bin/activate; fi
export DATABASE_URL="${DATABASE_URL:-sqlite:///./baykus.db}"
exec python scripts/import_bizimhesap_perakende_sales.py "$@"
