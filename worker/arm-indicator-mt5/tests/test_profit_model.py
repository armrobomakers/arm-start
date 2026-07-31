import csv
from datetime import date

from arm_mt5_worker.profit_model import _conversion_map, analyze_profit_model


def _csv(path, headers, rows):
    with path.open("w", encoding="cp1252", newline="") as handle:
        writer = csv.writer(handle, delimiter=";")
        writer.writerow(headers)
        writer.writerows(rows)


def _fixture(path):
    path.mkdir()
    (path / "manifest.json").write_text("{}", encoding="cp1252")
    deals = [
        ["1", "", "2026.07.01 10:00:00", "1", "0", "DEAL_TYPE_BUY", "0", "DEAL_ENTRY_IN", "", "10", "", "DEAL_REASON_CLIENT", "1", "1", "0", "0", "0", "0", "EURUSD", "", ""],
        ["2", "", "2026.07.02 10:00:00", "2", "1", "DEAL_TYPE_SELL", "1", "DEAL_ENTRY_OUT", "", "10", "", "DEAL_REASON_CLIENT", "1", "1.1", "0", "0", "0", "0", "EURUSD", "", ""],
        ["3", "", "2026.07.03 10:00:00", "3", "2", "DEAL_TYPE_BALANCE", "0", "DEAL_ENTRY_IN", "", "0", "", "DEAL_REASON_CLIENT", "0", "0", "0", "0", "100", "0", "", "Deposit", ""],
        ["4", "", "2026.07.04 10:00:00", "4", "2", "DEAL_TYPE_BALANCE", "0", "DEAL_ENTRY_IN", "", "0", "", "DEAL_REASON_CLIENT", "0", "0", "0", "0", "-25", "0", "", "Withdrawal", ""],
    ]
    _csv(path / "history-deals.csv", ["ticket", "order", "time", "time_msc", "type", "type_name", "entry", "entry_name", "magic", "position_id", "reason", "reason_name", "volume", "price", "commission", "swap", "profit", "fee", "symbol", "comment", "external_id"], deals)
    _csv(path / "history-orders.csv", ["ticket", "time_setup"], [["1", "2026.07.01 09:59:00"]])
    _csv(path / "symbol-metadata.csv", ["symbol", "currency_base", "currency_profit", "currency_margin", "trade_calc_mode", "trade_contract_size", "point", "digits", "volume_min", "volume_step", "account_currency"], [["EURUSD", "EUR", "USD", "USD", "0", "100000", "0.00001", "5", "0.01", "0.01", "USD"]])
    _csv(path / "price-requests.csv", ["symbol", "requested_server_time"], [["EURUSD", "2026-07-01 23:59:59"]])
    _csv(path / "historical-prices.csv", ["symbol", "requested_server_time", "status"], [["EURUSD", "2026-07-01 23:59:59", "ok"]])
    _csv(path / "ordercalc-results.csv", ["position_id", "symbol", "realized_profit", "calculated_profit", "abs_error", "status"], [["10", "EURUSD", "0", "1", "1", "ok"]])


def test_direct_conversion_and_inverse_conversion():
    rows = [
        {"symbol": "JPYUSD", "currency_profit": "JPY"},
        {"symbol": "USDCHF", "currency_profit": "CHF"},
    ]
    result = _conversion_map(rows, "USD")
    by_currency = {row["profit_currency"]: row for row in result}
    assert by_currency["JPY"]["conversion_symbol"] == "JPYUSD"
    assert by_currency["JPY"]["direction"] == "DIRECT"
    assert by_currency["CHF"]["conversion_symbol"] == "USDCHF"
    assert by_currency["CHF"]["direction"] == "INVERSE"


def test_missing_conversion_symbol():
    result = _conversion_map([{"symbol": "EURJPY", "currency_profit": "EUR"}], "USD")
    assert result[0]["status"] == "MISSING"


def test_profit_model_filters_recent_data_and_deduplicates_requests(tmp_path):
    export = tmp_path / "ARMIndicator"
    _fixture(export)
    result = analyze_profit_model(export, today=date(2026, 7, 10))
    assert result["account_currency"] == "USD"
    assert len(result["positions"]) == 1
    assert len(result["samples"]) == 1
    assert len(result["zero_anomalies"]) == 1
    assert result["zero_anomalies"][0]["deal_entry"] == "DEAL_ENTRY_IN"
    assert result["zero_anomalies"][0]["comment_category"] == "empty"
    assert result["price_coverage"] == (1, 1)
    assert ";" in (export / "conversion-price-requests.csv").read_text()


def test_balance_flows_are_separated(tmp_path):
    export = tmp_path / "ARMIndicator"
    _fixture(export)
    result = analyze_profit_model(export, today=date(2026, 7, 10))
    assert [row["amount"] for row in result["_balances"]] == [100.0, -25.0]
