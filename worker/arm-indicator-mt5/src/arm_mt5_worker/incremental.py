from __future__ import annotations

import json
import math
import os
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

from .native_analysis import _event_time, _number
from .native_export import NativeExportError, _read_csv
from .seed import validate_seed


CALCULATION_VERSION = "balance-v2"
STATE_NAME = "incremental-history.json"
WINDOWS = (timedelta(minutes=15), timedelta(hours=2), timedelta(hours=12), timedelta(hours=36), timedelta(hours=72), timedelta(hours=120), timedelta(hours=168))
EXTERNAL_FLOW_SUFFIXES = ("BALANCE", "CREDIT")


def _atomic_json(path: Path, value: object) -> None:
    temporary = path.with_suffix(path.suffix + ".tmp")
    with temporary.open("w", encoding="utf-8", newline="") as handle:
        json.dump(value, handle, ensure_ascii=True, separators=(",", ":"))
        handle.flush()
        os.fsync(handle.fileno())
    os.replace(temporary, path)


def _normalize_order(order: object) -> dict[str, object]:
    return {"ticket": int(getattr(order, "ticket", 0)), "time_setup": int(getattr(order, "time_setup", 0)), "time_setup_msc": int(getattr(order, "time_setup_msc", 0)), "time_done": int(getattr(order, "time_done", 0)), "time_done_msc": int(getattr(order, "time_done_msc", 0))}


def _normalize_incremental_deal(adapter, deal: object) -> dict[str, object]:
    timestamp = int(getattr(deal, "time", 0))
    time_msc = int(getattr(deal, "time_msc", timestamp * 1000))
    type_value = int(getattr(deal, "type", -1))
    entry_value = int(getattr(deal, "entry", -1))
    return {
        "ticket": int(getattr(deal, "ticket", 0)), "order": int(getattr(deal, "order", 0)),
        "time": datetime.fromtimestamp(timestamp, timezone.utc).replace(tzinfo=None).strftime("%Y.%m.%d %H:%M:%S"), "time_msc": str(time_msc),
        "type_name": f"DEAL_TYPE_{adapter.deal_type_name(type_value)}", "entry_name": f"DEAL_ENTRY_{adapter.deal_entry_name(entry_value)}",
        "position_id": int(getattr(deal, "position_id", 0) or 0), "volume": float(getattr(deal, "volume", 0) or 0), "price": float(getattr(deal, "price", 0) or 0),
        "profit": float(getattr(deal, "profit", 0) or 0), "commission": float(getattr(deal, "commission", 0) or 0), "swap": float(getattr(deal, "swap", 0) or 0), "fee": float(getattr(deal, "fee", 0) or 0),
        "symbol": str(getattr(deal, "symbol", "") or ""), "comment": str(getattr(deal, "comment", "") or ""), "external_id": str(getattr(deal, "external_id", "") or ""),
    }


def _merge_ticket_rows(old: list[dict], new: list[dict]) -> tuple[list[dict], int]:
    merged = {str(row.get("ticket")): row for row in old if row.get("ticket") is not None}
    duplicates = 0
    for row in new:
        key = str(row.get("ticket"))
        if key in merged:
            duplicates += 1
        merged[key] = row
    return sorted(merged.values(), key=lambda row: (int(row.get("time_msc", 0)), int(row.get("ticket", 0)))), duplicates


def _server_now(now: datetime | None) -> datetime:
    current = now or datetime.now(timezone.utc)
    return current.astimezone(timezone.utc).replace(tzinfo=None)


def _tick_value(tick: object, name: str, default=0):
    try:
        return tick[name]
    except (KeyError, IndexError, TypeError):
        return getattr(tick, name, default)


def _tick_row(adapter, symbol: str, requested: datetime) -> dict[str, str]:
    """Legacy diagnostic helper. Balance V2 never calls it for performance calculation."""
    for lookback in WINDOWS:
        start = requested - lookback
        ticks = adapter.ticks_get(symbol, start.replace(tzinfo=timezone.utc), (requested + timedelta(seconds=1)).replace(tzinfo=timezone.utc))
        candidates = []
        for tick in ticks:
            time_msc = int(_tick_value(tick, "time_msc", int(_tick_value(tick, "time", 0)) * 1000))
            requested_msc = int(requested.replace(tzinfo=timezone.utc).timestamp() * 1000)
            bid = float(_tick_value(tick, "bid", 0) or 0)
            ask = float(_tick_value(tick, "ask", 0) or 0)
            if time_msc <= requested_msc and bid > 0 and ask > 0:
                candidates.append((time_msc, bid, ask))
        if candidates:
            time_msc, bid, ask = max(candidates, key=lambda item: item[0])
            actual = datetime.fromtimestamp(time_msc / 1000, timezone.utc).replace(tzinfo=None)
            return {"actual_tick_time": actual.strftime("%Y-%m-%d %H:%M:%S"), "bid": f"{bid:.12g}", "ask": f"{ask:.12g}", "source": "tick", "status": "ok"}
    raise NativeExportError(f"missing tick after 168 hours: {symbol} {requested:%Y-%m-%d %H:%M:%S}")


def _is_external_flow(row: dict) -> bool:
    return str(row.get("type_name", "")).endswith(EXTERNAL_FLOW_SUFFIXES)


def _balance_delta(row: dict) -> float:
    if _is_external_flow(row):
        return _number(row.get("profit", 0))
    return sum(_number(row.get(key, 0)) for key in ("profit", "commission", "swap", "fee"))


def _build_balance_daily_gain(ordered: list[dict], last_complete: date) -> list[dict]:
    eligible = [row for row in ordered if _event_time(row).date() <= last_complete]
    if not eligible:
        raise NativeExportError("balance history is empty")
    first_day = min(_event_time(row).date() for row in eligible)
    by_day: dict[date, list[dict]] = {}
    for row in eligible:
        by_day.setdefault(_event_time(row).date(), []).append(row)
    running_balance = 0.0
    results: list[dict] = []
    day = first_day
    while day <= last_complete:
        denominator = running_balance if running_balance > 0 else None
        segments: list[float] = []
        for row in sorted(by_day.get(day, []), key=lambda item: (_event_time(item), int(item.get("ticket", 0)))):
            if _is_external_flow(row):
                if denominator is not None and running_balance > 0:
                    segments.append(running_balance / denominator)
                running_balance += _balance_delta(row)
                denominator = running_balance if running_balance > 0 else None
            else:
                running_balance += _balance_delta(row)
        if denominator is not None and running_balance > 0:
            segments.append(running_balance / denominator)
            value = (math.prod(segments) - 1) * 100
            if not math.isfinite(value):
                raise NativeExportError("balance dailyGain contains non-finite values")
            results.append({"date": day.isoformat(), "value": round(value, 8)})
        day += timedelta(days=1)
    if not results:
        raise NativeExportError("balance history has no positive funded period")
    if (date.fromisoformat(results[-1]["date"]) - date.fromisoformat(results[0]["date"])).days < 89:
        raise NativeExportError("balance history must cover at least 90 calendar days")
    return results


def incremental_refresh(directory: Path, seed_path: Path, adapter, *, now: datetime | None = None, state_path: Path | None = None) -> dict[str, object]:
    previous_seed = validate_seed(seed_path)
    current = _server_now(now)
    last_complete = current.date() - timedelta(days=1)
    fetch_start = datetime.combine(date.fromisoformat(previous_seed[-1]["date"]) - timedelta(days=2), datetime.min.time())
    state_path = state_path or directory.parent / STATE_NAME
    state_path.parent.mkdir(parents=True, exist_ok=True)
    bootstrap = _read_csv(directory / "history-deals.csv", {"ticket", "time", "time_msc", "type_name", "entry_name", "position_id", "volume", "price", "profit", "commission", "swap", "fee", "symbol"})
    saved = json.loads(state_path.read_text(encoding="utf-8")) if state_path.exists() else {"deals": [], "orders": []}
    identity = adapter.identity
    if identity is None or identity.trade_allowed or identity.server != "Tickmill-Live":
        raise NativeExportError("MT5 read-only identity validation failed")
    new_deals = [_normalize_incremental_deal(adapter, item) for item in adapter.history_deals_get(fetch_start, current + timedelta(minutes=1))]
    new_orders = [_normalize_order(item) for item in adapter.history_orders_get(fetch_start, current + timedelta(minutes=1))]
    incremental_deals, duplicate_deals = _merge_ticket_rows(saved.get("deals", []), new_deals)
    incremental_orders, duplicate_orders = _merge_ticket_rows(saved.get("orders", []), new_orders)
    all_deals, _ = _merge_ticket_rows(bootstrap, incremental_deals)
    ordered = sorted(all_deals, key=lambda row: (_event_time(row), int(row.get("ticket", 0))))
    rebuilt = _build_balance_daily_gain(ordered, last_complete)
    changed = rebuilt != previous_seed
    if changed:
        _atomic_json(seed_path, rebuilt)
    _atomic_json(state_path, {"version": 2, "calculationVersion": CALCULATION_VERSION, "deals": incremental_deals, "orders": incremental_orders})
    return {"before": len(previous_seed), "after": len(rebuilt), "changed": changed, "new_complete_dates": [row["date"] for row in rebuilt if row["date"] > previous_seed[-1]["date"]], "deals": len(new_deals), "orders": len(new_orders), "new_deals": len(new_deals), "new_orders": len(new_orders), "duplicates": duplicate_deals + duplicate_orders, "start": fetch_start, "end": current, "calculation_version": CALCULATION_VERSION, "balance_only": True, "day_missing": 0, "conversion_missing": 0, "cash_missing": 0, "cash_conversion_missing": 0, "future_events": 0, "future_ticks": 0, "m1": 0, "cashflow_error": 0.0}
