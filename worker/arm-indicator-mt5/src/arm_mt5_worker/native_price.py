from __future__ import annotations

from datetime import datetime, timedelta


LOOKBACK_MINUTES = (15, 120, 720, 2160, 4320, 7200, 10080)


def select_previous_tick(requested: datetime, ticks: list[tuple[datetime, float, float]]) -> tuple[datetime, float, float] | None:
    """Reference model for the MQL5 progressive previous-tick lookup."""
    for minutes in LOOKBACK_MINUTES:
        start = requested - timedelta(minutes=minutes)
        candidates = [tick for tick in ticks if start <= tick[0] <= requested and (tick[1] > 0 or tick[2] > 0)]
        if candidates:
            return max(candidates, key=lambda tick: tick[0])
    return None
