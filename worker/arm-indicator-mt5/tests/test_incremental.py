import inspect
from datetime import date, datetime, timezone
from types import SimpleNamespace

import arm_mt5_worker.incremental as incremental
from arm_mt5_worker.incremental import _build_balance_daily_gain, _merge_ticket_rows, _tick_row


class FakeAdapter:
    identity = SimpleNamespace(trade_allowed=False, server="Tickmill-Live")

    def __init__(self, ticks=None):
        self.ticks = ticks or {}
        self.calls = []

    def ticks_get(self, symbol, start, end):
        self.calls.append((symbol, start, end))
        return tuple(self.ticks.get(symbol, ()))


def row(ticket, day, type_name, profit=0, commission=0, swap=0, fee=0):
    return {"ticket": ticket, "time": f"{day} 12:00:00", "time_msc": str(ticket), "type_name": type_name, "entry_name": "DEAL_ENTRY_OUT", "position_id": 0, "volume": 0, "price": 0, "profit": profit, "commission": commission, "swap": swap, "fee": fee, "symbol": ""}


def test_merge_ticket_rows_deduplicates_and_sorts_by_time_msc_then_ticket():
    rows, duplicates = _merge_ticket_rows([{"ticket": 2, "time_msc": 20}, {"ticket": 1, "time_msc": 10}], [{"ticket": 2, "time_msc": 30}, {"ticket": 3, "time_msc": 20}])
    assert duplicates == 1
    assert [item["ticket"] for item in rows] == [1, 3, 2]


def test_tick_lookup_remains_diagnostic_only_and_rejects_future_ticks():
    requested = datetime(2026, 7, 31, 23, 59, 59)
    future = SimpleNamespace(time_msc=int((requested.replace(tzinfo=timezone.utc).timestamp() + 1) * 1000), bid=2, ask=2)
    previous = SimpleNamespace(time_msc=int((requested.replace(tzinfo=timezone.utc).timestamp() - 60) * 1000), bid=1, ask=1.1)
    adapter = FakeAdapter({"EURUSD": (future, previous)})
    result = _tick_row(adapter, "EURUSD", requested)
    assert result["source"] == "tick"
    assert result["bid"] == "1"


def test_balance_daily_gain_excludes_deposits_and_uses_only_closed_balance_changes():
    rows = [row(1, "2026.01.01", "DEAL_TYPE_BALANCE", 1000), row(2, "2026.01.02", "DEAL_TYPE_BUY", 105, commission=-5), row(3, "2026.01.03", "DEAL_TYPE_BALANCE", 1000), row(4, "2026.01.03", "DEAL_TYPE_SELL", 102, commission=-2)]
    result = _build_balance_daily_gain(rows, date(2026, 4, 1))
    by_date = {item["date"]: item["value"] for item in result}
    assert by_date["2026-01-01"] == 0
    assert round(by_date["2026-01-02"], 6) == 10
    assert round(by_date["2026-01-03"], 6) == round((2200 / 2100 - 1) * 100, 6)


def test_production_incremental_path_has_no_floating_equity_valuation():
    source = inspect.getsource(incremental.incremental_refresh)
    assert "_floating" not in source
    assert "_build_balance_daily_gain" in source
    assert incremental.CALCULATION_VERSION == "balance-v2"
