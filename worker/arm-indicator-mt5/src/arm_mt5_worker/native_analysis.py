from __future__ import annotations

import csv
import os
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from pathlib import Path

from .native_export import _read_csv


@dataclass
class PositionState:
    position_id: str
    symbol: str = ""
    direction: str = ""
    open_price: float = 0.0
    close_price: float = 0.0
    open_time: datetime | None = None
    close_time: datetime | None = None
    initial_volume: float = 0.0
    maximum_volume: float = 0.0
    remaining_volume: float = 0.0
    realized_profit: float = 0.0
    commission: float = 0.0
    swap: float = 0.0
    fee: float = 0.0
    entries: int = 0
    exits: int = 0
    reversals: int = 0
    partial: bool = False
    invalid: bool = False
    events: list[tuple[datetime, float]] = field(default_factory=list)
    timeline: list[tuple[datetime, float, float, float]] = field(default_factory=list)


def _dt(value: str) -> datetime:
    return datetime.strptime(value, "%Y.%m.%d %H:%M:%S")


def _event_time(row: dict[str, str]) -> datetime:
    value = _dt(row["time"])
    raw_msc = row.get("time_msc", "")
    if raw_msc.isdigit():
        value += timedelta(milliseconds=int(raw_msc) % 1000)
    return value


def _number(value: str) -> float:
    return float(value or 0)


def _classify_balance(row: dict[str, str]) -> str:
    text = f"{row.get('comment', '')} {row.get('external_id', '')}".lower()
    if any(token in text for token in ("withdraw", "вывод", "сняти")):
        return "withdrawal"
    if any(token in text for token in ("deposit", "пополн", "внес")):
        return "deposit"
    if any(token in text for token in ("correction", "коррект", "credit", "bonus", "charge", "комисс")):
        return "other"
    return "ambiguous"


def _position_lifecycles(deals: list[dict[str, str]]) -> dict[str, PositionState]:
    grouped: dict[str, list[dict[str, str]]] = defaultdict(list)
    for row in deals:
        position_id = row.get("position_id", "")
        if position_id and position_id != "0" and row.get("type_name", "").endswith(("BUY", "SELL")):
            grouped[position_id].append(row)

    result: dict[str, PositionState] = {}
    for position_id, rows in grouped.items():
        state = PositionState(position_id)
        net_volume = 0.0
        weighted_open_price = 0.0
        for row in sorted(rows, key=lambda item: (item.get("time_msc", ""), item.get("ticket", ""))):
            event_time = _event_time(row)
            volume = _number(row["volume"])
            is_buy = row["type_name"].endswith("BUY")
            signed = volume if is_buy else -volume
            entry = row.get("entry_name", "")
            state.symbol = row.get("symbol", state.symbol)
            state.realized_profit += _number(row.get("profit", ""))
            state.commission += _number(row.get("commission", ""))
            state.swap += _number(row.get("swap", ""))
            state.fee += _number(row.get("fee", ""))
            if entry.endswith("IN") and not entry.endswith("OUT"):
                if net_volume and (net_volume > 0) != (signed > 0):
                    state.reversals += 1
                    state.invalid = True
                state.entries += 1
                state.initial_volume = max(state.initial_volume, abs(signed))
                state.maximum_volume = max(state.maximum_volume, abs(net_volume + signed))
                old_volume = abs(net_volume)
                net_volume += signed
                new_volume = abs(net_volume)
                price = _number(row.get("price", ""))
                weighted_open_price = ((old_volume * weighted_open_price) + (abs(signed) * price)) / new_volume if new_volume else 0.0
                state.events.append((event_time, net_volume))
                state.timeline.append((event_time, signed, new_volume, weighted_open_price))
                if state.open_time is None:
                    state.open_time = event_time
                    state.direction = "BUY" if signed > 0 else "SELL"
                state.open_price = weighted_open_price
            elif entry.endswith("INOUT"):
                state.reversals += int(bool(net_volume and (net_volume > 0) != (signed > 0)))
                state.entries += 1
                state.initial_volume = max(state.initial_volume, abs(signed))
                net_volume = signed
                weighted_open_price = _number(row.get("price", ""))
                state.maximum_volume = max(state.maximum_volume, abs(net_volume))
                state.events.append((event_time, net_volume))
                state.timeline.append((event_time, signed, abs(net_volume), weighted_open_price))
                state.open_time = state.open_time or event_time
                state.direction = "BUY" if signed > 0 else "SELL"
                state.open_price = weighted_open_price
            elif entry.endswith(("OUT", "OUT_BY")):
                state.exits += 1
                if abs(signed) > abs(net_volume) + 1e-9:
                    state.invalid = True
                if abs(signed) < abs(net_volume) - 1e-9:
                    state.partial = True
                net_volume += signed
                state.events.append((event_time, net_volume))
                remaining = abs(net_volume)
                state.timeline.append((event_time, signed, remaining, weighted_open_price if remaining else 0.0))
                if abs(net_volume) <= 1e-9:
                    state.close_time = event_time
                    state.close_price = _number(row.get("price", ""))
                    weighted_open_price = 0.0
            else:
                state.invalid = True
        state.remaining_volume = abs(net_volume)
        if state.exits > 1 or state.entries > 1:
            state.partial = True
        result[position_id] = state
    return result


def analyze_native_history(directory: Path, *, today: date | None = None) -> dict[str, object]:
    deals = _read_csv(directory / "history-deals.csv", {"ticket", "time", "time_msc", "type_name", "entry_name", "position_id", "volume", "profit", "commission", "swap", "fee", "symbol"})
    orders = _read_csv(directory / "history-orders.csv", {"ticket", "time_setup"})
    positions = _position_lifecycles(deals)
    balances = [row for row in deals if row.get("type_name", "").endswith("BALANCE")]
    balance_categories = Counter(_classify_balance(row) for row in balances)
    balance_totals = Counter()
    for row in balances:
        category = _classify_balance(row)
        balance_totals[category] += _number(row.get("profit", ""))

    today = today or date.today()
    last_complete = today - timedelta(days=1)
    first_day = last_complete - timedelta(days=119)
    requests: set[tuple[str, str]] = set()
    overnight_days = 0
    for state in positions.values():
        if not state.open_time or not state.symbol:
            continue
        end = state.close_time.date() if state.close_time else last_complete
        start = max(state.open_time.date(), first_day)
        while start <= min(end, last_complete):
            close = datetime.combine(start, datetime.max.time().replace(microsecond=0))
            if state.open_time <= close and (state.close_time is None or state.close_time > close):
                requests.add((state.symbol, f"{start.isoformat()} 23:59:59"))
                overnight_days += 1
            start += timedelta(days=1)

    request_path = directory / "price-requests.csv"
    temporary = request_path.with_suffix(".csv.tmp")
    with temporary.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle, delimiter=";", lineterminator="\n")
        writer.writerow(("symbol", "requested_server_time"))
        for symbol, requested in sorted(requests):
            writer.writerow((symbol, requested))
        handle.flush()
        os.fsync(handle.fileno())
    os.replace(temporary, request_path)

    calc_path = directory / "ordercalc-requests.csv"
    calc_temporary = calc_path.with_suffix(".csv.tmp")
    with calc_temporary.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle, delimiter=";", lineterminator="\n")
        writer.writerow(("position_id", "symbol", "direction", "volume", "open_price", "close_price", "realized_profit"))
        for state in positions.values():
            if state.entries == 1 and state.exits == 1 and state.close_time and not state.invalid and state.open_price > 0 and state.close_price > 0:
                writer.writerow((state.position_id, state.symbol, state.direction, state.initial_volume, state.open_price, state.close_price, state.realized_profit))
        handle.flush()
        os.fsync(handle.fileno())
    os.replace(calc_temporary, calc_path)

    return {
        "positions": positions,
        "orders": len(orders),
        "balances": balances,
        "balance_categories": balance_categories,
        "balance_totals": balance_totals,
        "last_120_days": 120,
        "overnight_position_days": overnight_days,
        "price_requests": len(requests),
        "symbols_requiring_prices": sorted({symbol for symbol, _ in requests}),
        "ordercalc_requests": sum(1 for item in positions.values() if item.entries == 1 and item.exits == 1 and item.close_time and not item.invalid and item.open_price > 0 and item.close_price > 0),
    }
