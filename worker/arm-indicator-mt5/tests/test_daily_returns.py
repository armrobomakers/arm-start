from arm_mt5_worker.daily_returns import calculate_daily_returns


def snapshot(timestamp, equity):
    return {"timestamp_utc": timestamp, "equity": equity}


def test_no_cashflow_return_uses_close_snapshots():
    snapshots = [snapshot("2026-01-01T23:59:00+00:00", 100), snapshot("2026-01-02T23:59:00+00:00", 110)]
    result = calculate_daily_returns(snapshots, [], "UTC", "23:59:00", 180, 120, {}, now=__import__("datetime").datetime(2026, 1, 3, tzinfo=__import__("datetime").timezone.utc))
    assert result[1]["complete"] is True
    assert round(result[1]["return_pct"], 4) == 10


def test_cashflow_day_uses_segment_chaining():
    snapshots = [
        snapshot("2026-01-01T23:59:00+00:00", 100),
        snapshot("2026-01-02T11:59:00+00:00", 110),
        snapshot("2026-01-02T12:00:30+00:00", 210),
        snapshot("2026-01-02T23:59:00+00:00", 220),
    ]
    deals = [{"type": "BALANCE", "time_utc": "2026-01-02T12:00:00+00:00", "time_msc": 1}]
    result = calculate_daily_returns(snapshots, deals, "UTC", "23:59:00", 180, 120, {"BALANCE": "external_flow"}, now=__import__("datetime").datetime(2026, 1, 3, tzinfo=__import__("datetime").timezone.utc))
    assert result[1]["complete"] is True
    assert round(result[1]["return_pct"], 4) == round(((110 / 100) * (220 / 210) - 1) * 100, 4)
