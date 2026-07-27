from arm_mt5_worker.database import Database


def row(ticket):
    return {"ticket": ticket, "time_utc": "2026-01-01T00:00:00+00:00", "time_msc": ticket, "type": "BUY", "entry": "IN", "profit": 1, "commission": 0, "swap": 0, "fee": 0, "symbol": "EURUSD", "comment": "", "external_id": "", "position_id": 0, "magic": 0}


def test_duplicate_deals_are_deduplicated(tmp_path):
    database = Database(tmp_path / "data.db")
    database.initialize()
    assert database.insert_deals([row(1), row(1), row(2)]) == 2
    assert [item["ticket"] for item in database.deals()] == [1, 2]
