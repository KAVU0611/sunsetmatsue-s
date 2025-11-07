#!/usr/bin/env bash
set -euo pipefail

REGION="${AWS_REGION:-us-east-1}"
DOMAIN="${MY_DOMAIN_NAME:?Environment variable MY_DOMAIN_NAME is required}"

if [[ -n "${HOSTED_ZONE_ID:-}" ]]; then
  ZONE_ID="${HOSTED_ZONE_ID}"
else
  ZONE_ID="$(aws route53 list-hosted-zones-by-name --dns-name "${DOMAIN}" --query 'HostedZones[0].Id' --output text)"
fi

if [[ -z "${ZONE_ID}" || "${ZONE_ID}" == "None" ]]; then
  echo "Unable to locate hosted zone for ${DOMAIN}" >&2
  exit 1
fi

ZONE_ID="${ZONE_ID#/hostedzone/}"
echo "Ensuring ACM validation records for ${DOMAIN} in hosted zone ${ZONE_ID}"

WAIT_SECONDS="${CERT_ENSURE_WAIT_SECONDS:-0}"
if ! [[ "${WAIT_SECONDS}" =~ ^[0-9]+$ ]]; then
  echo "CERT_ENSURE_WAIT_SECONDS must be an integer value" >&2
  exit 1
fi

ARNS="$(aws acm list-certificates --region "${REGION}" --query "CertificateSummaryList[?contains(DomainName, '${DOMAIN}')].CertificateArn" --output text)"
if [[ -z "${ARNS}" || "${ARNS}" == "None" ]]; then
  echo "No ACM certificates found for ${DOMAIN}"
  exit 0
fi

ensure_record() {
  local name="$1"
  local type="$2"
  local value="$3"
  local change_file
  change_file="$(mktemp)"
  jq -n --arg NAME "${name}" --arg TYPE "${type}" --arg VALUE "${value}" '{
    Comment: "Ensure ACM validation record",
    Changes: [{
      Action: "UPSERT",
      ResourceRecordSet: {
        Name: $NAME,
        Type: $TYPE,
        TTL: 60,
        ResourceRecords: [{Value: $VALUE}]
      }
    }]
  }' > "${change_file}"
  aws route53 change-resource-record-sets --hosted-zone-id "${ZONE_ID}" --change-batch "file://${change_file}" >/dev/null
  rm -f "${change_file}"
  echo "  Upserted ${name}"
}

for ARN in ${ARNS}; do
  [[ -z "${ARN}" ]] && continue
  echo "Processing ${ARN}"
  aws acm describe-certificate --certificate-arn "${ARN}" --region "${REGION}" \
    --query "Certificate.DomainValidationOptions[].ResourceRecord" --output json |
    jq -c '.[]? | select(.Name != null and .Value != null)' |
    while read -r record; do
      NAME="$(echo "${record}" | jq -r '.Name')"
      TYPE="$(echo "${record}" | jq -r '.Type')"
      VALUE="$(echo "${record}" | jq -r '.Value')"
      ensure_record "${NAME}" "${TYPE}" "${VALUE}"
    done

  if [[ "${WAIT_SECONDS}" -gt 0 ]]; then
    deadline=$(( $(date +%s) + WAIT_SECONDS ))
    while [[ $(date +%s) -lt ${deadline} ]]; do
      STATUS="$(aws acm describe-certificate --certificate-arn "${ARN}" --region "${REGION}" --query "Certificate.Status" --output text)"
      echo "  Current status ${STATUS}"
      [[ "${STATUS}" == "ISSUED" ]] && break
      sleep 20
    done
  fi
done
