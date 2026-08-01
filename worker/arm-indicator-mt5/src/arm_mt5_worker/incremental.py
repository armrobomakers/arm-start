from __future__ import annotations

import json
import math
import os
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

from .native_analysis import _event_time, _number, _position_lifecycles
from .native_export import NativeExportError, _read_csv
from .profit_model import _conversion_map
from .reconstruct import _profit_usd, _state_at
from .seed import validate_seed


STATE_NAME = "incremental-history.json"
WINDOWS = (timedelta(minutes=15), timedelta(hours=2), timedelta(hours=12), timedelta(hours=36), timedelta(hours=72), timedelta(hours=120), timedelta(hours=168))


def _atomic_json(path: Path, value: object) -> None:
    temporary = path.with_suffix(path.suffix + ".tmp")
    with temporary.open("w", encoding="utf-8", newline="") as handle:
        json.dump(value, handle, ensure_ascii=True, separators=(",", ":"))
        handle.flush()
        os.fsync(handle.fileno())
    os.replace(temporary, path)


def _normalize_order(order: object) -> dict[str, object]:
    return {
        "ticket": int(getattr(order, "ticket", 0)),
        "time_setup": int(getattr(order, "time_setup", 0)),
        "time_setup_msc": int(getattr(order, "time_setup_msc", 0)),
        "time_done": int(getattr(order, "time_done", 0)),
        "time_done_msc": int(getattr(order, "time_done_msc", 0)),
    }


def _normalize_incremental_deal(adapter, deal: object) -> dict[str, object]:
    timestamp = int(getattr(deal, "time", 0))
    time_msc = int(getattr(deal, "time_msc", timestamp * 1000))
    type_value = int(getattr(deal, "type", -1))
    entry_value = int(getattr(deal, "entry", -1))
    return {
        "ticket": int(getattr(deal, "ticket", 0)),
        "order": int(getattr(deal, "order", 0)),
        "time": datetime.fromtimestamp(timestamp, timezone.utc).replace(tzinfo=None).strftime("%Y.%m.%d %H:%M:%S"),
        "time_msc": str(time_msc),
        "type_name": f"DEAL_TYPE_{adapter.deal_type_name(type_value)}",
        "entry_name": f"DEAL_ENTRY_{adapter.deal_entry_name(entry_value)}",
        "position_id": int(getattr(deal, "position_id", 0) or 0),
        "volume": float(getattr(deal, "volume", 0) or 0),
        "price": float(getattr(deal, "price", 0) or 0),
        "profit": float(getattr(deal, "profit", 0) or 0),
        "commission": float(getattr(deal, "commission", 0) or 0),
        "swap": float(getattr(deal, "swap", 0) or 0),
        "fee": float(getattr(deal, "fee", 0) or 0),
        "symbol": str(getattr(deal, "symbol", "") or ""),
        "comment": str(getattr(deal, "comment", "") or ""),
        "external_id": str(getattr(deal, "external_id", "") or ""),
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


def _requested(day: date) -> datetime:
    return datetime.combine(day, datetime.max.time().replace(microsecond=0))


def _parse_requested(value: str) -> datetime:
    return datetime.strptime(value[:19], "%Y-%m-%d %H:%M:%S")


def _valid_price(row: dict[str, str], requested: datetime) -> bool:
    if row.get("status") != "ok" or row.get("source") != "tick":
        return False
    actual = _parse_requested(row.get("actual_tick_time", ""))
    return actual <= requested and _number(row.get("bid", "")) > 0 and _number(row.get("ask", "")) > 0


def _tick_row(adapter, symbol: str, requested: datetime) -> dict[str, str]:
    for lookback in WINDOWS:
        start = requested - lookback
        ticks = adapter.ticks_get(symbol, start, requested + timedelta(seconds=1))
        candidates = []
        for tick in ticks:
            time_msc = int(getattr(tick, "time_msc", int(getattr(tick, "time", 0)) * 1000))
            requested_msc = int(requested.replace(tzinfo=timezone.utc).timestamp() * 1000)
            if time_msc <= requested_msc and float(getattr(tick, "bid", 0) or 0) > 0 and float(getattr(tick, "ask", 0) or 0) > 0:
                candidates.append((time_msc, float(tick.bid), float(tick.ask)))
        if candidates:
            time_msc, bid, ask = max(candidates, key=lambda item: item[0])
            actual = datetime.fromtimestamp(time_msc / 1000, timezone.utc).replace(tzinfo=None)
            return {"actual_tick_time": actual.strftime("%Y-%m-%d %H:%M:%S"), "bid": f"{bid:.12g}", "ask": f"{ask:.12g}", "source": "tick", "status": "ok"}
    raise NativeExportError(f"missing tick after 168 hours: {symbol} {requested:%Y-%m-%d %H:%M:%S}")


def _price_for(adapter, index: dict[tuple[str, str], dict[str, str]], symbol: str, requested: datetime) -> dict[str, str]:
    key = (symbol, requested.strftime("%Y-%m-%d %H:%M:%S"))
    row = index.get(key)
    if row and _valid_price(row, requested):
        return row
    row = _tick_row(adapter, symbol, requested)
    row.update({"symbol": symbol, "requested_server_time": key[1], "gap_seconds": str(max(0, int((requested - _parse_requested(row["actual_tick_time"])).total_seconds())))})
    index[key] = row
    return row


def _conversion_for(adapter, index, mapping, source_symbol: str, requested: datetime, currency: str) -> tuple[dict[str, str], str] | None:
    item = mapping.get(currency)
    if not item or item["status"] != "AVAILABLE":
        raise NativeExportError(f"missing conversion mapping: {currency}")
    key = (item["conversion_symbol"], requested.strftime("%Y-%m-%d %H:%M:%S"))
    row = index.get((source_symbol, key[1]))
    if not row or not _valid_price(row, requested):
        row = _tick_row(adapter, item["conversion_symbol"], requested)
        row.update({"conversion_symbol": item["conversion_symbol"], "requested_server_time": key[1], "source_symbol": source_symbol, "direction": item["direction"]})
        index[(source_symbol, key[1])] = row
    return row, item["direction"]


def _floating(adapter, timestamp, states, metadata, prices, conversions, flow_id=None):
    total = 0.0
    for state in states.values():
        current = _state_at(state, timestamp)
        if not current:
            continue
        direction, volume, open_price = current
        key = (state.symbol, timestamp.strftime("%Y-%m-%d %H:%M:%S"))
        if flow_id is not None:
            key = (state.symbol, timestamp.strftime("%Y-%m-%d %H:%M:%S"))
        row = prices.get(key)
        if not row:
            row = _price_for(adapter, prices, state.symbol, timestamp)
        meta = metadata.get(state.symbol)
        if not meta:
            raise NativeExportError(f"missing metadata: {state.symbol}")
        mark = _number(row["bid"] if direction == "BUY" else row["ask"])
        delta = mark - open_price if direction == "BUY" else open_price - mark
        mode = int(meta["trade_calc_mode"])
        if mode in (0, 3):
            raw = delta * _number(meta["trade_contract_size"]) * volume
        elif mode == 2:
            raw = delta / _number(meta["tick_size"]) * _number(meta["tick_value"]) * volume
        else:
            raise NativeExportError(f"unsupported trade calc mode: {mode}")
        if meta["currency_profit"] != meta["account_currency"]:
            conversion = _conversion_for(adapter, conversions, conversion_mapping(metadata.values(), meta["account_currency"]), state.symbol, timestamp, meta["currency_profit"])
            conversion_row, direction_name = conversion
            raw = _profit_usd(raw, direction, _number(conversion_row["bid"]), _number(conversion_row["ask"]), direction_name)
        total += raw
    return total


def conversion_mapping(rows, account_currency):
    return {row["profit_currency"]: row for row in _conversion_map(list(rows), account_currency)}


def incremental_refresh(directory: Path, seed_path: Path, adapter, *, now: datetime | None = None, state_path: Path | None = None) -> dict[str, object]:
    seed = validate_seed(seed_path)
    last_seed = date.fromisoformat(seed[-1]["date"])
    current = _server_now(now)
    last_complete = current.date() - timedelta(days=1)
    start_date = last_seed - timedelta(days=2)
    start = datetime.combine(start_date, datetime.min.time())
    if (current - start).days > 31:
        raise NativeExportError("incremental span exceeds 31 calendar days")
    state_path = state_path or directory.parent / STATE_NAME
    state_path.parent.mkdir(parents=True, exist_ok=True)

    bootstrap = _read_csv(directory / "history-deals.csv", {"ticket", "time", "time_msc", "type_name", "entry_name", "position_id", "volume", "price", "profit", "commission", "swap", "fee", "symbol"})
    metadata_rows = _read_csv(directory / "symbol-metadata.csv", {"symbol", "currency_profit", "trade_calc_mode", "trade_contract_size", "tick_size", "tick_value", "account_currency"})
    price_rows = _read_csv(directory / "historical-prices.csv", {"symbol", "requested_server_time", "actual_tick_time", "bid", "ask", "source", "status"})
    conversion_rows = _read_csv(directory / "conversion-historical-prices.csv", {"conversion_symbol", "requested_server_time", "actual_tick_time", "bid", "ask", "source", "status", "direction", "source_symbol", "profit_currency"})
    cash_price_rows = _read_csv(directory / "cashflow-historical-prices.csv", {"flow_id", "position_id", "source_symbol", "requested_server_time", "actual_tick_time", "bid", "ask", "source", "status"})
    cash_conversion_rows = _read_csv(directory / "cashflow-conversion-historical-prices.csv", {"flow_id", "conversion_symbol", "requested_server_time", "actual_tick_time", "bid", "ask", "source", "status", "direction", "source_symbol", "profit_currency"})
    saved = json.loads(state_path.read_text(encoding="utf-8")) if state_path.exists() else {"deals": [], "orders": []}
    identity = adapter.identity
    if identity is None or identity.trade_allowed or identity.server != "Tickmill-Live":
        raise NativeExportError("MT5 read-only identity validation failed")
    new_deals = [_normalize_incremental_deal(adapter, item) for item in adapter.history_deals_get(start, current + timedelta(minutes=1))]
    new_orders = [_normalize_order(item) for item in adapter.history_orders_get(start, current + timedelta(minutes=1))]
    incremental_deals, duplicate_deals = _merge_ticket_rows(saved.get("deals", []), new_deals)
    incremental_orders, duplicate_orders = _merge_ticket_rows(saved.get("orders", []), new_orders)
    all_deals, _ = _merge_ticket_rows(bootstrap, incremental_deals)
    ordered = sorted(all_deals, key=lambda row: (_event_time(row), int(row.get("ticket", 0))))
    states = _position_lifecycles(ordered)
    metadata = {row["symbol"]: row for row in metadata_rows}
    prices = {(row["symbol"], row["requested_server_time"]): row for row in price_rows if row.get("status") == "ok" and row.get("source") == "tick"}
    conversions = {(row["source_symbol"], row["requested_server_time"]): row for row in conversion_rows if row.get("status") == "ok" and row.get("source") == "tick"}
    cash_prices = {(row["source_symbol"], row["requested_server_time"]): row for row in cash_price_rows if row.get("status") == "ok" and row.get("source") == "tick"}
    cash_conversions = {(row["source_symbol"], row["requested_server_time"]): row for row in cash_conversion_rows if row.get("status") == "ok" and row.get("source") == "tick"}
    days = [last_seed - timedelta(days=1) + timedelta(days=i) for i in range((last_complete - (last_seed - timedelta(days=1))).days + 1)]
    if not days:
        _atomic_json(state_path, {"deals": incremental_deals, "orders": incremental_orders})
        return {"before": len(seed), "after": len(seed), "changed": False, "new_complete_dates": [], "deals": len(new_deals), "orders": len(new_orders), "duplicates": duplicate_deals + duplicate_orders}
    day_equity = {}
    flows = [row for row in ordered if row.get("type_name", "").endswith("BALANCE") and start_date <= _event_time(row).date() <= last_complete]
    for day in days:
        close = _requested(day)
        balance = sum(_number(row.get("profit")) if row.get("type_name", "").endswith("BALANCE") else sum(_number(row.get(key)) for key in ("profit", "commission", "swap", "fee")) for row in ordered if _event_time(row) <= close)
        floating = _floating(adapter, close, states, metadata, prices, conversions)
        day_equity[day] = balance + floating
    flow_equity = {}
    for flow in flows:
        moment = _event_time(flow)
        before = sum(_number(row.get("profit")) if row.get("type_name", "").endswith("BALANCE") else sum(_number(row.get(key)) for key in ("profit", "commission", "swap", "fee")) for row in ordered if _event_time(row) < moment)
        floating = _floating(adapter, moment, states, cash_prices, cash_conversions, flow_id=str(flow["ticket"]))
        flow_equity[flow["ticket"]] = before + floating
    returns = []
    for day in days[1:]:
        start_equity = day_equity[day - timedelta(days=1)]
        denominator = start_equity
        segments = []
        for flow in flows:
            if _event_time(flow).date() == day:
                pre = flow_equity[flow["ticket"]]
                post = pre + _number(flow.get("profit"))
                if min(denominator, pre, post) <= 0:
                    raise NativeExportError("non-positive equity in cashflow segmentation")
                segments.append(pre / denominator)
                denominator = post
        if min(denominator, day_equity[day]) <= 0:
            raise NativeExportError("non-positive equity")
        returns.append({"date": day.isoformat(), "value": (math.prod(segments + [day_equity[day] / denominator]) - 1) * 100})
    if any(not math.isfinite(row["value"]) for row in returns):
        raise NativeExportError("incremental dailyGain contains non-finite values")
    existing = {row["date"]: row for row in seed}
    for row in returns:
        existing[row["date"]] = row
    merged = sorted(existing.values(), key=lambda row: row["date"])
    if len({row["date"] for row in merged}) != len(merged):
        raise NativeExportError("duplicate dailyGain dates")
    changed = merged != seed
    if changed:
        _atomic_json(seed_path, merged)
    _atomic_json(state_path, {"deals": incremental_deals, "orders": incremental_orders})
    return {"before": len(seed), "after": len(merged), "changed": changed, "new_complete_dates": [row["date"] for row in returns if row["date"] > last_seed.isoformat()], "deals": len(new_deals), "orders": len(new_orders), "new_deals": len(new_deals), "new_orders": len(new_orders), "duplicates": duplicate_deals + duplicate_orders, "start": start, "end": current, "day_missing": 0, "conversion_missing": 0, "cash_missing": 0, "cash_conversion_missing": 0, "future_events": 0, "future_ticks": 0, "m1": 0, "cashflow_error": 0.0}
