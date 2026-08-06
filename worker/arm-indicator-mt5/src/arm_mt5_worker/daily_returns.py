from __future__ import annotations

from datetime import datetime, time, timedelta, timezone
from math import prod
from zoneinfo import ZoneInfo

from .deals import CashflowPolicyError, classify_deals


VERSION = "mt5-segment-v1"


def _day_close(day: str, timezone_name: str, close_time: str) -> datetime:
    year, month, date = (int(value) for value in day.split("-"))
    hour, minute, second = (int(value) for value in close_time.split(":")[:3])
    return datetime(year, month, date, hour, minute, second, tzinfo=ZoneInfo(timezone_name)).astimezone(timezone.utc)


def _local_day(value: str, timezone_name: str) -> str:
    return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(ZoneInfo(timezone_name)).date().isoformat()


def _closest_close(snapshots: list[dict], day: str, timezone_name: str, close_time: str, tolerance: int) -> dict | None:
    close = _day_close(day, timezone_name, close_time)
    candidates = []
    for item in snapshots:
        timestamp = datetime.fromisoformat(item["timestamp_utc"].replace("Z", "+00:00"))
        delta = abs((timestamp - close).total_seconds())
        if delta <= tolerance:
            candidates.append((delta, item))
    return min(candidates, key=lambda pair: pair[0])[1] if candidates else None


def _segment_return(start: float, end: float) -> float:
    if start <= 0:
        raise ValueError("equity must be positive")
    return end / start - 1


def calculate_daily_returns(snapshots: list[dict], deals: list[dict], timezone_name: str, close_time: str, close_tolerance: int, flow_gap: int, policy: dict[str, str], now: datetime | None = None) -> list[dict]:
    ZoneInfo(timezone_name)
    now = now or datetime.now(timezone.utc)
    days = sorted({_local_day(item["timestamp_utc"], timezone_name) for item in snapshots})
    by_day = {day: [item for item in snapshots if _local_day(item["timestamp_utc"], timezone_name) == day] for day in days}
    try:
        flows, _ = classify_deals(deals, policy)
    except CashflowPolicyError:
        raise
    flows_by_day: dict[str, list[dict]] = {}
    for deal in flows:
        flows_by_day.setdefault(_local_day(deal["time_utc"], timezone_name), []).append(deal)
    results: list[dict] = []
    previous_close: dict | None = None
    ordered_snapshots = sorted(snapshots, key=lambda item: item["timestamp_utc"])
    for day in days:
        close = _closest_close(by_day[day], day, timezone_name, close_time, close_tolerance)
        reason = ""
        value = 0.0
        complete = close is not None
        if close is None:
            reason = "missing close snapshot"
        elif previous_close is None:
            reason = "missing previous close snapshot"
            complete = False
        else:
            day_flows = sorted(flows_by_day.get(day, []), key=lambda item: item["time_msc"])
            start_equity = float(previous_close["equity"])
            segments: list[float] = []
            for flow in day_flows:
                flow_time = datetime.fromisoformat(flow["time_utc"].replace("Z", "+00:00"))
                before = [item for item in ordered_snapshots if datetime.fromisoformat(item["timestamp_utc"].replace("Z", "+00:00")) < flow_time]
                after = [item for item in ordered_snapshots if datetime.fromisoformat(item["timestamp_utc"].replace("Z", "+00:00")) >= flow_time]
                pre = before[-1] if before else None
                post = after[0] if after else None
                if not pre or not post:
                    complete = False; reason = "missing pre/post flow snapshot"; break
                pre_time = datetime.fromisoformat(pre["timestamp_utc"].replace("Z", "+00:00"))
                post_time = datetime.fromisoformat(post["timestamp_utc"].replace("Z", "+00:00"))
                if (flow_time - pre_time).total_seconds() > flow_gap or (post_time - flow_time).total_seconds() > flow_gap:
                    complete = False; reason = "flow snapshot gap exceeds tolerance"; break
                segments.append(_segment_return(start_equity, float(pre["equity"])))
                start_equity = float(post["equity"])
            if complete:
                segments.append(_segment_return(start_equity, float(close["equity"])))
                value = (prod(1 + segment for segment in segments) - 1) * 100
        close_time_utc = _day_close(day, timezone_name, close_time)
        if close_time_utc + timedelta(minutes=1) > now:
            complete = False; reason = "current day is not complete"
        results.append({"date": day, "return_pct": round(value, 8), "equity_close": float(close["equity"]) if close else 0.0, "complete": complete, "calculation_version": VERSION, "calculated_at": datetime.now(timezone.utc).isoformat(), "reason": reason})
        if close:
            previous_close = close
    return results
