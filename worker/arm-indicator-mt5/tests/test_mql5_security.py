from pathlib import Path


SOURCE = (Path(__file__).parents[1] / "mql5" / "ARMHistoryExporter.mq5").read_text(encoding="utf-8")
CONVERSION_SOURCE = (Path(__file__).parents[1] / "mql5" / "ARMConversionPriceExporter.mq5").read_text(encoding="utf-8")
METADATA_SOURCE = (Path(__file__).parents[1] / "mql5" / "ARMSymbolMetadataExporter.mq5").read_text(encoding="utf-8")
VALIDATION_CONVERSION_SOURCE = (Path(__file__).parents[1] / "mql5" / "ARMValidationConversionPriceExporter.mq5").read_text(encoding="utf-8")
CASHFLOW_SOURCE = (Path(__file__).parents[1] / "mql5" / "ARMCashflowPriceExporter.mq5").read_text(encoding="utf-8")


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


def test_validation_conversion_exporter_is_isolated_and_read_only():
    for token in ("OrderSend", "OrderSendAsync", "CTrade", "trade.Buy", "trade.Sell", "PositionClose", "TRADE_ACTION_", "ORDER_TYPE_BUY", "ORDER_TYPE_SELL"):
        assert token not in VALIDATION_CONVERSION_SOURCE
    assert 'ARMIndicator/validation-conversion-price-requests.csv' in VALIDATION_CONVERSION_SOURCE
    assert 'ARMIndicator/validation-conversion-historical-prices.csv' in VALIDATION_CONVERSION_SOURCE
    assert 'conversion-price-requests.csv' not in VALIDATION_CONVERSION_SOURCE.replace('validation-conversion-price-requests.csv', '')
    assert 'conversion-historical-prices.csv' not in VALIDATION_CONVERSION_SOURCE.replace('validation-conversion-historical-prices.csv', '')
    assert "ticks[i].time_msc<=requested_msc" in VALIDATION_CONVERSION_SOURCE
    assert "15*60,2*60*60,12*60*60,36*60*60,72*60*60,120*60*60,168*60*60" in VALIDATION_CONVERSION_SOURCE
    assert '"sample_id","conversion_symbol","requested_server_time"' in VALIDATION_CONVERSION_SOURCE
    assert 'FileMove(TMP,FILE_COMMON,OUT,FILE_COMMON|FILE_REWRITE)' in VALIDATION_CONVERSION_SOURCE


def test_cashflow_exporter_is_read_only_and_has_independent_atomic_outputs():
    compact_source = CASHFLOW_SOURCE.replace(" ", "").replace("\n", "")
    for token in ("OrderSend", "OrderSendAsync", "CTrade", "trade.Buy", "trade.Sell", "PositionClose", "TRADE_ACTION_", "ORDER_TYPE_BUY", "ORDER_TYPE_SELL"):
        assert token not in CASHFLOW_SOURCE
    for token in ("TERMINAL_CONNECTED", "ACCOUNT_TRADE_ALLOWED", 'AccountInfoString(ACCOUNT_SERVER)!="Tickmill-Live"', "CopyTicksRange", "ticks[i].time_msc<=requested_msc", "15*60,2*60*60,12*60*60,36*60*60,72*60*60,120*60*60,168*60*60", 'FileMove(PRICE_TMP,FILE_COMMON,PRICE_OUT,FILE_COMMON|FILE_REWRITE)', 'FileMove(CONVERSION_TMP,FILE_COMMON,CONVERSION_OUT,FILE_COMMON|FILE_REWRITE)', 'FileWrite(output,"flow_id","position_id","source_symbol","requested_server_time","actual_tick_time","bid","ask","gap_seconds","source","status","direction","volume","weighted_open_price")', 'FileWrite(output,"flow_id","conversion_symbol","requested_server_time","actual_tick_time","bid","ask","gap_seconds","source","status","direction","source_symbol","profit_currency","account_currency")'):
        assert token.replace(" ", "") in compact_source
    assert 'FileOpen(PRICE_REQUESTS,FILE_READ|FILE_CSV|FILE_ANSI|FILE_COMMON,\';\')' in CASHFLOW_SOURCE
    assert 'FileOpen(CONVERSION_REQUESTS,FILE_READ|FILE_CSV|FILE_ANSI|FILE_COMMON,\';\')' in CASHFLOW_SOURCE
    assert '"m1_fallback","approximate"' in CASHFLOW_SOURCE
    assert '"missing"' in CASHFLOW_SOURCE
    assert '"ARMIndicator/historical-prices.csv"' not in CASHFLOW_SOURCE
    assert '"ARMIndicator/validation-conversion-historical-prices.csv"' not in CASHFLOW_SOURCE
    assert "validation-conversion" not in CASHFLOW_SOURCE
