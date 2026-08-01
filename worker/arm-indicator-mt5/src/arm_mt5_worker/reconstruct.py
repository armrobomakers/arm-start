from __future__ import annotations

import csv
import json
import math
import os
from collections import defaultdict
from datetime import date, datetime, timedelta
from pathlib import Path

from .native_analysis import _dt, _event_time, _number, _position_lifecycles
from .native_export import NativeExportError, _read_csv


FILES = (
    "history-deals.csv", "history-orders.csv", "symbol-metadata.csv",
    "historical-prices.csv", "conversion-historical-prices.csv",
    "cashflow-historical-prices.csv", "cashflow-conversion-historical-prices.csv",
    "price-requests.csv", "cashflow-price-requests.csv",
)
DEAL_REQUIRED = {"ticket", "time", "time_msc", "type_name", "entry_name", "position_id", "volume", "price", "profit", "commission", "swap", "fee", "symbol"}
METADATA_REQUIRED = {"symbol", "currency_profit", "trade_calc_mode", "trade_contract_size", "tick_size", "tick_value", "account_currency"}


def _parse_time(value: str) -> datetime:
    for fmt in ("%Y.%m.%d %H:%M:%S", "%Y-%m-%d %H:%M:%S"):
        try:
            return datetime.strptime(value[:19], fmt)
        except ValueError:
            pass
    raise NativeExportError(f"invalid server time: {value}")


def _read_export_file(directory: Path, name: str, required: set[str]) -> list[dict[str, str]]:
    return _read_csv(directory / name, required)


def _validate_prices(rows: list[dict[str, str]], *, key: tuple[str, ...]) -> tuple[dict[tuple[str, ...], dict[str, str]], int, int, int]:
    indexed: dict[tuple[str, ...], dict[str, str]] = {}
    missing = future = fallback = 0
    for row in rows:
        identity = tuple(row.get(item, "") for item in key)
        status = row.get("status", "")
        if status != "ok" or row.get("source") != "tick":
            if status == "missing":
                missing += 1
            if row.get("source") == "m1_fallback" or status == "approximate":
                fallback += 1
            continue
        requested = _parse_time(row["requested_server_time"])
        actual = _parse_time(row["actual_tick_time"])
        if actual > requested:
            future += 1
        if identity in indexed:
            raise NativeExportError(f"duplicate price row: {identity}")
        indexed[identity] = row
    return indexed, missing, future, fallback


def _balance_delta(row: dict[str, str]) -> float:
    if row.get("type_name", "").endswith("BALANCE"):
        return _number(row.get("profit", ""))
    return sum(_number(row.get(key, "")) for key in ("profit", "commission", "swap", "fee"))


def _state_at(state, timestamp: datetime):
    events = [item for item in state.timeline if item[0] <= timestamp]
    if not events or events[-1][2] <= 1e-9 or state.invalid or state.reversals:
        return None
    _, _, volume, weighted = events[-1]
    return state.direction, volume, weighted


def _profit_usd(raw: float, direction: str, bid: float, ask: float, conversion_direction: str | None) -> float:
    if conversion_direction is None or raw == 0:
        return raw
    if bid <= 0 or ask <= 0:
        raise NativeExportError("conversion price is non-positive")
    if conversion_direction == "DIRECT":
        return raw * (bid if raw > 0 else ask)
    if conversion_direction == "INVERSE":
        return raw / (ask if raw > 0 else bid)
    raise NativeExportError(f"unsupported conversion direction: {conversion_direction}")


def _floating_at(timestamp: datetime, deals, states, metadata, prices, conversions, *, flow_id: str | None = None) -> float:
    total = 0.0
    for position_id, state in states.items():
        position = _state_at(state, timestamp)
        if not position:
            continue
        direction, volume, open_price = position
        if flow_id is None:
            row = prices.get((state.symbol, timestamp.strftime("%Y-%m-%d %H:%M:%S")))
            if not row:
                raise NativeExportError(f"missing day-close price: {state.symbol} {timestamp}")
        else:
            row = prices.get((flow_id, position_id))
            if not row:
                raise NativeExportError(f"missing cashflow price: {flow_id} {position_id}")
        mark = _number(row.get("bid" if direction == "BUY" else "ask", ""))
        meta = metadata.get(state.symbol)
        if not meta:
            raise NativeExportError(f"missing metadata: {state.symbol}")
        delta = mark - open_price if direction == "BUY" else open_price - mark
        mode = int(meta["trade_calc_mode"])
        raw = delta * _number(meta["trade_contract_size"]) * volume if mode in (0, 3) else delta / _number(meta["tick_size"]) * _number(meta["tick_value"]) * volume if mode == 2 else None
        if raw is None:
            raise NativeExportError(f"unsupported trade calc mode: {mode}")
        currency = meta["currency_profit"]
        if currency == meta["account_currency"]:
            total += raw
            continue
        conversion = conversions.get((flow_id, currency)) if flow_id is not None else conversions.get((state.symbol, timestamp.strftime("%Y-%m-%d %H:%M:%S")))
        if not conversion:
            raise NativeExportError(f"missing conversion price: {state.symbol} {timestamp}")
        conversion_row, conversion_direction = conversion
        total += _profit_usd(raw, direction, _number(conversion_row["bid"]), _number(conversion_row["ask"]), conversion_direction)
    return total


def _atomic_json(path: Path, data: object) -> None:
    temporary = path.with_suffix(path.suffix + ".tmp")
    with temporary.open("w", encoding="utf-8", newline="") as handle:
        json.dump(data, handle, ensure_ascii=True, separators=(",", ":"))
        handle.flush()
        os.fsync(handle.fileno())
    os.replace(temporary, path)


def export_report(directory: Path) -> list[dict[str, object]]:
    report = []
    for name in FILES:
        path = directory / name
        if not path.is_file():
            raise NativeExportError(f"missing export file: {path}")
        with path.open("r", encoding="cp1252", newline="") as handle:
            rows = max(0, sum(1 for _ in handle) - 1)
        report.append({"path": str(path), "name": name, "size": path.stat().st_size, "rows": rows})
    return report


def reconstruct_last120(directory: Path, output_path: Path) -> dict[str, object]:
    report = export_report(directory)
    deals = _read_export_file(directory, "history-deals.csv", DEAL_REQUIRED)
    metadata_rows = _read_export_file(directory, "symbol-metadata.csv", METADATA_REQUIRED)
    metadata = {row["symbol"]: row for row in metadata_rows}
    account_currencies = {row["account_currency"] for row in metadata_rows}
    if account_currencies != {"USD"}:
        raise NativeExportError("account currency must be USD")
    price_rows = _read_export_file(directory, "historical-prices.csv", {"symbol", "requested_server_time", "actual_tick_time", "bid", "ask", "source", "status"})
    conversion_rows = _read_export_file(directory, "conversion-historical-prices.csv", {"conversion_symbol", "requested_server_time", "actual_tick_time", "bid", "ask", "source", "status", "direction", "source_symbol", "profit_currency"})
    cash_price_rows = _read_export_file(directory, "cashflow-historical-prices.csv", {"flow_id", "position_id", "source_symbol", "requested_server_time", "actual_tick_time", "bid", "ask", "source", "status"})
    cash_conversion_rows = _read_export_file(directory, "cashflow-conversion-historical-prices.csv", {"flow_id", "conversion_symbol", "requested_server_time", "actual_tick_time", "bid", "ask", "source", "status", "direction", "source_symbol", "profit_currency"})
    prices, day_missing, day_future, day_fallback = _validate_prices(price_rows, key=("symbol", "requested_server_time"))
    conversion_index, conversion_missing, conversion_future, conversion_fallback = _validate_prices(conversion_rows, key=("conversion_symbol", "requested_server_time"))
    cash_prices, cash_missing, cash_future, cash_fallback = _validate_prices(cash_price_rows, key=("flow_id", "position_id"))
    cash_conversions, cash_conversion_missing, cash_conversion_future, cash_conversion_fallback = _validate_prices(cash_conversion_rows, key=("flow_id", "conversion_symbol", "source_symbol"))
    if any((day_missing, conversion_missing, cash_missing, cash_conversion_missing, day_future, conversion_future, cash_future, cash_conversion_future, day_fallback, conversion_fallback, cash_fallback, cash_conversion_fallback)):
        raise NativeExportError("price coverage is incomplete or contains future/fallback rows")
    states = _position_lifecycles(deals)
    ordered_deals = sorted(deals, key=lambda row: (_event_time(row), int(row.get("ticket", "0") or 0)))
    latest = max((_dt(row["time"]) for row in deals), default=datetime.now())
    last_day = latest.date()
    first_day = last_day - timedelta(days=119)
    day_requests = sorted({(row["symbol"], _parse_time(row["requested_server_time"])) for row in price_rows if first_day <= _parse_time(row["requested_server_time"]).date() <= last_day})
    day_equity = []
    for symbol, close in day_requests:
        if not any(item.symbol == symbol for item in states.values()):
            continue
        balance = sum(_balance_delta(row) for row in ordered_deals if _event_time(row) <= close)
        conversion_map = {}
        for row in conversion_rows:
            if row["requested_server_time"] == close.strftime("%Y-%m-%d %H:%M:%S"):
                conversion_map[(row["source_symbol"], row["requested_server_time"])] = (row, row["direction"])
        floating = _floating_at(close, ordered_deals, states, metadata, prices, conversion_map)
        day_equity.append({"date": close.date().isoformat(), "requested_server_time": close.strftime("%Y-%m-%d %H:%M:%S"), "balance_close": balance, "floating_profit": floating, "equity_close": balance + floating, "open_positions": sum(_state_at(state, close) is not None for state in states.values())})
    by_date = {row["date"]: row for row in day_equity}
    flows = [row for row in ordered_deals if row.get("type_name", "").endswith("BALANCE") and first_day <= _event_time(row).date() <= last_day]
    cashflow_errors = []
    flow_equity = {}
    for flow in flows:
        flow_time = _event_time(flow)
        before_balance = sum(_balance_delta(row) for row in ordered_deals if _event_time(row) < flow_time)
        cash_floating = _floating_at(flow_time, ordered_deals, states, metadata, cash_prices, {(flow["ticket"], row["profit_currency"]): (cash_conversions[(flow["ticket"], row["conversion_symbol"], row["source_symbol"])], row["direction"]) for row in cash_conversion_rows if row["flow_id"] == flow["ticket"]}, flow_id=flow["ticket"])
        pre = before_balance + cash_floating
        post = pre + _number(flow["profit"])
        flow_equity[flow["ticket"]] = (pre, post)
        cashflow_errors.append(abs((post - pre) - _number(flow["profit"])))
    daily = []
    previous = None
    for day in sorted(by_date):
        current = by_date[day]
        if previous is None:
            current["complete"] = False
            current["reason"] = "missing_previous_close"
        else:
            start = previous["equity_close"]
            segments = []
            for flow in [item for item in flows if _event_time(item).date().isoformat() == day]:
                pre, post = flow_equity[flow["ticket"]]
                if start <= 0 or pre <= 0 or post <= 0:
                    raise NativeExportError("non-positive equity in cashflow segmentation")
                segments.append(pre / start)
                start = post
            if start <= 0 or current["equity_close"] <= 0:
                raise NativeExportError("non-positive equity")
            segments.append(current["equity_close"] / start)
            current["return_pct"] = (math.prod(segments) - 1.0) * 100.0
            current["complete"] = True
            current["reason"] = ""
            daily.append({"date": day, "value": current["return_pct"]})
        previous = current
    if len(daily) < 90:
        raise NativeExportError(f"complete daily returns below 90: {len(daily)}")
    _atomic_json(output_path, [{"date": row["date"], "value": row["value"]} for row in daily])
    return {"files": report, "day_equity": day_equity, "daily": daily, "flows": flows, "cashflow_invariant_max_error": max(cashflow_errors, default=0.0), "coverage": {"day_missing": day_missing, "conversion_missing": conversion_missing, "cash_missing": cash_missing, "cash_conversion_missing": cash_conversion_missing, "future": day_future + conversion_future + cash_future + cash_conversion_future, "m1": day_fallback + conversion_fallback + cash_fallback + cash_conversion_fallback}}
