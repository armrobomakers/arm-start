import pytest

from arm_mt5_worker.validation import convert_profit, _validate_price_rows


def test_direct_positive_uses_bid_and_negative_uses_ask():
    assert convert_profit(10, "DIRECT", 1.1, 1.2) == 11
    assert convert_profit(-10, "DIRECT", 1.1, 1.2) == -12


def test_inverse_positive_uses_ask_divisor_and_negative_uses_bid():
    assert convert_profit(10, "INVERSE", 100, 110) == pytest.approx(10 / 110)
    assert convert_profit(-10, "INVERSE", 100, 110) == pytest.approx(-10 / 100)


def test_zero_profit_is_zero_without_prices():
    assert convert_profit(0, "DIRECT", 0, 0) == 0


def test_missing_sample_id_and_future_or_approximate_tick_fail_closed():
    rows = [
        {"sample_id": "", "status": "ok", "source": "tick", "actual_tick_time": "2026.01.01", "requested_server_time": "2026.01.02"},
        {"sample_id": "future", "status": "ok", "source": "tick", "actual_tick_time": "2026.01.03", "requested_server_time": "2026.01.02"},
        {"sample_id": "m1", "status": "approximate", "source": "m1_fallback", "actual_tick_time": "2026.01.01", "requested_server_time": "2026.01.02"},
    ]
    valid, failures = _validate_price_rows(rows)
    assert valid == {}
    assert failures == ["<missing>", "future", "m1"]
