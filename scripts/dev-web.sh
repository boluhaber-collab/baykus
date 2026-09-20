#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../apps/web"
export NEXT_PUBLIC_API_URL="${NEXT_PUBLIC_API_URL:-http://localhost:8000}"
npm run dev
