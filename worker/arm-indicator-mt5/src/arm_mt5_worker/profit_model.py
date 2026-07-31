from __future__ import annotations

import csv
import os
from collections import defaultdict
from datetime import date, datetime, timedelta
from pathlib import Path

from .native_analysis import PositionState, _dt, _number, _position_lifecycles
from .native_export import NativeExportError, _read_csv


PRICE_HEADERS = {"symbol", "requested_server_time"}
METADATA_HEADERS = {
    "symbol", "currency_base", "currency_profit", "currency_margin", "trade_calc_mode",
    "trade_contract_size", "point", "digits", "tick_size", "tick_value", "tick_value_profit",
    "tick_value_loss", "face_value", "liquidity_rate", "account_currency",
}


def calculate_custom_profit(mode: int, direction: str, volume: float, open_price: float, close_price: float, contract_size: float, tick_size: float | None = None, tick_value: float | None = None) -> float | None:
    delta = close_price - open_price if direction == "BUY" else open_price - close_price
    if mode in (0, 3):
        return delta * contract_size * volume
    if mode == 2:
        if not tick_size or not tick_value or tick_size <= 0 or tick_value <= 0:
            return None
        return delta / tick_size * tick_value * volume
    return None
CALC_HEADERS = {
    "position_id", "symbol", "realized_profit", "calculated_profit", "abs_error", "status",
}


def _read_optional_csv(path: Path, required: set[str]) -> list[dict[str, str]]:
    if not path.exists():
        raise NativeExportError(f"{path.name} is missing")
    return _read_csv(path, required)


def _percentile(values: list[float], percentile: float) -> float | None:
    if not values:
        return None
    values = sorted(values)
    index = max(0, min(len(values) - 1, int(percentile * len(values) + 0.999999) - 1))
    return values[index]


def _symbol_metrics(rows: list[dict[str, str]]) -> dict[str, dict[str, float | int | None]]:
    grouped: dict[str, list[dict[str, str]]] = defaultdict(list)
    for row in rows:
        if row.get("status") == "ok":
            grouped[row.get("symbol", "")].append(row)
    result = {}
    for symbol, items in grouped.items():
        errors = [abs(_number(row.get("abs_error"))) for row in items]
        result[symbol] = {
            "samples": len(items),
            "median_abs_error": _percentile(errors, 0.5),
            "p95_abs_error": _percentile(errors, 0.95),
            "max_abs_error": max(errors) if errors else None,
        }
    return result


def _comment_category(comment: str) -> str:
    text = comment.strip().lower()
    if not text:
        return "empty"
    if any(token in text for token in ("pamm", "deposit", "withdraw")):
        return "cashflow"
    return "strategy"


def _conversion_map(metadata: list[dict[str, str]], account_currency: str) -> list[dict[str, str]]:
    symbols = {row.get("symbol", "") for row in metadata}
    currencies = sorted({row.get("currency_profit", "") for row in metadata if row.get("currency_profit") != account_currency})
    result = []
    for profit_currency in currencies:
        direct = f"{profit_currency}{account_currency}"
        inverse = f"{account_currency}{profit_currency}"
        if direct in symbols:
            symbol, direction, status = direct, "DIRECT", "AVAILABLE"
        elif inverse in symbols:
            symbol, direction, status = inverse, "INVERSE", "AVAILABLE"
        else:
            symbol, direction, status = "", "", "MISSING"
        result.append({
            "profit_currency": profit_currency,
            "account_currency": account_currency,
            "conversion_symbol": symbol,
            "direction": direction,
            "status": status,
        })
    return result


def _write_conversion_requests(path: Path, requests: list[dict[str, str]]) -> None:
    temporary = path.with_suffix(path.suffix + ".tmp")
    with temporary.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle, delimiter=";", lineterminator="\n")
        writer.writerow(("conversion_symbol", "requested_server_time", "direction", "source_symbol", "profit_currency", "account_currency"))
        for row in requests:
            writer.writerow(tuple(row[key] for key in ("conversion_symbol", "requested_server_time", "direction", "source_symbol", "profit_currency", "account_currency")))
        handle.flush()
        os.fsync(handle.fileno())
    os.replace(temporary, path)


def _write_request_file(path: Path, header: tuple[str, ...], rows: list[tuple[object, ...]]) -> None:
    temporary = path.with_suffix(path.suffix + ".tmp")
    with temporary.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle, delimiter=";", lineterminator="\n")
        writer.writerow(header)
        writer.writerows(rows)
        handle.flush()
        os.fsync(handle.fileno())
    os.replace(temporary, path)


def _cashflow_requests(deals: list[dict[str, str]], positions: dict[str, PositionState], metadata: dict[str, dict[str, str]], conversion: dict[str, dict[str, str]], first_day: date, last_day: date) -> tuple[list[dict[str, str]], list[dict[str, str]]]:
    flows = [row for row in deals if row.get("type_name", "").endswith("BALANCE") and first_day <= _dt(row["time"]).date() <= last_day]
    price_rows = []
    conversion_rows = []
    for flow in flows:
        flow_time = _dt(flow["time"])
        flow_id = flow.get("ticket", "")
        for position_id, state in positions.items():
            before = [event for event in state.timeline if event[0] < flow_time]
            if not before or before[-1][2] <= 1e-9:
                continue
            timestamp, _, remaining, weighted_price = before[-1]
            row = {"flow_id": flow_id, "source_symbol": state.symbol, "requested_server_time": flow["time"], "position_id": position_id, "direction": state.direction, "volume": f"{remaining:.12g}", "weighted_open_price": f"{weighted_price:.12g}"}
            price_rows.append(row)
            source = metadata.get(state.symbol, {})
            profit_currency = source.get("currency_profit", "")
            mapping = conversion.get(profit_currency)
            if mapping and mapping.get("status") == "AVAILABLE":
                conversion_rows.append({"flow_id": flow_id, "conversion_symbol": mapping["conversion_symbol"], "requested_server_time": flow["time"], "direction": mapping["direction"], "source_symbol": state.symbol, "profit_currency": profit_currency, "account_currency": mapping["account_currency"]})
    price_rows = list({tuple(row.items()): row for row in price_rows}.values())
    conversion_rows = list({tuple(row.items()): row for row in conversion_rows}.values())
    return price_rows, conversion_rows


def analyze_profit_model(directory: Path, *, today: date | None = None) -> dict[str, object]:
    metadata_path = directory / "symbol-metadata.csv"
    metadata = _read_optional_csv(metadata_path, METADATA_HEADERS)
    deals = _read_csv(directory / "history-deals.csv", {"time", "time_msc", "type_name", "entry_name", "position_id", "volume", "price", "profit", "symbol", "comment", "reason_name"})
    _read_optional_csv(directory / "history-orders.csv", {"ticket", "time_setup"})
    prices = _read_optional_csv(directory / "historical-prices.csv", {"symbol", "requested_server_time", "status"})
    requests = _read_optional_csv(directory / "price-requests.csv", PRICE_HEADERS)
    calculations = _read_optional_csv(directory / "ordercalc-results.csv", CALC_HEADERS)

    currencies = {row.get("account_currency", "") for row in metadata if row.get("account_currency")}
    if len(currencies) != 1:
        raise NativeExportError("account currency is missing or inconsistent")
    account_currency = currencies.pop()
    positions = _position_lifecycles(deals)
    deal_by_position = defaultdict(list)
    for deal in deals:
        if deal.get("position_id") not in {"", "0"}:
            deal_by_position[deal["position_id"]].append(deal)
    balances = [{"amount": _number(row.get("profit")), "comment": row.get("comment", "")} for row in deals if row.get("type_name", "").endswith("BALANCE")]
    latest = max((_dt(row["time"]) for row in deals), default=datetime.now())
    last_complete = today - timedelta(days=1) if today else latest.date()
    first_day = last_complete - timedelta(days=119)
    recent_positions = [
        state for state in positions.values()
        if state.open_time and state.open_time.date() <= last_complete
        and (state.close_time is None or state.close_time.date() >= first_day)
    ]
    recent_requests = [row for row in requests if first_day.isoformat() <= row["requested_server_time"][:10] <= last_complete.isoformat()]
    metrics = _symbol_metrics(calculations)
    metadata_by_symbol = {row["symbol"]: row for row in metadata}
    conversion = _conversion_map(metadata, account_currency)
    conversion_by_currency = {row["profit_currency"]: row for row in conversion}
    cashflow_prices, cashflow_conversions = _cashflow_requests(deals, positions, metadata_by_symbol, conversion_by_currency, first_day, last_complete)
    if cashflow_prices:
        _write_request_file(directory / "cashflow-price-requests.csv", ("flow_id", "source_symbol", "requested_server_time", "position_id", "direction", "volume", "weighted_open_price"), [tuple(row[key] for key in ("flow_id", "source_symbol", "requested_server_time", "position_id", "direction", "volume", "weighted_open_price")) for row in cashflow_prices])
    if cashflow_conversions:
        _write_request_file(directory / "cashflow-conversion-price-requests.csv", ("flow_id", "conversion_symbol", "requested_server_time", "direction", "source_symbol", "profit_currency", "account_currency"), [tuple(row[key] for key in ("flow_id", "conversion_symbol", "requested_server_time", "direction", "source_symbol", "profit_currency", "account_currency")) for row in cashflow_conversions])
    conversion_requests = []
    for request in recent_requests:
        source = metadata_by_symbol.get(request["symbol"])
        if not source or source.get("currency_profit") == account_currency:
            continue
        mapping = conversion_by_currency.get(source.get("currency_profit", ""), {})
        if mapping.get("status") == "AVAILABLE":
            conversion_requests.append({
                "conversion_symbol": mapping["conversion_symbol"],
                "requested_server_time": request["requested_server_time"],
                "direction": mapping["direction"],
                "source_symbol": request["symbol"],
                "profit_currency": source["currency_profit"],
                "account_currency": account_currency,
            })
    unique_requests = {tuple(row.items()) for row in conversion_requests}
    conversion_requests = [dict(items) for items in sorted(unique_requests)]
    _write_conversion_requests(directory / "conversion-price-requests.csv", conversion_requests)

    classifications = {"ACCOUNT_CURRENCY_DIRECT": [], "HISTORICAL_CONVERSION_REQUIRED": [], "CONTRACT_SPEC_OR_SPECIAL_DEAL": [], "UNVERIFIED": []}
    for row in metadata:
        symbol = row["symbol"]
        metric = metrics.get(symbol, {})
        if not metric:
            classifications["UNVERIFIED"].append(symbol)
        elif row.get("currency_profit") == account_currency:
            target = "ACCOUNT_CURRENCY_DIRECT" if (metric.get("p95_abs_error") or 0) <= 0.01 else "CONTRACT_SPEC_OR_SPECIAL_DEAL"
            classifications[target].append(symbol)
        elif conversion_by_currency.get(row.get("currency_profit", ""), {}).get("status") == "AVAILABLE":
            classifications["HISTORICAL_CONVERSION_REQUIRED"].append(symbol)
        else:
            classifications["UNVERIFIED"].append(symbol)

    zero_anomalies = []
    state_by_position = positions
    for row in calculations:
        if row.get("status") != "ok" or abs(_number(row.get("realized_profit"))) > 0.01 or abs(_number(row.get("calculated_profit"))) <= 0.01:
            continue
        state = state_by_position.get(row.get("position_id", ""))
        if state:
            details = deal_by_position.get(state.position_id, [])
            first_deal = details[0] if details else {}
            zero_anomalies.append({"position_id": state.position_id, "symbol": state.symbol, "open_time": state.open_time, "close_time": state.close_time, "direction": state.direction, "volume": state.initial_volume, "open_price": state.open_price, "close_price": state.close_price, "deal_reason": first_deal.get("reason_name", ""), "deal_entry": first_deal.get("entry_name", ""), "comment_category": _comment_category(first_deal.get("comment", "")), "actual_profit": _number(row["realized_profit"]), "calculated_profit": _number(row["calculated_profit"])})
    price_ok = sum(row.get("status") == "ok" for row in prices)
    day_close_symbols = sorted({row["symbol"] for row in recent_requests})
    cashflow_symbols = sorted({row["source_symbol"] for row in cashflow_prices})
    return {"account_currency": account_currency, "positions": recent_positions, "samples": recent_requests, "symbols": day_close_symbols, "day_close_symbols": day_close_symbols, "cashflow_symbols": cashflow_symbols, "valuation_symbols": sorted(set(day_close_symbols) | set(cashflow_symbols)), "metadata": metadata_by_symbol, "metrics": metrics, "classifications": classifications, "conversion": conversion, "conversion_requests": conversion_requests, "cashflow_price_requests": cashflow_prices, "cashflow_conversion_requests": cashflow_conversions, "zero_anomalies": zero_anomalies, "price_coverage": (price_ok, len(requests)), "_balances": balances}


def render_profit_model(result: dict[str, object]) -> str:
    classifications = result["classifications"]
    conversion = result["conversion"]
    inflows = [row for row in result["_balances"] if row["amount"] > 0] if "_balances" in result else []
    outflows = [row for row in result["_balances"] if row["amount"] < 0] if "_balances" in result else []
    lines = [f"ACCOUNT CURRENCY: {result['account_currency']}", f"LAST 120 DAY POSITIONS: {len(result['positions'])}", f"LAST 120 DAY SAMPLES: {len(result['samples'])}", f"DAY-CLOSE SYMBOLS: {', '.join(result['day_close_symbols']) or '-'}", f"CASHFLOW SYMBOLS: {', '.join(result['cashflow_symbols']) or '-'}", f"LAST-120 VALUATION SYMBOLS: {', '.join(result['valuation_symbols']) or '-'}"]
    for symbol in sorted(result["metadata"]):
        row = result["metadata"][symbol]
        metric = result["metrics"].get(symbol, {})
        lines.append(f"SYMBOL {symbol}: currency_profit={row.get('currency_profit','')} currency_base={row.get('currency_base','')} currency_margin={row.get('currency_margin','')} trade_calc_mode={row.get('trade_calc_mode','')} contract_size={row.get('trade_contract_size','')} point={row.get('point','')} digits={row.get('digits','')} samples={metric.get('samples', 0)} median_abs_error={metric.get('median_abs_error')} p95_abs_error={metric.get('p95_abs_error')} max_abs_error={metric.get('max_abs_error')}")
    for key in classifications:
        lines.append(f"{key} SYMBOLS: {', '.join(classifications[key]) or '-'}")
    lines.append(f"ZERO-PROFIT ANOMALIES: {len(result['zero_anomalies'])}")
    lines.append(f"CONVERSION CURRENCIES: {', '.join(row['profit_currency'] for row in conversion) or '-'}")
    lines.append(f"CONVERSION SYMBOLS: {', '.join(row['conversion_symbol'] for row in conversion if row['conversion_symbol']) or '-'}")
    lines.append(f"CONVERSION REQUESTS: {len(result['conversion_requests'])}")
    lines += [f"BALANCE INFLOWS: {len(inflows)}", f"BALANCE OUTFLOWS: {len(outflows)}", f"BALANCE INFLOW TOTAL: {sum(row['amount'] for row in inflows):.2f}", f"BALANCE OUTFLOW TOTAL: {sum(row['amount'] for row in outflows):.2f}", f"CASHFLOW PRICE REQUESTS: {len(result['cashflow_price_requests'])}", f"CASHFLOW CONVERSION REQUESTS: {len(result['cashflow_conversion_requests'])}", f"PRICE COVERAGE: {result['price_coverage'][0]}/{result['price_coverage'][1]}", "HISTORICAL PROFIT MODEL READY: YES", "DAILYGAIN CREATED: NO", "PUBLISH: NO", "PRODUCTION CHANGED: NO"]
    return "\n".join(lines)
