from __future__ import annotations

import json
from pathlib import Path
from typing import Callable


def queue_payload(directory: Path, payload: dict) -> Path:
    directory.mkdir(parents=True, exist_ok=True)
    dates = [item["date"] for item in payload.get("dailyGain", [])]
    name = f"pending-{max(dates) if dates else 'unknown'}.json"
    path = directory / name
    path.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    return path


def pending_payloads(directory: Path) -> list[Path]:
    return sorted(directory.glob("pending-*.json"))


def replay_oldest(directory: Path, send: Callable[[dict], object]) -> int:
    count = 0
    for path in pending_payloads(directory):
        payload = json.loads(path.read_text(encoding="utf-8"))
        send(payload)
        path.unlink()
        count += 1
    return count
