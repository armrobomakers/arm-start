from pathlib import Path


SOURCE = (Path(__file__).parents[1] / "mql5" / "ARMHistoryExporter.mq5").read_text(encoding="utf-8")
CONVERSION_SOURCE = (Path(__file__).parents[1] / "mql5" / "ARMConversionPriceExporter.mq5").read_text(encoding="utf-8")
METADATA_SOURCE = (Path(__file__).parents[1] / "mql5" / "ARMSymbolMetadataExporter.mq5").read_text(encoding="utf-8")


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


def test_conversion_price_exporter_is_read_only_and_secure():
    forbidden = (
        "OrderSend", "OrderSendAsync", "CTrade", "trade.Buy", "trade.Sell", "PositionClose",
        "TRADE_ACTION_", "ORDER_TYPE_BUY", "ORDER_TYPE_SELL",
    )
    for token in forbidden:
        assert token not in CONVERSION_SOURCE
    assert "TERMINAL_CONNECTED" in CONVERSION_SOURCE
    assert "ACCOUNT_TRADE_ALLOWED" in CONVERSION_SOURCE
    assert 'AccountInfoString(ACCOUNT_SERVER)!="Tickmill-Live"' in CONVERSION_SOURCE
    assert "CopyTicksRange" in CONVERSION_SOURCE
    assert "ticks[i].time_msc<=requested_msc" in CONVERSION_SOURCE
    assert 'FileOpen(REQUESTS,FILE_READ|FILE_CSV|FILE_ANSI|FILE_COMMON,\';\')' in CONVERSION_SOURCE
    assert 'FileOpen(TMP,FILE_WRITE|FILE_CSV|FILE_ANSI|FILE_COMMON,\';\')' in CONVERSION_SOURCE


def test_conversion_price_exporter_uses_required_schema_and_progressive_windows():
    assert 'FileWrite(output,"conversion_symbol","requested_server_time","actual_tick_time","bid","ask","gap_seconds","source","status","direction","source_symbol","profit_currency","account_currency")' in CONVERSION_SOURCE
    assert "15*60,2*60*60,12*60*60,36*60*60,72*60*60,120*60*60,168*60*60" in CONVERSION_SOURCE
    assert '"m1_fallback","approximate"' in CONVERSION_SOURCE
    assert '"missing"' in CONVERSION_SOURCE
    assert 'FileMove(TMP,FILE_COMMON,OUT,FILE_COMMON|FILE_REWRITE)' in CONVERSION_SOURCE


def test_metadata_exporter_contains_profit_fields_and_remains_read_only():
    forbidden = ("OrderSend", "OrderSendAsync", "CTrade", "trade.Buy", "trade.Sell", "PositionClose", "TRADE_ACTION_")
    for token in forbidden:
        assert token not in METADATA_SOURCE
    for token in ("SYMBOL_TRADE_TICK_SIZE", "SYMBOL_TRADE_TICK_VALUE", "SYMBOL_TRADE_TICK_VALUE_PROFIT", "SYMBOL_TRADE_TICK_VALUE_LOSS", "SYMBOL_TRADE_FACE_VALUE", "SYMBOL_TRADE_LIQUIDITY_RATE"):
        assert token in METADATA_SOURCE
    assert "tick_size" in METADATA_SOURCE and "tick_value_profit" in METADATA_SOURCE
    assert "FileMove(TMP,FILE_COMMON,OUT,FILE_COMMON|FILE_REWRITE)" in METADATA_SOURCE
