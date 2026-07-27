from __future__ import annotations

import json
from datetime import date
from math import isfinite
from pathlib import Path


class SeedError(ValueError):
    pass


def validate_seed(path: Path, today: date | None = None) -> list[dict]:
    today = today or date.today()
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise SeedError("seed must be valid JSON") from exc
    if not isinstance(data, list) or not data:
        raise SeedError("seed must be a non-empty array")
    result = []
    previous = None
    for item in data:
        if not isinstance(item, dict) or set(item) - {"date", "value"} or "date" not in item or "value" not in item:
            raise SeedError("seed entries must contain only date and value")
        try:
            current = date.fromisoformat(item["date"])
        except (TypeError, ValueError) as exc:
            raise SeedError("seed date must be YYYY-MM-DD") from exc
        value = float(item["value"])
        if not isfinite(value) or abs(value) > 1000:
            raise SeedError("seed value is outside sanity limits")
        if current > today:
            raise SeedError("seed cannot contain future dates")
        if previous and current <= previous:
            raise SeedError("seed dates must be chronological and unique")
        previous = current
        result.append({"date": current.isoformat(), "value": round(value, 8)})
    if (date.fromisoformat(result[-1]["date"]) - date.fromisoformat(result[0]["date"])).days < 89:
        raise SeedError("seed must cover at least 90 calendar days")
    return result


def load_seed(path: Path) -> list[dict]:
    return validate_seed(path)


def combine_seed_and_live(seed: list[dict], live: list[dict]) -> list[dict]:
    cutoff = seed[-1]["date"]
    if any(item["date"] <= cutoff for item in live):
        raise SeedError("live daily return is not strictly after the seed cutoff")
    combined = seed + sorted(live, key=lambda item: item["date"])
    dates = [item["date"] for item in combined]
    if len(dates) != len(set(dates)):
        raise SeedError("combined seed/live series contains duplicate dates")
    return combined
