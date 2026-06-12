#!/bin/sh
PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
mkdir -p "$PROJECT_DIR/data/bot-api"
exec telegram-bot-api \
  --api-id=14687465 \
  --api-hash=6c4167325edff7781efa88d63507d5d5 \
  --local \
  --dir="$PROJECT_DIR/data/bot-api" \
  --temp-dir=/tmp \
  --http-port=8081 \
  --verbosity=1
