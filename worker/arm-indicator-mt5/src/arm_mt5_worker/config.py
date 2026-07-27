from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


class ConfigError(ValueError):
    pass


def _parse_env(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    if not path.exists():
        return values
    for raw in path.read_text(encoding="utf-8-sig").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip().strip("'\"")
    return values


def _value(values: dict[str, str], key: str, default: str | None = None) -> str | None:
    return os.environ.get(key, values.get(key, default))


def _required(values: dict[str, str], key: str) -> str:
    value = _value(values, key)
    if not value:
        raise ConfigError(f"Missing required configuration: {key}")
    return value


def _int(values: dict[str, str], key: str, default: int) -> int:
    raw = _value(values, key, str(default))
    try:
        result = int(raw or default)
    except ValueError as exc:
        raise ConfigError(f"{key} must be an integer") from exc
    if result <= 0:
        raise ConfigError(f"{key} must be positive")
    return result


@dataclass(frozen=True)
class Config:
    mt5_terminal_path: Path
    expected_login: int
    expected_server: str
    expected_company: str | None
    require_read_only: bool
    system_id: str
    account_name: str
    sample_interval_seconds: int
    day_timezone: str
    day_close_time: str
    day_close_tolerance_seconds: int
    flow_snapshot_max_gap_seconds: int
    publish_delay_minutes: int
    cashflow_policy_path: Path | None
    db_path: Path
    seed_path: Path
    outbox_path: Path
    publish_url: str
    publish_secret: str
    bypass_secret: str
    http_timeout_seconds: int


def load_config(env_path: str | Path | None = None) -> Config:
    path = Path(env_path or os.environ.get("ARM_WORKER_ENV_PATH", "C:/ARM/indicator-mt5-worker/config/worker.env"))
    values = _parse_env(path)
    terminal = Path(_required(values, "MT5_TERMINAL_PATH"))
    if not terminal.is_absolute():
        raise ConfigError("MT5_TERMINAL_PATH must be absolute")
    try:
        login = int(_required(values, "MT5_EXPECTED_LOGIN"))
    except ValueError as exc:
        raise ConfigError("MT5_EXPECTED_LOGIN must be an integer") from exc
    timezone = _required(values, "ARM_DAY_TIMEZONE")
    publish_url = _required(values, "ARM_INDICATOR_PUBLISH_URL")
    publish_secret = _required(values, "ARM_INDICATOR_PUBLISH_SECRET")
    if len(publish_secret) < 32:
        raise ConfigError("ARM_INDICATOR_PUBLISH_SECRET must be at least 32 characters")
    policy = _value(values, "ARM_CASHFLOW_POLICY_PATH")
    return Config(
        mt5_terminal_path=terminal,
        expected_login=login,
        expected_server=_required(values, "MT5_EXPECTED_SERVER"),
        expected_company=_value(values, "MT5_EXPECTED_COMPANY"),
        require_read_only=_value(values, "MT5_REQUIRE_READ_ONLY", "true").lower() == "true",
        system_id=_value(values, "ARM_INDICATOR_SYSTEM_ID", "11020435") or "11020435",
        account_name=_value(values, "ARM_INDICATOR_ACCOUNT_NAME", "ARM TICKMILL VIP FUND") or "ARM TICKMILL VIP FUND",
        sample_interval_seconds=_int(values, "ARM_SAMPLE_INTERVAL_SECONDS", 30),
        day_timezone=timezone,
        day_close_time=_value(values, "ARM_DAY_CLOSE_TIME", "23:59:00") or "23:59:00",
        day_close_tolerance_seconds=_int(values, "ARM_DAY_CLOSE_TOLERANCE_SECONDS", 180),
        flow_snapshot_max_gap_seconds=_int(values, "ARM_FLOW_SNAPSHOT_MAX_GAP_SECONDS", 120),
        publish_delay_minutes=_int(values, "ARM_PUBLISH_DELAY_MINUTES", 10),
        cashflow_policy_path=Path(policy) if policy else None,
        db_path=Path(_value(values, "ARM_DB_PATH", "C:/ARM/indicator-mt5-worker/data/arm-indicator.db") or ""),
        seed_path=Path(_value(values, "ARM_SEED_PATH", "C:/ARM/indicator-mt5-worker/data/seed-daily-gain.json") or ""),
        outbox_path=Path(_value(values, "ARM_OUTBOX_PATH", "C:/ARM/indicator-mt5-worker/outbox") or ""),
        publish_url=publish_url,
        publish_secret=publish_secret,
        bypass_secret=_value(values, "VERCEL_AUTOMATION_BYPASS_SECRET", "") or "",
        http_timeout_seconds=_int(values, "ARM_HTTP_TIMEOUT_SECONDS", 20),
    )
