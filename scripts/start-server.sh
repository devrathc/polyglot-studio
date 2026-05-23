#!/bin/bash
# Wrapper invoked by launchd. Runs `next dev` so code edits hot-reload into
# the dock app automatically. Set MODE=prod to use a built `next start` instead
# (faster runtime, but you'd need to re-run `npm run app:install` after edits).

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_DIR"

PORT="${PORT:-3030}"
export PORT

MODE="${MODE:-dev}"
if [ "$MODE" = "prod" ]; then
  exec npm start
else
  exec npx next dev --port "$PORT"
fi
