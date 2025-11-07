import hashlib
import json
import logging
import os
import time
import urllib.error
import urllib.request
from typing import Dict, List, Optional, Tuple

import boto3
from botocore.exceptions import ClientError


LOGGER = logging.getLogger(__name__)
LOGGER.setLevel(logging.INFO)


def _send_response(
    event: Dict,
    context,
    status: str,
    response_data: Optional[Dict] = None,
    physical_resource_id: Optional[str] = None,
    reason: Optional[str] = None
) -> None:
    """Send the response to CloudFormation regardless of execution outcome."""
    response_url = event.get("ResponseURL")
    if not response_url:
        LOGGER.error("Missing ResponseURL in event; cannot report status")
        return

    response_body = {
        "Status": status,
        "Reason": reason or f"See CloudWatch Logs: {getattr(context, 'log_stream_name', 'unknown')}",
        "PhysicalResourceId": physical_resource_id or getattr(context, "log_stream_name", "unknown"),
        "StackId": event.get("StackId"),
        "RequestId": event.get("RequestId"),
        "LogicalResourceId": event.get("LogicalResourceId"),
        "NoEcho": False,
        "Data": response_data or {}
    }

    LOGGER.info("Sending CloudFormation response: %s", json.dumps(response_body))
    data = json.dumps(response_body).encode("utf-8")
    request = urllib.request.Request(
        response_url,
        data=data,
        headers={"Content-Type": "", "Content-Length": str(len(data))},
        method="PUT"
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            LOGGER.info("CloudFormation response status: %s", response.status)
    except urllib.error.HTTPError as err:
        LOGGER.error("Failed to PUT response to CloudFormation: %s", err)
    except urllib.error.URLError as err:
        LOGGER.error("Network error when responding to CloudFormation: %s", err)


def _normalize_zone_id(zone_id: str) -> str:
    return zone_id.replace("/hostedzone/", "") if zone_id else zone_id


def _certificate_matches(certificate: Dict, domain: str, sans: List[str]) -> bool:
    cert_domain = certificate.get("DomainName")
    cert_sans = sorted(
        name for name in certificate.get("SubjectAlternativeNames", []) if name != cert_domain
    )
    return cert_domain == domain and cert_sans == sorted(sans)


def _find_existing_certificate(
    acm,
    domain: str,
    sans: List[str]
) -> Optional[Dict]:
    paginator = acm.get_paginator("list_certificates")
    sans_set = set(sans)

    for page in paginator.paginate(
        CertificateStatuses=["ISSUED", "PENDING_VALIDATION", "INACTIVE"]
    ):
        for summary in page.get("CertificateSummaryList", []):
            if summary.get("DomainName") != domain:
                continue
            arn = summary["CertificateArn"]
            description = acm.describe_certificate(CertificateArn=arn)["Certificate"]
            cert_sans = set(
                name
                for name in description.get("SubjectAlternativeNames", [])
                if name != description.get("DomainName")
            )
            if cert_sans == sans_set:
                return description
    return None


def _ensure_validation_records(
    acm,
    route53,
    certificate_arn: str,
    hosted_zone_id: str,
    max_attempts: int = 40,
    delay_seconds: int = 10
) -> List[Dict]:
    """Fetch and UPSERT the DNS validation CNAMEs for the certificate."""
    normalized_zone_id = _normalize_zone_id(hosted_zone_id)
    for attempt in range(1, max_attempts + 1):
        certificate = acm.describe_certificate(CertificateArn=certificate_arn)["Certificate"]
        dvos = certificate.get("DomainValidationOptions", [])
        records = [
            dvo.get("ResourceRecord")
            for dvo in dvos
            if dvo.get("ResourceRecord") and dvo["ValidationStatus"] in ("PENDING_VALIDATION", "SUCCESS")
        ]
        unique_records = {}
        for record in records:
            unique_records[record["Name"]] = record
        if unique_records:
            _upsert_records(route53, normalized_zone_id, list(unique_records.values()))
            return list(unique_records.values())
        LOGGER.info(
            "DomainValidationOptions not ready (attempt %s/%s); sleeping %ss",
            attempt,
            max_attempts,
            delay_seconds
        )
        time.sleep(delay_seconds)

    raise TimeoutError(
        f"Timed out waiting for DomainValidationOptions for certificate {certificate_arn}"
    )


def _upsert_records(route53, zone_id: str, records: List[Dict]) -> None:
    changes = []
    for record in records:
        change = {
            "Action": "UPSERT",
            "ResourceRecordSet": {
                "Name": record["Name"],
                "Type": record["Type"],
                "TTL": 60,
                "ResourceRecords": [{"Value": record["Value"]}]
            }
        }
        LOGGER.info(
            "UPSERT hosted zone %s: %s %s %s",
            zone_id,
            record["Name"],
            record["Type"],
            record["Value"]
        )
        changes.append(change)
    route53.change_resource_record_sets(
        HostedZoneId=zone_id,
        ChangeBatch={"Comment": "Ensure ACM validation records", "Changes": changes}
    )


def _wait_for_issuance(
    acm,
    certificate_arn: str,
    timeout_seconds: int,
    poll_seconds: int = 20
) -> Dict:
    deadline = time.time() + timeout_seconds
    while time.time() < deadline:
        certificate = acm.describe_certificate(CertificateArn=certificate_arn)["Certificate"]
        status = certificate.get("Status")
        LOGGER.info("Certificate %s status: %s", certificate_arn, status)
        if status == "ISSUED":
            return certificate
        if status in ("FAILED", "VALIDATION_TIMED_OUT", "REVOKED"):
            raise RuntimeError(f"Certificate {certificate_arn} failed with status {status}")
        time.sleep(poll_seconds)
    raise TimeoutError(f"Certificate {certificate_arn} still pending validation after {timeout_seconds}s")


def _request_certificate(
    acm,
    domain: str,
    sans: List[str],
    transparency_preference: Optional[str],
    request_id: str
) -> str:
    token = hashlib.sha256(request_id.encode("utf-8")).hexdigest()[:32]
    kwargs = {
        "DomainName": domain,
        "ValidationMethod": "DNS",
        "IdempotencyToken": token
    }
    if sans:
        kwargs["SubjectAlternativeNames"] = sans
    if transparency_preference:
        kwargs["Options"] = {"CertificateTransparencyLoggingPreference": transparency_preference}
    response = acm.request_certificate(**kwargs)
    LOGGER.info("Requested certificate %s for %s", response["CertificateArn"], domain)
    return response["CertificateArn"]


def _ensure_certificate(
    event: Dict,
    acm,
    route53,
    domain: str,
    sans: List[str],
    hosted_zone_id: str,
    transparency_preference: Optional[str],
    skip_wait: bool,
    wait_seconds: int,
    existing_arn: Optional[str]
) -> Tuple[str, str]:
    certificate = None
    response_status = "UNKNOWN"

    if existing_arn:
        try:
            certificate = acm.describe_certificate(CertificateArn=existing_arn)["Certificate"]
            LOGGER.info("Found existing certificate %s from PhysicalResourceId", existing_arn)
        except ClientError as err:
            if err.response["Error"]["Code"] != "ResourceNotFoundException":
                raise

    if certificate and not _certificate_matches(certificate, domain, sans):
        LOGGER.info("Existing certificate %s does not match desired SANs; requesting new certificate", existing_arn)
        certificate = None

    if certificate is None:
        certificate = _find_existing_certificate(acm, domain, sans)
        if certificate:
            LOGGER.info("Reusing previously issued certificate %s", certificate["CertificateArn"])

    if certificate is None:
        arn = _request_certificate(acm, domain, sans, transparency_preference, event["RequestId"])
        certificate = acm.describe_certificate(CertificateArn=arn)["Certificate"]

    certificate_arn = certificate["CertificateArn"]
    _ensure_validation_records(acm, route53, certificate_arn, hosted_zone_id)

    if skip_wait:
        LOGGER.info("SKIP_WAIT enabled; returning without waiting for issuance")
        response_status = certificate.get("Status", "PENDING_VALIDATION")
        return certificate_arn, response_status

    issued_certificate = _wait_for_issuance(acm, certificate_arn, wait_seconds)
    response_status = issued_certificate.get("Status", "UNKNOWN")
    return certificate_arn, response_status


def handler(event, context):
    LOGGER.info(
        "RequestId=%s RequestType=%s LogicalResourceId=%s",
        event.get("RequestId"),
        event.get("RequestType"),
        event.get("LogicalResourceId")
    )
    props = event.get("ResourceProperties") or {}
    domain = props["DomainName"]
    sans = props.get("SubjectAlternativeNames") or []
    hosted_zone_id = props["HostedZoneId"]
    region = props.get("Region") or os.environ.get("ACM_REGION", "us-east-1")
    transparency_preference = props.get("CertificateTransparencyLoggingPreference")
    skip_wait = os.environ.get("SKIP_WAIT", "0") == "1"
    wait_seconds = int(os.environ.get("MAX_WAIT_SECONDS", "900"))

    acm = boto3.client("acm", region_name=region)
    route53 = boto3.client("route53")

    status = "SUCCESS"
    reason = None
    data: Dict[str, str] = {}
    physical_resource_id = event.get("PhysicalResourceId")

    try:
        request_type = event["RequestType"]
        if request_type in ("Create", "Update"):
            certificate_arn, certificate_status = _ensure_certificate(
                event,
                acm,
                route53,
                domain,
                sans,
                hosted_zone_id,
                transparency_preference,
                skip_wait,
                wait_seconds,
                physical_resource_id
            )
            physical_resource_id = certificate_arn
            data = {
                "CertificateArn": certificate_arn,
                "CertificateStatus": certificate_status
            }
        elif request_type == "Delete":
            LOGGER.info("Delete request received; leaving certificate in place for reuse")
            status = "SUCCESS"
        else:
            raise ValueError(f"Unsupported RequestType {request_type}")
    except Exception as err:
        LOGGER.exception("Certificate requestor failed")
        status = "FAILED"
        reason = str(err)

    _send_response(event, context, status, data, physical_resource_id, reason)
