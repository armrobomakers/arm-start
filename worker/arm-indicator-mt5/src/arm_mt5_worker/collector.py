from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from .database import Database
from .mt5_adapter import MT5Adapter, MT5SecurityError


def _number(value: Any) -> float:
    return float(value or 0.0)


def collect_snapshot(adapter: MT5Adapter, database: Database) -> dict[str, Any]:
    if adapter.identity is None:
        raise MT5SecurityError("identity must be validated before collecting snapshots")
    account = adapter.account_info()
    if account is None:
        raise MT5SecurityError("account_info returned no data")
    if int(account.login) != adapter.identity.login or str(account.server) != adapter.identity.server or bool(getattr(account, "trade_allowed", False)):
        raise MT5SecurityError("MT5 identity changed after validation")
    now = datetime.now(timezone.utc).isoformat()
    snapshot = {
        "timestamp_utc": now,
        "equity": _number(account.equity),
        "balance": _number(account.balance),
        "credit": _number(getattr(account, "credit", 0)),
        "profit": _number(getattr(account, "profit", 0)),
        "margin": _number(getattr(account, "margin", 0)),
        "login": int(account.login),
        "server": str(account.server),
        "collected_at_utc": now,
    }
    database.insert_snapshot(snapshot)
    return snapshot


def normalize_deal(adapter: MT5Adapter, deal: Any) -> dict[str, Any]:
    timestamp = int(getattr(deal, "time", 0))
    timestamp_msc = int(getattr(deal, "time_msc", timestamp * 1000))
    return {
        "ticket": int(getattr(deal, "ticket")),
        "time_utc": datetime.fromtimestamp(timestamp, timezone.utc).isoformat(),
        "time_msc": timestamp_msc,
        "type": adapter.deal_type_name(int(getattr(deal, "type", -1))),
        "entry": adapter.deal_entry_name(int(getattr(deal, "entry", -1))),
        "profit": _number(getattr(deal, "profit", 0)),
        "commission": _number(getattr(deal, "commission", 0)),
        "swap": _number(getattr(deal, "swap", 0)),
        "fee": _number(getattr(deal, "fee", 0)),
        "symbol": str(getattr(deal, "symbol", "") or ""),
        "comment": str(getattr(deal, "comment", "") or ""),
        "external_id": str(getattr(deal, "external_id", "") or ""),
        "position_id": int(getattr(deal, "position_id", 0) or 0),
        "magic": int(getattr(deal, "magic", 0) or 0),
    }


def sync_deals(adapter: MT5Adapter, database: Database, overlap_hours: int = 4) -> int:
    from datetime import timedelta

    cursor, _ = database.latest_deal_cursor()
    start = datetime.fromisoformat(cursor) - timedelta(hours=overlap_hours) if cursor else datetime.now(timezone.utc) - timedelta(days=365)
    end = datetime.now(timezone.utc) + timedelta(minutes=1)
    deals = [normalize_deal(adapter, item) for item in adapter.history_deals_get(start, end)]
    return database.insert_deals(deals)
