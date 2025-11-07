import base64
import json
import logging
import os
import re
import uuid
from dataclasses import dataclass
from datetime import datetime
from io import BytesIO
from typing import Any, Dict, Optional

import boto3
from botocore.exceptions import BotoCoreError, ClientError
from PIL import Image, ImageDraw, ImageFont

LOGGER = logging.getLogger(__name__)
LOGGER.setLevel(logging.INFO)

MODEL_ID = os.getenv("MODEL_ID", "amazon.titan-image-generator-v1")
BEDROCK_REGION = os.getenv("BEDROCK_REGION", "us-east-1")
OUTPUT_BUCKET = os.getenv("OUTPUT_BUCKET")
CLOUDFRONT_DOMAIN = os.getenv("CLOUDFRONT_DOMAIN")
ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "*")
CODE_VERSION = os.getenv("CODE_VERSION", "2025-11-07-02")

if not OUTPUT_BUCKET:
    LOGGER.error(json.dumps({"message": "Missing OUTPUT_BUCKET env", "codeVersion": CODE_VERSION}))

bedrock = boto3.client("bedrock-runtime", region_name=BEDROCK_REGION)
s3 = boto3.client("s3")


class ValidationError(Exception):
    """Raised when the incoming payload is invalid."""


@dataclass
class CardRequest:
    location: str
    date: str
    style: str
    conditions: str
    score: str
    sunset_time: str
    prompt: Optional[str]

    def summary(self) -> Dict[str, str]:
        return {
            "location": self.location,
            "date": self.date,
            "style": self.style,
            "conditions": self.conditions,
            "score": self.score,
        }


def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    request_id = getattr(context, "aws_request_id", str(uuid.uuid4()))

    if event.get("httpMethod") == "OPTIONS":
        return _cors_response(204, request_id, event)

    try:
        card_request = _parse_payload(event)
        _log_info("request.received", request_id, payload=card_request.summary())

        raw_image = _generate_image_from_bedrock(card_request)
        card_image = _overlay_text(raw_image, card_request)
        object_key = _put_image_to_s3(card_image, card_request)

        response_payload = {
            "requestId": request_id,
            "objectKey": object_key,
            "s3Url": f"https://{OUTPUT_BUCKET}.s3.amazonaws.com/{object_key}",
            "codeVersion": CODE_VERSION,
        }
        if CLOUDFRONT_DOMAIN:
            response_payload["cloudFrontUrl"] = f"https://{CLOUDFRONT_DOMAIN}/{object_key}"

        _log_info(
            "request.completed",
            request_id,
            bucket=OUTPUT_BUCKET,
            objectKey=object_key,
        )
        return _cors_response(200, request_id, event, response_payload)
    except ValidationError as exc:
        _log_warning("request.validation_failed", request_id, error=str(exc))
        return _error_response(400, "ValidationError", str(exc), request_id, event)
    except Exception as exc:  # pylint: disable=broad-except
        _log_exception("request.failed", request_id, exc)
        return _error_response(500, "InternalError", "Image generation failed", request_id, event)


def _parse_payload(event: Dict[str, Any]) -> CardRequest:
    body = event.get("body")
    if event.get("isBase64Encoded"):
        body = base64.b64decode(body or "").decode("utf-8")

    if isinstance(body, str):
        body = body.strip() or "{}"
        try:
            payload = json.loads(body)
        except json.JSONDecodeError as exc:
            raise ValidationError(f"Invalid JSON payload: {exc}") from exc
    elif isinstance(body, dict):
        payload = body
    else:
        payload = {}

    location = str(payload.get("location", "")).strip()
    date = str(payload.get("date", "")).strip()
    style = str(payload.get("style", "sunset poster")).strip() or "sunset poster"
    conditions = str(payload.get("conditions") or payload.get("weather") or "clear sky").strip()
    score = str(payload.get("score") or "80").strip()
    sunset_time = str(
        payload.get("sunsetTime") or payload.get("time") or "18:45"
    ).strip()
    prompt = payload.get("prompt")

    if not location:
        raise ValidationError("location is required")
    if not date:
        raise ValidationError("date is required")

    return CardRequest(
        location=location,
        date=date,
        style=style,
        conditions=conditions,
        score=score,
        sunset_time=sunset_time,
        prompt=prompt,
    )


def _generate_image_from_bedrock(card: CardRequest) -> bytes:
    base_prompt = (
        "award-winning landscape photography, cinematic sunset over calm water, "
        "rich gradients, volumetric golden light, crisp focus, no text, no watermark. "
        f"Location hint: {card.location}. Date: {card.date}. "
        f"Weather impression: {card.conditions}. Style: {card.style}."
    )
    if card.prompt:
        base_prompt = f"{base_prompt} {card.prompt}"

    titan_payload = {
        "taskType": "TEXT_IMAGE",
        "textToImageParams": {"text": base_prompt},
        "imageGenerationConfig": {
            "numberOfImages": 1,
            "height": 768,
            "width": 512,
            "cfgScale": 8,
            "quality": "STANDARD",
        },
    }
    _log_info("bedrock.invoke", str(uuid.uuid4()), modelId=MODEL_ID)

    try:
        response = bedrock.invoke_model(
            modelId=MODEL_ID,
            contentType="application/json",
            accept="application/json",
            body=json.dumps(titan_payload).encode("utf-8"),
        )
        payload = response["body"].read()
    except (BotoCoreError, ClientError) as exc:
        raise RuntimeError(f"Bedrock invoke failed: {exc}") from exc

    try:
        parsed = json.loads(payload.decode("utf-8"))
    except Exception:
        try:
            return base64.b64decode(payload)
        except Exception as decode_error:  # pylint: disable=broad-except
            raise RuntimeError(f"Bedrock response decode failed: {decode_error}") from decode_error

    image_b64 = _extract_image_base64(parsed)
    if not image_b64:
        raise RuntimeError("No image data returned from Bedrock")

    if isinstance(image_b64, str) and image_b64.startswith("data:image"):
        image_b64 = image_b64.split(",", 1)[-1]

    try:
        return base64.b64decode(image_b64)
    except Exception as exc:  # pylint: disable=broad-except
        raise RuntimeError(f"Unable to decode image: {exc}") from exc


def _extract_image_base64(payload: Dict[str, Any]) -> Optional[str]:
    images = payload.get("images")
    if isinstance(images, list) and images:
        first = images[0]
        if isinstance(first, str):
            return first
        if isinstance(first, dict):
            return first.get("b64") or first.get("image")
    output = payload.get("output")
    if isinstance(output, dict):
        nested = output.get("images")
        if isinstance(nested, list) and nested:
            return nested[0]
    return payload.get("image")


def _overlay_text(image_bytes: bytes, card: CardRequest) -> bytes:
    with Image.open(BytesIO(image_bytes)).convert("RGBA") as base:
        width, height = base.size
        overlay = Image.new("RGBA", (width, height), (0, 0, 0, 0))
        draw = ImageDraw.Draw(overlay)

        gradient_height = int(height * 0.4)
        for y in range(gradient_height):
            alpha = int(220 * (y / gradient_height))
            draw.line([(0, height - y), (width, height - y)], fill=(13, 16, 35, alpha))

        font_large = _load_font(int(width * 0.08))
        font_medium = _load_font(int(width * 0.045))
        font_small = _load_font(int(width * 0.035))

        padding = int(width * 0.06)
        draw.text(
            (padding, height - gradient_height + padding),
            f"Sunset Score {card.score}",
            font=font_large,
            fill=(255, 255, 255, 240),
        )
        draw.text(
            (padding, height - gradient_height + padding + font_large.size + 12),
            f"{card.date} | 日の入り {card.sunset_time}",
            font=font_medium,
            fill=(255, 223, 186, 235),
        )
        draw.text(
            (padding, height - padding * 0.4),
            f"{card.location} — {card.conditions}",
            font=font_small,
            fill=(255, 200, 137, 235),
        )

        composed = Image.alpha_composite(base, overlay)
        buffer = BytesIO()
        composed.convert("RGB").save(buffer, format="JPEG", quality=92, optimize=True)
        buffer.seek(0)
        return buffer.read()


def _put_image_to_s3(image_bytes: bytes, card: CardRequest) -> str:
    timestamp = datetime.utcnow().strftime("%Y%m%dT%H%M%SZ")
    location_slug = re.sub(r"[^a-z0-9]+", "-", card.location.lower()).strip("-") or "location"
    object_key = f"images/{card.date}/{location_slug}-{timestamp}.jpg"

    s3.put_object(
        Bucket=OUTPUT_BUCKET,
        Key=object_key,
        Body=image_bytes,
        ContentType="image/jpeg",
        CacheControl="public, max-age=31536000, immutable",
    )
    return object_key


def _load_font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    font_candidates = [
        "/opt/fonts/NotoSansCJK-Regular.ttc",
        "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    ]
    for font_path in font_candidates:
        if os.path.exists(font_path):
            try:
                return ImageFont.truetype(font_path, size)
            except OSError:
                continue
    return ImageFont.load_default()


def _error_response(
    status_code: int,
    error_type: str,
    message: str,
    request_id: str,
    event: Dict[str, Any],
) -> Dict[str, Any]:
    payload = {
        "errorType": error_type,
        "message": message,
        "requestId": request_id,
    }
    return _cors_response(status_code, request_id, event, payload)


def _cors_response(
    status_code: int,
    request_id: str,
    event: Dict[str, Any],
    body: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    headers = event.get("headers") or {}
    origin = headers.get("origin") or headers.get("Origin")
    allow_origins = [origin.strip() for origin in ALLOWED_ORIGINS.split(",") if origin.strip()]
    allow_origin = "*"
    if allow_origins:
        if "*" in allow_origins:
            allow_origin = "*"
        elif origin and origin in allow_origins:
            allow_origin = origin
        else:
            allow_origin = allow_origins[0]

    response_body = body or {}
    if status_code < 400:
        response_body.setdefault("requestId", request_id)

    return {
        "statusCode": status_code,
        "headers": {
            "Access-Control-Allow-Origin": allow_origin,
            "Access-Control-Allow-Headers": "Content-Type,Authorization,X-Requested-With",
            "Access-Control-Allow-Methods": "OPTIONS,POST",
            "Access-Control-Allow-Credentials": "true",
            "Content-Type": "application/json",
        },
        "body": json.dumps(response_body, ensure_ascii=False),
    }


def _log_info(event: str, request_id: str, **kwargs: Any) -> None:
    LOGGER.info(json.dumps({"event": event, "requestId": request_id, **kwargs}, ensure_ascii=False))


def _log_warning(event: str, request_id: str, **kwargs: Any) -> None:
    LOGGER.warning(json.dumps({"event": event, "requestId": request_id, **kwargs}, ensure_ascii=False))


def _log_exception(event: str, request_id: str, exc: Exception) -> None:
    LOGGER.exception(
        json.dumps(
            {
                "event": event,
                "requestId": request_id,
                "errorType": exc.__class__.__name__,
                "message": str(exc),
            },
            ensure_ascii=False,
        )
    )
