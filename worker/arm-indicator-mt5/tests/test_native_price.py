from datetime import datetime, timedelta
from pathlib import Path

from arm_mt5_worker.native_price import LOOKBACK_MINUTES, select_previous_tick


REQUESTED = datetime(2026, 7, 12, 23, 59, 59)
FRIDAY_TICK = (datetime(2026, 7, 10, 21, 59, 0), 1.1, 1.1002)
MONDAY_TICK = (datetime(2026, 7, 13, 0, 1, 0), 1.2, 1.2002)


def test_saturday_uses_previous_friday_tick():
    result = select_previous_tick(REQUESTED, [FRIDAY_TICK, MONDAY_TICK])
    assert result == FRIDAY_TICK


def test_sunday_uses_previous_friday_tick():
    requested = datetime(2026, 7, 12, 12, 0, 0)
    assert select_previous_tick(requested, [FRIDAY_TICK, MONDAY_TICK]) == FRIDAY_TICK


def test_next_monday_tick_is_never_used():
    requested = datetime(2026, 7, 12, 23, 59, 59)
    assert select_previous_tick(requested, [MONDAY_TICK]) is None


def test_normal_day_uses_nearest_previous_tick():
    requested = datetime(2026, 7, 9, 10, 0, 0)
    earlier = (requested - timedelta(minutes=12), 1.0, 1.1)
    nearest = (requested - timedelta(minutes=2), 1.2, 1.3)
    assert select_previous_tick(requested, [earlier, nearest]) == nearest


def test_progressive_search_stops_after_successful_window():
    requested = datetime(2026, 7, 9, 10, 0, 0)
    first_window = (requested - timedelta(minutes=10), 1.0, 1.1)
    later_window = (requested - timedelta(minutes=30), 1.2, 1.3)
    assert select_previous_tick(requested, [first_window, later_window]) == first_window


def test_gap_seconds_are_exact():
    requested = datetime(2026, 7, 12, 23, 59, 59)
    actual = select_previous_tick(requested, [FRIDAY_TICK])
    assert actual is not None
    assert int((requested - actual[0]).total_seconds()) == 180059


def test_no_data_for_seven_days_stays_missing():
    requested = datetime(2026, 7, 12, 23, 59, 59)
    too_old = (requested - timedelta(days=7, seconds=1), 1.0, 1.1)
    assert select_previous_tick(requested, [too_old]) is None


def test_exporter_has_progressive_windows_and_no_trade_calls():
    source = (Path(__file__).parents[1] / "mql5" / "ARMHistoricalPriceExporter.mq5").read_text(encoding="utf-8")
    assert "15*60,2*60*60,12*60*60,36*60*60,72*60*60,120*60*60,168*60*60" in source
    assert "ticks[i].time_msc<=requested_msc" in source
    assert '"source","status"' in source or '"source","status"' in source
    for token in ("OrderSend", "OrderSendAsync", "CTrade", "TRADE_ACTION_", "PositionClose"):
        assert token not in source
