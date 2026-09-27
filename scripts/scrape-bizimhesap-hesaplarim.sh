#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/apps/api"
if [[ -f .venv/bin/activate ]]; then
  # shellcheck disable=SC1091
  source .venv/bin/activate
elif [[ -f .venv/Scripts/activate ]]; then
  # shellcheck disable=SC1091
  source .venv/Scripts/activate
fi
OUT="${1:-$ROOT/tmp/bizimhesap/hesaplarim}"
export DATABASE_URL="${DATABASE_URL:-sqlite:///./baykus.db}"
python scripts/scrape_bizimhesap_hesaplarim.py --out "$OUT" "$@"
