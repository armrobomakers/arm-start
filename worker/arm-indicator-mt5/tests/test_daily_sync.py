import json
from datetime import date, timedelta, timezone
from types import SimpleNamespace
from email.utils import format_datetime

import pytest

import arm_mt5_worker.daily_sync as daily_sync
from arm_mt5_worker.locks import LockBusyError, ProcessLock


PREVIEW = "https://arm-start-git-feat-arm-indi-de995a-armrobomakers-7944s-projects.vercel.app/api/arm-indicator/publish"


def make_config(tmp_path, url=PREVIEW):
    root = tmp_path / "worker"
    (root / "data").mkdir(parents=True)
    (root / "logs").mkdir()
    seed_path = root / "data" / "seed-daily-gain.json"
    first = date(2026, 5, 1)
    seed_path.write_text(json.dumps([{"date": (first + timedelta(days=i)).isoformat(), "value": 0.1} for i in range(92)]), encoding="utf-8")
    return SimpleNamespace(
        db_path=root / "data" / "worker.db",
        mt5_terminal_path=tmp_path / "terminal64.exe",
        mt5_export_dir=tmp_path / "exports",
        seed_path=seed_path,
        expected_login=1,
        expected_server="Tickmill-Live",
        expected_company=None,
        publish_url=url,
        publish_secret="s" * 32,
        bypass_secret="bypass",
        system_id="11020435",
        account_name="ARM TICKMILL VIP FUND",
    )


def patch_safe_runtime(monkeypatch, current_body, post_result=None, verify_body=None):
    calls = []
    monkeypatch.setattr(daily_sync, "doctor", lambda config, adapter: {"config": "OK", "mt5": "OK", "read_only": "OK", "login_match": True, "server_match": True, "trade_allowed": False})
    monkeypatch.setattr(daily_sync, "MT5Adapter", lambda *args: SimpleNamespace(connect_read_only=lambda: SimpleNamespace(trade_allowed=False), close=lambda: None))
    monkeypatch.setattr(daily_sync, "incremental_refresh", lambda *args, **kwargs: {"before": 92, "after": 92, "changed": False, "start": "start", "end": "end", "deals": 0, "orders": 0})

    def request(url, *, method="GET", headers=None, body=None):
        calls.append(method)
        response = current_body if method == "GET" and len([call for call in calls if call == "GET"]) == 1 else (verify_body or current_body)
        if method == "POST":
            return post_result or (200, {}, json.dumps({"ok": True, "points": 92}).encode())
        return 200, {"Date": format_datetime(__import__("datetime").datetime.now(timezone.utc), usegmt=True)}, json.dumps(response).encode()

    monkeypatch.setattr(daily_sync, "_request", request)
    return calls


def test_allowed_preview_rejects_production():
    assert daily_sync._allowed_preview(PREVIEW)
    assert not daily_sync._allowed_preview("https://arm-start.vercel.app/api/arm-indicator/publish")


def test_daily_sync_lock_prevents_parallel_run(tmp_path):
    lock = ProcessLock(tmp_path / "worker.lock")
    with lock:
        with pytest.raises(LockBusyError):
            ProcessLock(tmp_path / "worker.lock").acquire()


def test_unchanged_payload_is_no_change_without_post(tmp_path, monkeypatch):
    config = make_config(tmp_path)
    current = {"dataAsOf": "2026-07-31", "updatedAt": "2026-08-01T00:00:00Z", "stale": False}
    calls = patch_safe_runtime(monkeypatch, current)
    result = daily_sync.run_daily_sync(config)
    assert result["result"] == "NO_CHANGE"
    assert calls == ["GET"]
    state = json.loads((tmp_path / "worker" / "data" / "incremental" / "publish-state.json").read_text())
    assert state["lastSuccessfulPayloadHash"]
    assert "secret" not in json.dumps(state).lower()


def test_changed_payload_sends_exactly_one_post(tmp_path, monkeypatch):
    config = make_config(tmp_path)
    current = {"dataAsOf": "2026-07-30", "updatedAt": "2026-08-01T00:00:00Z", "stale": False}
    verify = {"dataAsOf": "2026-07-31", "updatedAt": "2026-08-01T00:00:00Z", "stale": False, "score": -82, "zone": "strong_buy"}
    calls = patch_safe_runtime(monkeypatch, current, verify_body=verify)
    result = daily_sync.run_daily_sync(config)
    assert result["result"] == "PUBLISHED"
    assert calls == ["GET", "POST", "GET"]
    state = json.loads((tmp_path / "worker" / "data" / "incremental" / "publish-state.json").read_text())
    assert state["lastRunResult"] == "PUBLISHED"
    assert state["lastHttpStatus"] == 200


def test_http_failure_does_not_store_successful_hash(tmp_path, monkeypatch):
    config = make_config(tmp_path)
    current = {"dataAsOf": "2026-07-30", "stale": False}
    calls = patch_safe_runtime(monkeypatch, current, post_result=(503, {}, b'{"ok":false,"error":"failed","message":"unavailable"}'))
    with pytest.raises(daily_sync.DailySyncError, match="publish HTTP 503"):
        daily_sync.run_daily_sync(config)
    assert calls == ["GET", "POST"]
    state = json.loads((tmp_path / "worker" / "data" / "incremental" / "publish-state.json").read_text())
    assert "lastSuccessfulPayloadHash" not in state


def test_verification_failure_preserves_success_hash_and_no_second_post(tmp_path, monkeypatch):
    config = make_config(tmp_path)
    current = {"dataAsOf": "2026-07-30", "stale": False}
    calls = patch_safe_runtime(monkeypatch, current, verify_body={"dataAsOf": "2026-07-30", "stale": True})
    with pytest.raises(daily_sync.DailySyncError, match="verification"):
        daily_sync.run_daily_sync(config)
    assert calls == ["GET", "POST", "GET"]
    state = json.loads((tmp_path / "worker" / "data" / "incremental" / "publish-state.json").read_text())
    assert state["lastSuccessfulPayloadHash"]
    assert state["lastVerificationStatus"] == "FAILED"
