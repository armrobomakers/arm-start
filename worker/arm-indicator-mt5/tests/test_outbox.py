from arm_mt5_worker.outbox import pending_payloads, queue_payload, replay_oldest


def test_outbox_replays_oldest_and_removes_sent(tmp_path):
    queue_payload(tmp_path, {"dailyGain": [{"date": "2026-01-01", "value": 1}]})
    queue_payload(tmp_path, {"dailyGain": [{"date": "2026-01-02", "value": 2}]})
    sent = []
    assert replay_oldest(tmp_path, sent.append) == 2
    assert [item["dailyGain"][0]["value"] for item in sent] == [1, 2]
    assert pending_payloads(tmp_path) == []
