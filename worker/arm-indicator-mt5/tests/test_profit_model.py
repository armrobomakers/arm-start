import csv
from datetime import date

from arm_mt5_worker.native_analysis import _position_lifecycles
from arm_mt5_worker.profit_model import _cashflow_requests, _conversion_map, _write_request_file, analyze_profit_model, calculate_custom_profit
from arm_mt5_worker.native_analysis import PositionState
from datetime import datetime


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
    _csv(path / "symbol-metadata.csv", ["symbol", "currency_base", "currency_profit", "currency_margin", "trade_calc_mode", "trade_contract_size", "point", "digits", "volume_min", "volume_step", "tick_size", "tick_value", "tick_value_profit", "tick_value_loss", "face_value", "liquidity_rate", "account_currency"], [["EURUSD", "EUR", "USD", "USD", "0", "100000", "0.00001", "5", "0.01", "0.01", "0.00001", "10", "10", "10", "0", "0", "USD"]])
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


def test_profit_formulas_support_mode_zero_two_three_and_sell():
    assert calculate_custom_profit(0, "BUY", 2, 10, 11, 100) == 200
    assert calculate_custom_profit(0, "SELL", 2, 11, 10, 100) == 200
    assert calculate_custom_profit(2, "BUY", 2, 10, 11, 1, 0.5, 5) == 20
    assert calculate_custom_profit(3, "SELL", 2, 11, 10, 100) == 200


def test_profit_formula_fails_closed_without_tick_metadata():
    assert calculate_custom_profit(2, "BUY", 1, 10, 11, 1, 0, 5) is None
    assert calculate_custom_profit(2, "BUY", 1, 10, 11, 1, 1, 0) is None
    assert calculate_custom_profit(99, "BUY", 1, 10, 11, 1) is None


def test_partial_timeline_keeps_weighted_price_after_entry_and_partial_close():
    def deal(ticket, time, type_name, entry, volume, price):
        return {"ticket": str(ticket), "time": time, "time_msc": str(ticket), "type_name": type_name, "entry_name": entry, "position_id": "42", "volume": str(volume), "price": str(price), "profit": "0", "commission": "0", "swap": "0", "fee": "0", "symbol": "EURUSD"}

    positions = _position_lifecycles([
        deal(1, "2026.07.01 10:00:00", "DEAL_TYPE_BUY", "DEAL_ENTRY_IN", 1, 100),
        deal(2, "2026.07.01 11:00:00", "DEAL_TYPE_BUY", "DEAL_ENTRY_IN", 2, 110),
        deal(3, "2026.07.01 12:00:00", "DEAL_TYPE_SELL", "DEAL_ENTRY_OUT", 1, 120),
        deal(4, "2026.07.01 13:00:00", "DEAL_TYPE_SELL", "DEAL_ENTRY_OUT", 2, 130),
    ])
    state = positions["42"]
    assert state.partial is True
    assert state.timeline[1][3] == 106.66666666666667
    assert state.timeline[2][2] == 2
    assert state.timeline[2][3] == state.timeline[1][3]
    assert state.timeline[-1][2] == 0


def test_cashflow_requests_preserve_position_link_and_deduplicate(tmp_path):
    state = PositionState("42", symbol="EURJPY", direction="BUY", timeline=[(datetime(2026, 7, 1, 10), 1.0, 1.0, 160.0)])
    deals = [{"ticket": "flow-1", "time": "2026.07.01 11:00:00", "type_name": "DEAL_TYPE_BALANCE", "profit": "10"}]
    metadata = {"EURJPY": {"currency_profit": "JPY"}}
    conversion = {"JPY": {"status": "AVAILABLE", "conversion_symbol": "JPYUSD", "direction": "DIRECT", "account_currency": "USD"}}
    prices, conversions = _cashflow_requests(deals, {"42": state}, metadata, conversion, datetime(2026, 7, 1).date(), datetime(2026, 7, 1).date())
    assert len(prices) == 1
    assert prices[0]["weighted_open_price"] == "160"
    assert len(conversions) == 1
    path = tmp_path / "cashflow-price-requests.csv"
    _write_request_file(path, ("flow_id", "source_symbol"), [(prices[0]["flow_id"], prices[0]["source_symbol"])])
    assert path.read_text().splitlines()[0] == "flow_id;source_symbol"


def test_cashflow_after_full_close_excludes_position():
    state = PositionState("42", symbol="EURUSD", direction="BUY", timeline=[
        (datetime(2026, 7, 1, 10), 1.0, 1.0, 100.0),
        (datetime(2026, 7, 1, 11), -1.0, 0.0, 0.0),
    ])
    deals = [{"ticket": "flow-1", "time": "2026.07.01 12:00:00", "type_name": "DEAL_TYPE_BALANCE", "profit": "10"}]
    prices, conversions = _cashflow_requests(deals, {"42": state}, {"EURUSD": {"currency_profit": "USD"}}, {}, datetime(2026, 7, 1).date(), datetime(2026, 7, 1).date())
    assert prices == []
    assert conversions == []


def test_cashflow_after_partial_close_uses_current_remaining_state():
    state = PositionState("42", symbol="EURJPY", direction="BUY", timeline=[
        (datetime(2026, 7, 1, 10), 1.0, 1.0, 100.0),
        (datetime(2026, 7, 1, 11), -0.5, 0.5, 100.0),
    ])
    deals = [{"ticket": "flow-1", "time": "2026.07.01 12:00:00", "type_name": "DEAL_TYPE_BALANCE", "profit": "10"}]
    prices, _ = _cashflow_requests(deals, {"42": state}, {"EURJPY": {"currency_profit": "JPY"}}, {}, datetime(2026, 7, 1).date(), datetime(2026, 7, 1).date())
    assert len(prices) == 1
    assert prices[0]["volume"] == "0.5"
    assert prices[0]["weighted_open_price"] == "100"
