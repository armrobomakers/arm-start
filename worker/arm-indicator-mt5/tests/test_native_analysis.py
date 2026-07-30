import csv
import json

from arm_mt5_worker.native_analysis import analyze_native_history


def _write_export(path):
    path.mkdir()
    (path / "manifest.json").write_text(json.dumps({"server": "Tickmill-Live", "trade_allowed": False}), encoding="utf-8")
    deal_headers = ["ticket", "order", "time", "time_msc", "type", "type_name", "entry", "entry_name", "magic", "position_id", "reason", "reason_name", "volume", "price", "commission", "swap", "profit", "fee", "symbol", "comment", "external_id"]
    rows = [
        ["1", "1", "2026.07.01 10:00:00", "1", "0", "DEAL_TYPE_BUY", "0", "DEAL_ENTRY_IN", "0", "10", "", "", "1", "1", "0", "0", "0", "0", "EURUSD", "", ""],
        ["2", "2", "2026.07.02 10:00:00", "2", "1", "DEAL_TYPE_SELL", "1", "DEAL_ENTRY_OUT", "0", "10", "", "", "1", "1.1", "0", "0", "10", "0", "EURUSD", "", ""],
        ["3", "3", "2026.07.03 10:00:00", "3", "2", "DEAL_TYPE_BALANCE", "", "", "0", "0", "", "", "0", "0", "0", "0", "100", "0", "", "Deposit", ""],
    ]
    with (path / "history-deals.csv").open("w", newline="", encoding="cp1252") as handle:
        writer = csv.writer(handle, delimiter=";")
        writer.writerow(deal_headers)
        writer.writerows(rows)
    order_headers = ["ticket", "time_setup"]
    with (path / "history-orders.csv").open("w", newline="", encoding="cp1252") as handle:
        writer = csv.writer(handle, delimiter=";")
        writer.writerow(order_headers)
        writer.writerow(["1", "2026.07.01 09:59:00"])


def test_native_analysis_builds_unique_overnight_requests(tmp_path):
    export = tmp_path / "ARMIndicator"
    _write_export(export)
    result = analyze_native_history(export, today=__import__("datetime").date(2026, 7, 30))
    assert len(result["positions"]) == 1
    assert result["balance_categories"]["deposit"] == 1
    assert result["overnight_position_days"] == 1
    assert result["price_requests"] == 1
    assert (export / "price-requests.csv").exists()
