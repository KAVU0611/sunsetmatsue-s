#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SOURCE_DIR="/mnt/c/Users/kavu1/Downloads/matsuesunsetai.comUI案"
TARGET_DIR="$ROOT_DIR/frontend/public/ui"
MANIFEST_JSON="$ROOT_DIR/frontend/public/ui/manifest.json"
MANIFEST_TS="$ROOT_DIR/frontend/src/lib/ui-samples.ts"

mkdir -p "$TARGET_DIR"
shopt -s nullglob
copied=0
for file in "$SOURCE_DIR"/*.{png,PNG,jpg,JPG,jpeg,JPEG,webp,WEBP}; do
  if [ -f "$file" ]; then
    cp -f "$file" "$TARGET_DIR/"
    copied=$((copied + 1))
  fi
done
shopt -u nullglob

ROOT_DIR="$ROOT_DIR" node <<'NODE'
const fs = require('fs');
const path = require('path');
const root = process.env.ROOT_DIR;
if (!root) process.exit(0);
const targetDir = path.join(root, 'frontend/public/ui');
const manifestJson = path.join(root, 'frontend/public/ui/manifest.json');
const manifestTs = path.join(root, 'frontend/src/lib/ui-samples.ts');
if (!fs.existsSync(targetDir)) process.exit(0);
const files = fs
  .readdirSync(targetDir)
  .filter((file) => /\.(png|jpe?g|webp)$/i.test(file))
  .sort((a, b) => a.localeCompare(b, 'ja'));
fs.writeFileSync(manifestJson, JSON.stringify({ files }, null, 2), 'utf8');
const ts = `export const uiSamples = ${JSON.stringify(
  files.map((file) => `/ui/${file}`)
)} as const;\n`;
fs.writeFileSync(manifestTs, ts, 'utf8');
NODE

echo "Copied $copied asset(s) into $TARGET_DIR" >&2
