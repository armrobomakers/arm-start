from __future__ import annotations

import hashlib
import json
import math
import os
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

from .config import Config
from .doctor import doctor
from .incremental import incremental_refresh
from .locks import LockBusyError
from .mt5_adapter import MT5Adapter
from .publisher import canonical_payload, sign_payload
from .seed import validate_seed


PRODUCTION_HOST = "arm-start.vercel.app"
PREVIEW_PREFIX = "arm-start-"
PREVIEW_SUFFIX = "-armrobomakers-7944s-projects.vercel.app"
STATE_NAME = "publish-state.json"


class DailySyncError(RuntimeError):
    pass


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _atomic_json(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    with temporary.open("w", encoding="utf-8", newline="") as handle:
        json.dump(value, handle, ensure_ascii=True, separators=(",", ":"))
        handle.flush()
        os.fsync(handle.fileno())
    os.replace(temporary, path)


def _request(url: str, *, method: str = "GET", headers: dict[str, str] | None = None, body: bytes | None = None) -> tuple[int, dict[str, str], bytes]:
    request = urllib.request.Request(url, data=body, method=method, headers=headers or {})
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            return response.status, dict(response.headers), response.read()
    except urllib.error.HTTPError as error:
        return error.code, dict(error.headers), error.read()


def _json(body: bytes) -> dict:
    try:
        result = json.loads(body.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise DailySyncError("Publish target returned invalid JSON") from exc
    if not isinstance(result, dict):
        raise DailySyncError("Publish target returned a non-object JSON response")
    return result


def _header_value(headers: dict[str, str], name: str) -> str:
    target = name.lower()
    for key, value in headers.items():
        if key.lower() == target:
            return str(value)
    return ""


def _log_line(handle, message: str) -> None:
    handle.write(message + "\n")
    handle.flush()


def _load_state(path: Path) -> dict:
    if not path.exists():
        return {"version": 1}
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise DailySyncError("publish state is invalid") from exc
    if not isinstance(value, dict):
        raise DailySyncError("publish state must be an object")
    return value


def _allowed_publish_url(url: str) -> bool:
    try:
        from urllib.parse import urlparse
        parsed = urlparse(url)
    except ValueError:
        return False

    host = parsed.netloc.lower()
    approved_host = host == PRODUCTION_HOST or (host.startswith(PREVIEW_PREFIX) and host.endswith(PREVIEW_SUFFIX))
    return parsed.scheme == "https" and approved_host and parsed.path == "/api/arm-indicator/publish" and not parsed.params and not parsed.query and not parsed.fragment


def _canonical_for_seed(config: Config, seed: list[dict]) -> tuple[dict, bytes, str]:
    data_as_of = seed[-1]["date"]
    fetched_at = f"{data_as_of}T00:00:00+00:00"
    payload = canonical_payload(config.system_id, config.account_name, seed, fetched_at=fetched_at)
    raw = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    return payload, raw, hashlib.sha256(raw).hexdigest()


def run_daily_sync(config: Config) -> dict[str, object]:
    root = config.db_path.parent.parent
    log_dir = root / "logs"
    log_dir.mkdir(parents=True, exist_ok=True)
    log_path = log_dir / f"daily-sync-{datetime.now(timezone.utc):%Y-%m-%d}.log"
    state_path = config.db_path.parent / "incremental" / STATE_NAME
    state = _load_state(state_path)
    started = _now()
    state.update({"version": 1, "lastRunStartedAtUtc": started, "lastRunResult": "RUNNING"})
    _atomic_json(state_path, state)

    with log_path.open("a", encoding="utf-8", newline="") as log:
        _log_line(log, f"START UTC: {started}")
        _log_line(log, f"WORKER USER: {os.environ.get('USERNAME', '-')}")
        try:
            if not _allowed_publish_url(config.publish_url):
                raise DailySyncError("publish URL is not an approved ARM indicator target")
            if not config.publish_secret:
                raise DailySyncError("publish secret is not configured")

            doctor_result = doctor(config, MT5Adapter(config.mt5_terminal_path, config.expected_login, config.expected_server, config.expected_company))
            doctor_ok = all(value != "FAIL" and not (key == "trade_allowed" and value is True) for key, value in doctor_result.items())
            if not doctor_ok:
                raise DailySyncError("doctor failed")
            _log_line(log, f"MT5 LOGIN MATCH: {doctor_result.get('login_match')}")
            _log_line(log, f"MT5 SERVER MATCH: {doctor_result.get('server_match')}")
            _log_line(log, f"READ ONLY: {doctor_result.get('read_only')}")
            _log_line(log, f"TRADE ALLOWED: {doctor_result.get('trade_allowed')}")

            adapter = MT5Adapter(config.mt5_terminal_path, config.expected_login, config.expected_server, config.expected_company)
            try:
                identity = adapter.connect_read_only()
                result = incremental_refresh(config.mt5_export_dir, config.seed_path, adapter, state_path=config.db_path.parent / "incremental" / "incremental-history.json")
            finally:
                adapter.close()
            seed = validate_seed(config.seed_path)
            if len(seed) < 90 or any(not math.isfinite(float(row["value"])) for row in seed):
                raise DailySyncError("dailyGain validation failed")
            payload, raw_body, payload_hash = _canonical_for_seed(config, seed)
            _log_line(log, f"INCREMENTAL INTERVAL: {result.get('start')} -> {result.get('end')}")
            _log_line(log, f"DEALS FETCHED: {result.get('deals', 0)}")
            _log_line(log, f"ORDERS FETCHED: {result.get('orders', 0)}")
            _log_line(log, f"DAILYGAIN BEFORE/AFTER: {result.get('before')} / {len(seed)}")
            _log_line(log, f"DATA AS OF: {seed[-1]['date']}")
            _log_line(log, f"PAYLOAD HASH: {payload_hash[:12]}")
            _log_line(log, f"PUBLISH TARGET: {config.publish_url}")

            current_url = config.publish_url.rsplit("/publish", 1)[0] + "/current"
            bypass_headers = {"x-vercel-protection-bypass": config.bypass_secret} if config.bypass_secret else {}
            current_status, current_headers, current_body = _request(current_url, headers=bypass_headers)
            if current_status != 200:
                raise DailySyncError(f"publish target current preflight HTTP {current_status}")
            current = _json(current_body)
            current_source = _header_value(current_headers, "x-arm-indicator-source")
            date_header = _header_value(current_headers, "date")
            if date_header:
                from email.utils import parsedate_to_datetime
                offset = abs(datetime.now(timezone.utc).timestamp() - parsedate_to_datetime(date_header).timestamp())
                if offset > 60:
                    raise DailySyncError("clock offset exceeds 60 seconds")
                _log_line(log, f"CLOCK OFFSET: {offset:.3f}")

            previous_hash = state.get("lastSuccessfulPayloadHash")
            same_target = state.get("lastSuccessfulPublishUrl") == config.publish_url
            same_snapshot = bool(state.get("lastSuccessfulSnapshotUpdatedAt")) and current.get("updatedAt") == state.get("lastSuccessfulSnapshotUpdatedAt")
            verified_current = current_source == "mt5-vps" and current.get("dataAsOf") == seed[-1]["date"] and current.get("stale") is False
            if same_target and previous_hash == payload_hash and same_snapshot and verified_current:
                finished = _now()
                state.update({
                    "lastSuccessfulDataAsOf": seed[-1]["date"],
                    "lastSuccessfulPayloadHash": payload_hash,
                    "lastSuccessfulPublishUrl": config.publish_url,
                    "lastSuccessfulPublishedAtUtc": state.get("lastSuccessfulPublishedAtUtc") or current.get("updatedAt"),
                    "lastSuccessfulSnapshotUpdatedAt": current.get("updatedAt"),
                    "lastHttpStatus": 200,
                    "lastVerificationStatus": "OK",
                    "lastRunFinishedAtUtc": finished,
                    "lastRunResult": "NO_CHANGE",
                })
                _atomic_json(state_path, state)
                _log_line(log, "NO_CHANGE")
                return {"result": "NO_CHANGE", "data_as_of": seed[-1]["date"], "hash": payload_hash[:12], "points": len(seed), "publish_requests": 0}

            timestamp = str(int(datetime.now(timezone.utc).timestamp()))
            headers = {
                "content-type": "application/json",
                "x-arm-timestamp": timestamp,
                "x-arm-signature": sign_payload(config.publish_secret, timestamp, raw_body),
            }
            if config.bypass_secret:
                headers["x-vercel-protection-bypass"] = config.bypass_secret
            status, _, body = _request(config.publish_url, method="POST", headers=headers, body=raw_body)
            response = _json(body)
            _log_line(log, "PUBLISH REQUESTS SENT: 1")
            _log_line(log, f"HTTP STATUS: {status}")
            if status != 200 or response.get("ok") is not True:
                finished = _now()
                state.update({"lastHttpStatus": status, "lastVerificationStatus": "NOT_RUN", "lastRunFinishedAtUtc": finished, "lastRunResult": "FAILED"})
                _atomic_json(state_path, state)
                _log_line(log, "FAILED")
                raise DailySyncError(f"publish HTTP {status}: {response.get('error')} {response.get('message')}")

            verify_status, verify_headers, verify_body = _request(current_url, headers=bypass_headers)
            verification = _json(verify_body)
            verify_source = _header_value(verify_headers, "x-arm-indicator-source")
            verification_ok = (
                verify_status == 200
                and response.get("source") == "mt5-vps"
                and verify_source == "mt5-vps"
                and response.get("dataAsOf") == seed[-1]["date"]
                and verification.get("dataAsOf") == seed[-1]["date"]
                and verification.get("updatedAt") == response.get("updatedAt")
                and verification.get("score") == response.get("score")
                and verification.get("zone") == response.get("zone")
                and verification.get("stale") is False
            )
            finished = _now()
            if verification_ok:
                state.update({
                    "lastSuccessfulDataAsOf": seed[-1]["date"],
                    "lastSuccessfulPayloadHash": payload_hash,
                    "lastSuccessfulPublishUrl": config.publish_url,
                    "lastSuccessfulPublishedAtUtc": finished,
                    "lastSuccessfulSnapshotUpdatedAt": response.get("updatedAt"),
                    "lastHttpStatus": status,
                    "lastVerificationStatus": "OK",
                    "lastRunFinishedAtUtc": finished,
                    "lastRunResult": "PUBLISHED",
                })
            else:
                state.update({
                    "lastHttpStatus": status,
                    "lastVerificationStatus": "FAILED",
                    "lastRunFinishedAtUtc": finished,
                    "lastRunResult": "VERIFICATION_FAILED",
                })
            _atomic_json(state_path, state)
            _log_line(log, f"GET VERIFICATION STATUS: {verify_status}")
            _log_line(log, f"GET VERIFICATION SOURCE: {verify_source or '-'}")
            _log_line(log, f"SCORE: {verification.get('score')}")
            _log_line(log, f"ZONE: {verification.get('zone')}")
            if not verification_ok:
                raise DailySyncError("GET verification failed")
            _log_line(log, "PUBLISHED")
            return {"result": "PUBLISHED", "data_as_of": seed[-1]["date"], "hash": payload_hash[:12], "points": len(seed), "publish_requests": 1, "verification": "OK", "score": verification.get("score"), "zone": verification.get("zone")}
        except Exception:
            if state.get("lastRunResult") == "RUNNING":
                state.update({"lastRunFinishedAtUtc": _now(), "lastRunResult": "FAILED"})
                _atomic_json(state_path, state)
            raise
