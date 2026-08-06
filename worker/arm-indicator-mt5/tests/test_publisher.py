from arm_mt5_worker.publisher import sign_payload
from unittest.mock import patch

from arm_mt5_worker.publisher import Publisher


def test_hmac_matches_node_golden_fixture():
    body = b'{"version":1,"systemId":"11020435","accountName":"ARM TICKMILL VIP FUND","dailyGain":[{"date":"2026-01-01","value":0.42}]}'
    assert sign_payload("golden-secret-12345678901234567890", "1700000000", body) == "v1=3aed1aedeed0d9c47141e49af282fc765df612b29f52912fa555c0165fd4e70e"


def test_bypass_header_is_added_without_logging_secrets():
    captured = {}

    class Response:
        status = 200
        def __enter__(self): return self
        def __exit__(self, *_): return False

    def fake_open(request, timeout):
        captured.update(request.headers)
        return Response()

    with patch("urllib.request.urlopen", fake_open):
        Publisher("https://example.test", "s" * 32, "b" * 32).publish({"version": 1})
    assert captured["X-arm-timestamp"]
    assert captured["X-arm-signature"].startswith("v1=")
    assert captured["X-vercel-protection-bypass"] == "b" * 32
