import json
import logging
import os
from typing import Any, Dict

import requests

LOGGER = logging.getLogger(__name__)
LOGGER.setLevel(logging.INFO)

API_KEY = os.getenv("OPENWEATHER_API")
LAT = os.getenv("LAT", "35.468")
LON = os.getenv("LON", "133.048")


def lambda_handler(_event: Dict[str, Any], _context: Any) -> Dict[str, Any]:
    if not API_KEY:
        LOGGER.error("OPENWEATHER_API is not configured")
        return _response(500, {"message": "Weather integration not configured"})

    try:
        weather = _fetch_weather()
        score, breakdown = _compute_score(weather)
    except Exception as exc:
        LOGGER.exception("Failed to compute sunset score")
        return _response(500, {"message": f"Score computation failed: {exc}"})

    return _response(
        200,
        {
            "score": round(score, 1),
            "breakdown": breakdown,
            "source": "openweather",
            "coords": {"lat": float(LAT), "lon": float(LON)},
        },
    )


def _fetch_weather() -> Dict[str, Any]:
    url = "https://api.openweathermap.org/data/2.5/weather"
    params = {
        "lat": LAT,
        "lon": LON,
        "appid": API_KEY,
        "units": "metric",
    }
    response = requests.get(url, params=params, timeout=8)
    response.raise_for_status()
    return response.json()


def _compute_score(weather: Dict[str, Any]) -> tuple[float, Dict[str, Any]]:
    clouds = weather.get("clouds", {}).get("all", 50)
    humidity = weather.get("main", {}).get("humidity", 60)
    wind = weather.get("wind", {}).get("speed", 3.5)
    visibility = weather.get("visibility", 10000)

    cloud_term = max(0, 35 - abs(45 - clouds) * 0.7)
    humidity_term = max(0, 20 - max(0, humidity - 55) * 0.5)
    wind_term = max(0, 25 - max(0, wind - 2.5) * 5)
    visibility_term = max(0, 20 - max(0, (8000 - visibility) / 400))

    score = min(100, cloud_term + humidity_term + wind_term + visibility_term + 20)

    breakdown = {
        "clouds": {"value": clouds, "weight": round(cloud_term, 1)},
        "humidity": {"value": humidity, "weight": round(humidity_term, 1)},
        "wind": {"value": wind, "weight": round(wind_term, 1)},
        "visibility": {"value": visibility, "weight": round(visibility_term, 1)},
    }

    return score, breakdown


def _response(status_code: int, body: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "statusCode": status_code,
        "headers": {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET,OPTIONS",
            "Access-Control-Allow-Headers": "*",
        },
        "body": json.dumps(body, ensure_ascii=False),
    }
