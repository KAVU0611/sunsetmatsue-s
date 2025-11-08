#!/usr/bin/env bash
set -euo pipefail
API_BASE="https://3s9sgxfexe.execute-api.us-east-1.amazonaws.com/prod"
EXPECT_ORIGIN="https://matsuesunsetai.com"

check_header() {
  local response=$1
  local header value
  header=$(printf '%s\n' "$response" | tr -d '\r' | grep -i '^Access-Control-Allow-Origin:') || true
  value=${header#*: }
  if [[ "$value" != "$EXPECT_ORIGIN" ]]; then
    echo "[WARN] Expected Access-Control-Allow-Origin: $EXPECT_ORIGIN but got '${value:-<missing>}'" >&2
  else
    echo "[OK] Access-Control-Allow-Origin header present" >&2
  fi
}

options_index=$(curl -is -X OPTIONS "$API_BASE/v1/sunset-index")
check_header "$options_index"
printf '%s\n' "$options_index"

curl -s "$API_BASE/v1/sunset-index?lat=35.468&lon=133.050" | jq .

options_card=$(curl -is -X OPTIONS "$API_BASE/v1/generate-card")
check_header "$options_card"
printf '%s\n' "$options_card"

today="$(date +%F)"
PAYLOAD=$(cat <<JSON
{
  "location": "検証スポット",
  "date": "$today",
  "conditions": "快晴",
  "style": "gradient",
  "textSize": "md",
  "score": 80,
  "sunsetTime": "17:05"
}
JSON
)

post_response=$(curl -is -X POST "$API_BASE/v1/generate-card" \
  -H 'Content-Type: application/json' \
  -d "$PAYLOAD")
check_header "$post_response"
printf '%s\n' "$post_response"

curl -s -X POST "$API_BASE/v1/generate-card" \
  -H 'Content-Type: application/json' \
  -d "$PAYLOAD" | jq .
