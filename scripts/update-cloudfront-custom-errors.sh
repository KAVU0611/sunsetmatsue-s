#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DIST_ID="E1F0UDJZRMC56P"
CONFIG_PATH="$ROOT_DIR/infra/cloudfront/distribution-E1F0UDJZRMC56P.json"

if [[ ! -f "$CONFIG_PATH" ]]; then
  echo "missing distribution config at $CONFIG_PATH" >&2
  exit 1
fi

ETAG=$(aws cloudfront get-distribution-config --id "$DIST_ID" --query 'ETag' --output text)
aws cloudfront update-distribution \
  --id "$DIST_ID" \
  --if-match "$ETAG" \
  --distribution-config "file://$CONFIG_PATH"
