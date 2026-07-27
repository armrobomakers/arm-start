from pathlib import Path


def test_production_source_has_no_trade_functions():
    source = Path(__file__).parents[1] / "src" / "arm_mt5_worker"
    text = "\n".join(path.read_text(encoding="utf-8") for path in source.glob("*.py"))
    for forbidden in ("order_send", "trade request creation", "TRADE_ACTION_", "ORDER_TYPE_BUY", "ORDER_TYPE_SELL"):
        assert forbidden not in text
