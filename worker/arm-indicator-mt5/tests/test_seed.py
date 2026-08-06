import json
from datetime import date, timedelta

import pytest

from arm_mt5_worker.seed import SeedError, combine_seed_and_live, validate_seed


def make_seed(tmp_path, days=90):
    start = date(2026, 1, 1)
    data = [{"date": (start + timedelta(days=index)).isoformat(), "value": 0.1} for index in range(days)]
    path = tmp_path / "seed.json"
    path.write_text(json.dumps(data), encoding="utf-8")
    return path


def test_seed_requires_ninety_calendar_days(tmp_path):
    assert len(validate_seed(make_seed(tmp_path))) == 90
    short = make_seed(tmp_path, 89)
    with pytest.raises(SeedError): validate_seed(short)


def test_seed_rejects_future_duplicate_and_impossible_value(tmp_path):
    path = make_seed(tmp_path)
    data = json.loads(path.read_text())
    data[1]["date"] = data[0]["date"]
    path.write_text(json.dumps(data))
    with pytest.raises(SeedError): validate_seed(path)


def test_live_series_must_start_after_seed_cutoff(tmp_path):
    seed = validate_seed(make_seed(tmp_path))
    with pytest.raises(SeedError, match="strictly after"):
        combine_seed_and_live(seed, [{"date": seed[-1]["date"], "value": 1}])
