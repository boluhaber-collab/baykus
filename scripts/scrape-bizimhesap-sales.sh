#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/apps/api"
if [[ -f .venv/bin/activate ]]; then source .venv/bin/activate; fi
exec python scripts/scrape_bizimhesap_sales.py "$@"
