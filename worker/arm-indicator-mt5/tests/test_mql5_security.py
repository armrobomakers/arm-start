from pathlib import Path


SOURCE = (Path(__file__).parents[1] / "mql5" / "ARMHistoryExporter.mq5").read_text(encoding="utf-8")


def test_native_exporter_is_read_only():
    forbidden = (
        "OrderSend", "OrderSendAsync", "CTrade", "trade.Buy", "trade.Sell", "PositionClose",
        "TRADE_ACTION_", "ORDER_TYPE_BUY", "ORDER_TYPE_SELL",
    )
    for token in forbidden:
        assert token not in SOURCE
    assert "TERMINAL_CONNECTED" in SOURCE
    assert "ACCOUNT_TRADE_ALLOWED" in SOURCE
    assert '"Tickmill-Live"' in SOURCE
    assert "HistorySelect(0,TimeCurrent())" in SOURCE
