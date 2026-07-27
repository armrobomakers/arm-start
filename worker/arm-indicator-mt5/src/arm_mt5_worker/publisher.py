from __future__ import annotations

import hashlib
import hmac
import json
import time
import urllib.error
import urllib.request
from dataclasses import dataclass


@dataclass(frozen=True)
class PublishResult:
    status: int
    attempts: int


def sign_payload(secret: str, timestamp: str, raw_body: bytes) -> str:
    message = timestamp.encode("ascii") + b"." + raw_body
    return "v1=" + hmac.new(secret.encode("utf-8"), message, hashlib.sha256).hexdigest()


class Publisher:
    def __init__(self, url: str, secret: str, bypass: str = "", timeout: int = 20) -> None:
        self.url, self.secret, self.bypass, self.timeout = url, secret, bypass, timeout

    def publish(self, payload: dict, sleep=time.sleep) -> PublishResult:
        raw = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        last_error: Exception | None = None
        for attempt, delay in enumerate((0, 1, 3, 10), start=1):
            if delay:
                sleep(delay)
            timestamp = str(int(time.time()))
            request = urllib.request.Request(self.url, data=raw, method="POST", headers={"content-type": "application/json", "x-arm-timestamp": timestamp, "x-arm-signature": sign_payload(self.secret, timestamp, raw), **({"x-vercel-protection-bypass": self.bypass} if self.bypass else {})})
            try:
                with urllib.request.urlopen(request, timeout=self.timeout) as response:
                    if not 200 <= response.status < 300:
                        raise RuntimeError(f"publish HTTP {response.status}")
                    return PublishResult(response.status, attempt)
            except (urllib.error.URLError, TimeoutError, RuntimeError) as exc:
                last_error = exc
        raise RuntimeError(f"publish failed after 3 attempts: {last_error}") from last_error


def canonical_payload(system_id: str, account_name: str, daily_gain: list[dict]) -> dict:
    return {"version": 1, "systemId": str(system_id), "accountName": account_name, "fetchedAt": __import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat(), "dailyGain": sorted(daily_gain, key=lambda item: item["date"])}
