#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
FRONTEND_DIR="$ROOT_DIR/frontend"
cd "$ROOT_DIR"
npm --prefix "$FRONTEND_DIR" install
npm --prefix "$FRONTEND_DIR" run build
npm --prefix "$FRONTEND_DIR" run deploy:s3
npm --prefix "$FRONTEND_DIR" run invalidate
