from pathlib import Path
from types import SimpleNamespace

import pytest

from arm_mt5_worker.mt5_adapter import MT5Adapter, MT5SecurityError


class FakeMT5:
    def __init__(self, trade_allowed=False):
        self.account = SimpleNamespace(login=123, server="Demo", company="Broker", trade_allowed=trade_allowed, equity=100, balance=100, credit=0, profit=0, margin=0)
        self.terminal = SimpleNamespace(connected=True)
        self.shutdown_called = False

    def initialize(self, path): return True
    def terminal_info(self): return self.terminal
    def account_info(self): return self.account
    def shutdown(self): self.shutdown_called = True
    def last_error(self): return "fake"


def terminal(tmp_path):
    path = tmp_path / "terminal64.exe"
    path.write_text("fake")
    return path


def test_identity_allows_read_only_account(tmp_path):
    fake = FakeMT5()
    identity = MT5Adapter(terminal(tmp_path), 123, "Demo", "Broker", fake).connect_read_only()
    assert identity.trade_allowed is False


def test_trade_allowed_fails_closed(tmp_path):
    fake = FakeMT5(trade_allowed=True)
    with pytest.raises(MT5SecurityError, match="trade_allowed=true"):
        MT5Adapter(terminal(tmp_path), 123, "Demo", "Broker", fake).connect_read_only()


@pytest.mark.parametrize("expected_login, expected_server", [(999, "Demo"), (123, "Other")])
def test_wrong_identity_fails_closed(tmp_path, expected_login, expected_server):
    with pytest.raises(MT5SecurityError):
        MT5Adapter(terminal(tmp_path), expected_login, expected_server, "Broker", FakeMT5()).connect_read_only()


def test_disconnected_terminal_fails_closed(tmp_path):
    fake = FakeMT5()
    fake.terminal.connected = False
    with pytest.raises(MT5SecurityError, match="not connected"):
        MT5Adapter(terminal(tmp_path), 123, "Demo", "Broker", fake).connect_read_only()
