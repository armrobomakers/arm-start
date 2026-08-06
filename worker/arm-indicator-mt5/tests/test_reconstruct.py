import csv
from datetime import date, timedelta

import pytest

from arm_mt5_worker.config import ConfigError, load_config
from arm_mt5_worker.reconstruct import NativeExportError, export_report, reconstruct_last120


def write_csv(path, headers, rows):
    with path.open("w", encoding="cp1252", newline="") as handle:
        writer = csv.writer(handle, delimiter=";")
        writer.writerow(headers)
        writer.writerows(rows)


def make_reconstruction_fixture(path):
    path.mkdir()
    deal_headers = ["ticket", "order", "time", "time_msc", "type", "type_name", "entry", "entry_name", "magic", "position_id", "reason", "reason_name", "volume", "price", "commission", "swap", "profit", "fee", "symbol", "comment", "external_id"]
    deals = [
        ["1", "", "2026.04.02 00:00:00", "1", "", "DEAL_TYPE_BALANCE", "", "", "", "0", "", "", "0", "0", "0", "0", "1000", "0", "", "", ""],
        ["2", "", "2026.04.02 01:00:00", "2", "", "DEAL_TYPE_BUY", "", "DEAL_ENTRY_IN", "", "42", "", "", "1", "100", "0", "0", "0", "0", "EURUSD", "", ""],
        ["3", "", "2026.07.30 12:00:00", "3", "", "DEAL_TYPE_BALANCE", "", "", "", "0", "", "", "0", "0", "0", "0", "0", "0", "", "", ""],
    ]
    write_csv(path / "history-deals.csv", deal_headers, deals)
    write_csv(path / "history-orders.csv", ["ticket", "time_setup"], [])
    write_csv(path / "symbol-metadata.csv", ["symbol", "currency_profit", "trade_calc_mode", "trade_contract_size", "tick_size", "tick_value", "account_currency"], [["EURUSD", "USD", "0", "100000", "0.00001", "10", "USD"]])
    dates = [date(2026, 4, 2) + timedelta(days=i) for i in range(120)]
    price_rows = [["EURUSD", f"{day.isoformat()} 23:59:59", f"{day.isoformat()} 23:59:59", "100", "100", "0", "tick", "ok"] for day in dates]
    write_csv(path / "historical-prices.csv", ["symbol", "requested_server_time", "actual_tick_time", "bid", "ask", "gap_seconds", "source", "status"], price_rows)
    write_csv(path / "conversion-historical-prices.csv", ["conversion_symbol", "requested_server_time", "actual_tick_time", "bid", "ask", "gap_seconds", "source", "status", "direction", "source_symbol", "profit_currency"], [])
    write_csv(path / "cashflow-historical-prices.csv", ["flow_id", "position_id", "source_symbol", "requested_server_time", "actual_tick_time", "bid", "ask", "gap_seconds", "source", "status"], [["3", "42", "EURUSD", "2026-07-30 12:00:00", "2026-07-30 12:00:00", "100", "100", "0", "tick", "ok"]])
    write_csv(path / "cashflow-conversion-historical-prices.csv", ["flow_id", "conversion_symbol", "requested_server_time", "actual_tick_time", "bid", "ask", "gap_seconds", "source", "status", "direction", "source_symbol", "profit_currency"], [])
    write_csv(path / "price-requests.csv", ["symbol", "requested_server_time"], [[row[0], row[1]] for row in price_rows])
    write_csv(path / "cashflow-price-requests.csv", ["flow_id", "source_symbol", "requested_server_time", "position_id", "direction", "volume", "weighted_open_price"], [["3", "EURUSD", "2026-07-30 12:00:00", "42", "BUY", "1", "100"]])


def test_reconstruction_creates_atomic_seed_with_90_plus_returns(tmp_path):
    export = tmp_path / "ARMIndicator"
    make_reconstruction_fixture(export)
    output = tmp_path / "seed-daily-gain.json"
    result = reconstruct_last120(export, output)
    assert len(result["daily"]) == 119
    assert result["coverage"] == {"day_missing": 0, "conversion_missing": 0, "cash_missing": 0, "cash_conversion_missing": 0, "future": 0, "m1": 0}
    assert result["cashflow_invariant_max_error"] == 0
    assert output.exists()
    assert not output.with_suffix(".json.tmp").exists()


def test_export_dir_is_explicit_and_missing_directory_fails_closed(tmp_path, monkeypatch):
    env = tmp_path / "worker.env"
    env.write_text("MT5_TERMINAL_PATH=C:\\MT5\\terminal64.exe\nMT5_EXPECTED_LOGIN=1\nMT5_EXPECTED_SERVER=Tickmill-Live\nARM_MT5_EXPORT_DIR=C:\\Users\\Administrator\\AppData\\Roaming\\MetaQuotes\\Terminal\\Common\\Files\\ARMIndicator\n", encoding="utf-8")
    monkeypatch.setenv("APPDATA", str(tmp_path / "wrong-profile"))
    config = load_config(env, require_runtime=False)
    assert str(config.mt5_export_dir) == "C:\\Users\\Administrator\\AppData\\Roaming\\MetaQuotes\\Terminal\\Common\\Files\\ARMIndicator"
    assert not config.mt5_export_dir.exists()
    with pytest.raises(NativeExportError):
        export_report(config.mt5_export_dir)
