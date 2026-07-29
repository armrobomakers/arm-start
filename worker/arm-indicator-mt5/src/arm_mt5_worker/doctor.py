from __future__ import annotations

from datetime import datetime, timedelta, timezone
from pathlib import Path

from .config import Config
from .database import Database
from .mt5_adapter import MT5Adapter
from .seed import validate_seed


def doctor(config: Config, adapter: MT5Adapter | None = None) -> dict[str, object]:
    result: dict[str, object] = {"config": "OK", "terminal_path": "OK", "seed": "NOT_CONFIGURED", "database": "OK", "publish_url": "CONFIGURED" if config.publish_url else "NOT_CONFIGURED", "publish_secret": "CONFIGURED" if config.publish_secret else "NOT_CONFIGURED"}
    if not config.mt5_terminal_path.exists():
        result["terminal_path"] = "FAIL"
    if config.seed_path.exists():
        validate_seed(config.seed_path)
        result["seed"] = "OK"
    database = Database(config.db_path)
    database.initialize()
    if adapter:
        identity = adapter.connect_read_only()
        result.update({"mt5": "OK", "read_only": "OK", "login_match": identity.login == config.expected_login, "server_match": identity.server == config.expected_server, "trade_allowed": identity.trade_allowed})
        result["account_info"] = "OK" if adapter.account_info() is not None else "FAIL"
        adapter.history_deals_get(datetime.now(timezone.utc) - timedelta(minutes=5), datetime.now(timezone.utc))
        result["history_deals_get"] = "OK"
        adapter.close()
    return result
