#!/usr/bin/env bash
set -euo pipefail

# ====== 設定 ======
REGION="${REGION:-us-east-1}"
API_URL="${API_URL:-https://3s9sgxfexe.execute-api.us-east-1.amazonaws.com/prod}"
API_PATH="${API_PATH:-/generate-card}"
LAMBDA_NAME="${LAMBDA_NAME:-SunsetForecastStack-GenerateCardHandlerB6ED5B8E-9k1jPVJ83BDu}"

# ====== 事前チェック ======
if [[ "${API_PATH}" != /* ]]; then API_PATH="/${API_PATH}"; fi
API_ENDPOINT="${API_URL%/}${API_PATH}"

for cmd in aws curl python3 zip jq; do
  command -v "$cmd" >/dev/null 2>&1 || { echo "Missing dependency: $cmd" >&2; exit 1; }
done

if [[ ! -f lambda_function.py ]]; then
  echo "lambda_function.py not found in $(pwd)" >&2
  exit 1
fi

echo "[1/7] Target Lambda: ${LAMBDA_NAME}"
echo "[2/7] API Endpoint:  ${API_ENDPOINT}"

# ====== ペイロード ======
DIAG_PAYLOAD='{}'
FINAL_PAYLOAD='{"style":"simple","score":92,"sunsetTime":"16:42","spot":"宍道湖"}'

# ====== 作業ディレクトリ ======
diag_tmp="$(mktemp -d /tmp/diag-lambda.XXXXXX)"
prod_tmp="$(mktemp -d /tmp/prod-lambda.XXXXXX)"
cleanup() { rm -rf "$diag_tmp" "$prod_tmp"; }
trap cleanup EXIT

# ====== 診断デプロイ ======
echo "[3/7] Build & deploy diagnostic handler..."
DIAG_VERSION="diag-$(date +%s)"

cat > "${diag_tmp}/lambda_function.py" <<PY
import json, os
CODE_VERSION = "${DIAG_VERSION}"
def lambda_handler(event, context):
    return {
        "statusCode": 200,
        "headers": {"Content-Type": "application/json", "Access-Control-Allow-Origin": "*"},
        "body": json.dumps({"ping":"OK","codeVersion":CODE_VERSION,"modelId":os.getenv("MODEL_ID")}, ensure_ascii=False)
    }
PY

diag_zip="${diag_tmp}/diag.zip"
( cd "$diag_tmp" && zip -qr "$diag_zip" lambda_function.py )

aws lambda update-function-code \
  --region "$REGION" \
  --function-name "$LAMBDA_NAME" \
  --zip-file "fileb://${diag_zip}" >/dev/null

aws lambda wait function-updated --region "$REGION" --function-name "$LAMBDA_NAME"

# ====== 診断呼び出し ======
echo "[4/7] Hitting API with diagnostic handler..."
diag_response="$(curl -fsS -X POST "$API_ENDPOINT" -H 'Content-Type: application/json' -d "$DIAG_PAYLOAD")"

# API Gateway 経由なら body に文字列として入ってる場合があるので吸収
export DIAG_RESPONSE="$diag_response" DIAG_VERSION
python3 - "$diag_response" <<'PY'
import json, os, sys
raw = sys.argv[1]
try:
    resp = json.loads(raw)
    # lambda-proxy の場合: {"statusCode":200,"body":"{...}"}
    if isinstance(resp, dict) and "body" in resp and isinstance(resp["body"], str):
        payload = json.loads(resp["body"])
    else:
        payload = resp
except Exception as e:
    raise SystemExit(f"Diagnostic parse failed: {e}")

if payload.get("ping") != "OK":
    raise SystemExit("Diagnostic ping failed")
if payload.get("codeVersion") != os.environ["DIAG_VERSION"]:
    raise SystemExit("Diagnostic codeVersion mismatch")
print("Diagnostic OK")
PY

# ====== 本番デプロイ ======
echo "[5/7] Deploy production handler from local lambda_function.py..."
prod_zip="${prod_tmp}/prod.zip"
( cd "$(dirname "$(readlink -f lambda_function.py)")" && zip -qr "$prod_zip" "lambda_function.py" )

aws lambda update-function-code \
  --region "$REGION" \
  --function-name "$LAMBDA_NAME" \
  --zip-file "fileb://${prod_zip}" >/dev/null

aws lambda wait function-updated --region "$REGION" --function-name "$LAMBDA_NAME"

aws lambda get-function-configuration \
  --region "$REGION" \
  --function-name "$LAMBDA_NAME" \
  --query '{LastModified:LastModified,CodeSha256:CodeSha256}' \
  | jq -r

# ====== 最終呼び出し ======
echo "[6/7] Final API call..."
final_response="$(curl -fsS -X POST "$API_ENDPOINT" -H 'Content-Type: application/json' -d "$FINAL_PAYLOAD")"

# 200/500 両方に対応して imageUrl を抽出（lambda-proxyも考慮）
FINAL_IMAGE_URL="$(
python3 - "$final_response" <<'PY'
import json, sys
raw = sys.argv[1]
try:
    resp = json.loads(raw)
    if isinstance(resp, dict) and "body" in resp and isinstance(resp["body"], str):
        body = json.loads(resp["body"])
    else:
        body = resp
except Exception:
    body = {}
print(body.get("imageUrl",""))
PY
)"

echo "[7/7] Result"
echo "LambdaName=${LAMBDA_NAME}"
if [[ -n "${FINAL_IMAGE_URL}" ]]; then
  echo "ImageUrl=${FINAL_IMAGE_URL}"
  echo "✅ Success"
else
  echo "ImageUrl=(not found)"
  echo "❌ The handler returned no imageUrl. Check CloudWatch logs:"
  echo "   aws logs tail \"/aws/lambda/${LAMBDA_NAME}\" --since 10m --follow --no-cli-pager"
  exit 1
fi
