from __future__ import annotations

import csv
import json
from collections import Counter
from pathlib import Path


class NativeExportError(ValueError):
    pass


DEAL_HEADERS = {
    "ticket", "order", "time", "time_msc", "type", "type_name", "entry", "entry_name",
    "magic", "position_id", "reason", "reason_name", "volume", "price", "commission", "swap",
    "profit", "fee", "symbol", "comment", "external_id",
}
ORDER_HEADERS = {
    "ticket", "time_setup", "time_setup_msc", "time_done", "time_done_msc", "type", "type_name",
    "state", "state_name", "type_filling", "filling_name", "type_time", "time_name", "magic",
    "position_id", "position_by_id", "volume_initial", "volume_current", "price_open", "price_current",
    "price_stoplimit", "sl", "tp", "symbol", "comment", "external_id",
}


def _read_csv(path: Path, expected: set[str]) -> list[dict[str, str]]:
    try:
        with path.open("r", encoding="cp1252", newline="") as handle:
            reader = csv.DictReader(handle, delimiter=";")
            headers = set(reader.fieldnames or [])
            if not expected.issubset(headers):
                raise NativeExportError(f"{path.name} is missing required columns")
            return list(reader)
    except OSError as exc:
        raise NativeExportError(f"cannot read {path}") from exc


def inspect_native_export(directory: Path) -> dict[str, object]:
    manifest_path = directory / "manifest.json"
    deals_path = directory / "history-deals.csv"
    orders_path = directory / "history-orders.csv"
    try:
        manifest = json.loads(manifest_path.read_text(encoding="cp1252"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise NativeExportError("manifest.json is invalid") from exc
    required_manifest = {
        "generated_at", "server", "masked_login", "trade_allowed", "deals_count", "orders_count",
        "first_deal_time", "last_deal_time", "first_order_time", "last_order_time", "export_version",
    }
    if not required_manifest.issubset(manifest):
        raise NativeExportError("manifest is missing required fields")
    if manifest["server"] != "Tickmill-Live" or manifest["trade_allowed"] is not False:
        raise NativeExportError("manifest failed read-only security checks")
    deals = _read_csv(deals_path, DEAL_HEADERS)
    orders = _read_csv(orders_path, ORDER_HEADERS)
    if len(deals) != int(manifest["deals_count"]) or len(orders) != int(manifest["orders_count"]):
        raise NativeExportError("CSV counts do not match manifest")
    types = Counter(f"{row['type']} {row['type_name']}" for row in deals)
    symbols = sorted({row["symbol"] for row in deals if row["symbol"]})
    position_ids = sorted({row["position_id"] for row in deals if row["position_id"] not in {"", "0"}})
    return {
        "manifest": manifest,
        "deals": len(deals),
        "orders": len(orders),
        "deal_types": dict(sorted(types.items())),
        "symbols": symbols,
        "position_ids": position_ids,
    }
