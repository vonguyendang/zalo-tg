#!/bin/sh
mkdir -p /Volumes/MacintoshHD-Data/DATA/code/zalo-tg/data/bot-api
exec telegram-bot-api \
  --api-id=14687465 \
  --api-hash=6c4167325edff7781efa88d63507d5d5 \
  --local \
  --dir=/Volumes/MacintoshHD-Data/DATA/code/zalo-tg/data/bot-api \
  --temp-dir=/tmp \
  --http-port=8081 \
  --verbosity=1
