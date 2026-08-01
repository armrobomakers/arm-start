import csv
from datetime import date, datetime, timezone
from types import SimpleNamespace

import pytest

from arm_mt5_worker.incremental import NativeExportError, _merge_ticket_rows, _tick_row, incremental_refresh


def write_csv(path, headers, rows):
    with path.open("w", encoding="cp1252", newline="") as handle:
        writer = csv.writer(handle, delimiter=";")
        writer.writerow(headers)
        writer.writerows(rows)


class FakeAdapter:
    identity = SimpleNamespace(trade_allowed=False, server="Tickmill-Live")

    def __init__(self, ticks):
        self.ticks = ticks
        self.calls = []

    def history_deals_get(self, start, end):
        self.calls.append(("deals", start, end))
        return ()

    def history_orders_get(self, start, end):
        self.calls.append(("orders", start, end))
        return ()

    def ticks_get(self, symbol, start, end):
        self.calls.append((symbol, start, end))
        return tuple(self.ticks.get(symbol, ()))

    def deal_type_name(self, value):
        return {0: "BUY", 1: "SELL", 2: "BALANCE"}.get(value, "UNKNOWN")

    def deal_entry_name(self, value):
        return {0: "IN", 1: "OUT", 2: "INOUT"}.get(value, "UNKNOWN")


def test_merge_ticket_rows_deduplicates_and_sorts_by_time_msc_then_ticket():
    rows, duplicates = _merge_ticket_rows(
        [{"ticket": 2, "time_msc": 20}, {"ticket": 1, "time_msc": 10}],
        [{"ticket": 2, "time_msc": 30}, {"ticket": 3, "time_msc": 20}],
    )
    assert duplicates == 1
    assert [row["ticket"] for row in rows] == [1, 3, 2]


def test_tick_lookup_rejects_future_and_uses_progressive_windows():
    requested = datetime(2026, 7, 31, 23, 59, 59)
    future = SimpleNamespace(time_msc=int((requested.replace(tzinfo=timezone.utc).timestamp() + 1) * 1000), bid=2, ask=2)
    previous = SimpleNamespace(time_msc=int((requested.replace(tzinfo=timezone.utc).timestamp() - 60) * 1000), bid=1, ask=1.1)
    adapter = FakeAdapter({"EURUSD": (future, previous)})
    row = _tick_row(adapter, "EURUSD", requested)
    assert row["source"] == "tick"
    assert row["bid"] == "1"
    assert all(end <= requested.replace(microsecond=0) or end > requested for _, _, end in adapter.calls)


def test_incremental_span_over_31_days_fails_closed(tmp_path):
    export = tmp_path / "ARMIndicator"
    export.mkdir()
    seed = tmp_path / "seed.json"
    seed.write_text('[{"date":"2026-01-01","value":1},{"date":"2026-04-01","value":1}]', encoding="utf-8")
    with pytest.raises(NativeExportError, match="31"):
        incremental_refresh(export, seed, FakeAdapter({}), now=datetime(2026, 8, 1, tzinfo=timezone.utc))
