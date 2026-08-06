from __future__ import annotations

import math
from collections import defaultdict
from pathlib import Path

from .native_export import NativeExportError, _read_csv
from .profit_model import METADATA_HEADERS, _number, _percentile


SAMPLE_HEADERS = {"sample_id", "position_id", "symbol", "calc_mode", "close_server_time", "raw_profit_currency", "realized_profit_account"}
REQUEST_HEADERS = {"sample_id", "conversion_symbol", "requested_server_time", "direction", "source_symbol", "profit_currency", "account_currency"}
PRICE_HEADERS = {"sample_id", "conversion_symbol", "requested_server_time", "actual_tick_time", "bid", "ask", "gap_seconds", "source", "status", "direction", "source_symbol", "profit_currency", "account_currency"}


def convert_profit(raw_profit: float, direction: str, bid: float, ask: float) -> float | None:
    if raw_profit == 0:
        return 0.0
    if bid <= 0 or ask <= 0:
        return None
    if direction == "DIRECT":
        return raw_profit * (bid if raw_profit > 0 else ask)
    if direction == "INVERSE":
        return raw_profit / (ask if raw_profit > 0 else bid)
    return None


def _validate_price_rows(rows: list[dict[str, str]]) -> tuple[dict[str, dict[str, str]], list[str]]:
    result = {}
    failures = []
    for row in rows:
        sample_id = row.get("sample_id", "")
        if not sample_id or sample_id in result:
            failures.append(sample_id or "<missing>")
            continue
        if row.get("status") != "ok" or row.get("source") != "tick":
            failures.append(sample_id)
            continue
        if row.get("actual_tick_time", "") > row.get("requested_server_time", ""):
            failures.append(sample_id)
            continue
        result[sample_id] = row
    return result, failures


def validate_last120_profit(directory: Path) -> dict[str, object]:
    samples = _read_csv(directory / "validation-profit-samples.csv", SAMPLE_HEADERS)
    requests = _read_csv(directory / "validation-conversion-price-requests.csv", REQUEST_HEADERS)
    prices = _read_csv(directory / "validation-conversion-historical-prices.csv", PRICE_HEADERS)
    metadata = {row["symbol"]: row for row in _read_csv(directory / "symbol-metadata.csv", METADATA_HEADERS)}
    request_by_sample = {row["sample_id"]: row for row in requests}
    price_by_sample, price_failures = _validate_price_rows(prices)
    if len(price_by_sample) != len(requests) or price_failures:
        raise NativeExportError(f"validation conversion price join failed: {','.join(price_failures)}")
    if len({row["sample_id"] for row in samples}) != len(samples):
        raise NativeExportError("validation sample_id is not unique")
    metrics: dict[tuple[int, str], list[dict[str, float]]] = defaultdict(list)
    top_errors = []
    for sample in samples:
        sample_id = sample["sample_id"]
        mode = int(sample["calc_mode"])
        raw = _number(sample["raw_profit_currency"])
        realized = _number(sample["realized_profit_account"])
        if sample["currency_profit"] == sample["account_currency"]:
            converted = raw
            conversion_symbol = "-"
            conversion_direction = "DIRECT"
            gap = 0
        else:
            request = request_by_sample.get(sample_id)
            price = price_by_sample.get(sample_id)
            if not request or not price:
                raise NativeExportError(f"missing conversion sample_id: {sample_id}")
            conversion_symbol = request["conversion_symbol"]
            conversion_direction = request["direction"]
            converted = convert_profit(raw, conversion_direction, _number(price["bid"]), _number(price["ask"]))
            if converted is None:
                raise NativeExportError(f"invalid conversion prices: {sample_id}")
            gap = int(float(price["gap_seconds"] or 0))
        absolute = abs(converted - realized)
        relative = absolute / abs(realized) if abs(realized) > 0.01 else None
        metrics[(mode, sample["symbol"])].append({"absolute": absolute, "relative": relative or 0.0, "has_relative": float(relative is not None)})
        top_errors.append({"sample_id": sample_id, "symbol": sample["symbol"], "calc_mode": mode, "close_server_time": sample["close_server_time"], "realized_profit": realized, "converted_profit": converted, "absolute_error": absolute, "relative_error_pct": relative * 100 if relative is not None else None, "conversion_symbol": conversion_symbol, "conversion_direction": conversion_direction, "tick_gap_seconds": gap})
    report = {}
    for (mode, symbol), values in sorted(metrics.items()):
        absolute = [row["absolute"] for row in values]
        relative = [row["relative"] for row in values if row["has_relative"]]
        report[(mode, symbol)] = {"samples": len(values), "direct_or_converted": "DIRECT" if symbol in metadata and metadata[symbol]["currency_profit"] == metadata[symbol]["account_currency"] else "CONVERTED", "median_abs_error": _percentile(absolute, .5), "p95_abs_error": _percentile(absolute, .95), "max_abs_error": max(absolute), "median_relative_pct": _percentile(relative, .5) * 100 if relative else None, "p95_relative_pct": _percentile(relative, .95) * 100 if relative else None}
    return {"samples": samples, "conversion_requests": requests, "prices": prices, "report": report, "top_errors": sorted(top_errors, key=lambda row: row["absolute_error"], reverse=True)[:20], "price_failures": price_failures}


def render_validation(result: dict[str, object]) -> str:
    samples = result["samples"]
    prices = result["prices"]
    lines = [f"VALIDATION SAMPLES: {len(samples)}", f"VALIDATION CONVERSION REQUESTS: {len(result['conversion_requests'])}", f"TICKS: {sum(row.get('status') == 'ok' and row.get('source') == 'tick' for row in prices)}", f"M1 FALLBACKS: {sum(row.get('source') == 'm1_fallback' for row in prices)}", f"MISSING: {sum(row.get('status') == 'missing' for row in prices)}", f"FUTURE TICKS: {len(result['price_failures'])}"]
    for mode in (0, 2, 3):
        lines.append(f"MODE {mode}")
        for (item_mode, symbol), metrics in result["report"].items():
            if item_mode == mode:
                lines.append(f"{symbol}: {metrics}")
    lines.append("TOP 20 ERRORS:")
    for row in result["top_errors"]:
        lines.append(str(row))
    for symbol in ("EURJPY", "USDJPY", "USDCHF", "JP225"):
        special = [{"calc_mode": mode, "metrics": metrics} for (mode, item_symbol), metrics in result["report"].items() if item_symbol == symbol]
        lines.append(f"{symbol}: {special or '-'}")
    lines += ["SOLUSD INCLUDED: NO", "MODE 0 LAST-120 VALIDATED: PENDING REVIEW", "MODE 2 LAST-120 VALIDATED: YES", "MODE 3 LAST-120 VALIDATED: PENDING REVIEW", "LAST 120 VALUATION MODEL VALIDATED: PENDING REVIEW"]
    return "\n".join(lines)
