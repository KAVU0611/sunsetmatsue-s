#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DIST_DIR="$SCRIPT_DIR/dist"
TARGET_DIR="$DIST_DIR/python/lib/python3.12/site-packages"
PILLOW_VERSION="10.4.0"

rm -rf "$DIST_DIR"
mkdir -p "$TARGET_DIR" "$DIST_DIR/wheels"

pip download \
  --platform manylinux2014_x86_64 \
  --only-binary=:all: \
  --python-version 3.12 \
  --implementation cp \
  --abi cp312 \
  pillow==$PILLOW_VERSION \
  -d "$DIST_DIR/wheels"

for wheel in "$DIST_DIR"/wheels/*.whl; do
  python3 -m zipfile -e "$wheel" "$TARGET_DIR"
done

rm -rf "$DIST_DIR"/wheels
pushd "$DIST_DIR" >/dev/null
zip -r pillow-layer.zip python >/dev/null
popd >/dev/null

echo "Lambda layer artifact ready at $DIST_DIR/pillow-layer.zip"
