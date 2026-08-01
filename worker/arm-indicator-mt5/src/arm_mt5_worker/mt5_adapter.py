from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any


class MT5SecurityError(RuntimeError):
    pass


@dataclass(frozen=True)
class Identity:
    login: int
    server: str
    company: str | None
    trade_allowed: bool


class MT5Adapter:
    def __init__(self, terminal_path: Path, expected_login: int, expected_server: str, expected_company: str | None = None, mt5_module: Any = None) -> None:
        self.terminal_path = terminal_path
        self.expected_login = expected_login
        self.expected_server = expected_server
        self.expected_company = expected_company
        self.mt5 = mt5_module
        self.identity: Identity | None = None

    def _module(self) -> Any:
        if self.mt5 is None:
            try:
                import MetaTrader5 as module
            except ImportError as exc:
                raise MT5SecurityError("MetaTrader5 package is not installed") from exc
            self.mt5 = module
        return self.mt5

    def connect_read_only(self) -> Identity:
        mt5 = self._module()
        if not self.terminal_path.exists():
            raise MT5SecurityError(f"MT5 terminal path does not exist: {self.terminal_path}")
        if not mt5.initialize(path=str(self.terminal_path)):
            raise MT5SecurityError(f"MT5 initialize failed: {mt5.last_error()}")
        terminal = mt5.terminal_info()
        account = mt5.account_info()
        if terminal is None or account is None or getattr(terminal, "connected", False) is not True:
            self.close()
            raise MT5SecurityError("MT5 terminal is not connected")
        identity = Identity(int(account.login), str(account.server), getattr(account, "company", None), bool(getattr(account, "trade_allowed", False)))
        if identity.login != self.expected_login:
            self.close()
            raise MT5SecurityError("MT5 account login does not match expected login")
        if identity.server != self.expected_server:
            self.close()
            raise MT5SecurityError("MT5 server does not match expected server")
        if self.expected_company and identity.company and identity.company != self.expected_company:
            self.close()
            raise MT5SecurityError("MT5 company does not match expected company")
        if identity.trade_allowed:
            self.close()
            raise MT5SecurityError("CRITICAL SECURITY FAILURE: trade_allowed=true")
        self.identity = identity
        return identity

    def close(self) -> None:
        if self.mt5 is not None:
            self.mt5.shutdown()
        self.identity = None

    def account_info(self) -> Any:
        return self._module().account_info()

    def terminal_info(self) -> Any:
        return self._module().terminal_info()

    def history_deals_get(self, start: datetime, end: datetime) -> tuple[Any, ...]:
        result = self._module().history_deals_get(start, end)
        if result is None:
            raise RuntimeError(f"history_deals_get failed: {self._module().last_error()}")
        return tuple(result)

    def history_orders_get(self, start: datetime, end: datetime) -> tuple[Any, ...]:
        result = self._module().history_orders_get(start, end)
        if result is None:
            raise RuntimeError(f"history_orders_get failed: {self._module().last_error()}")
        return tuple(result)

    def ticks_get(self, symbol: str, start: datetime, end: datetime) -> tuple[Any, ...]:
        mt5 = self._module()
        copy_ticks_range = getattr(mt5, "copy_ticks_range", None)
        copy_ticks_all = getattr(mt5, "COPY_TICKS_ALL", 0)
        if copy_ticks_range is None:
            raise RuntimeError("copy_ticks_range is unavailable")
        result = copy_ticks_range(symbol, start, end, copy_ticks_all)
        if result is None:
            raise RuntimeError(f"copy_ticks_range failed for {symbol}: {mt5.last_error()}")
        return tuple(result)

    def deal_type_name(self, value: int) -> str:
        mt5 = self._module()
        names = {getattr(mt5, name): name.removeprefix("DEAL_TYPE_") for name in dir(mt5) if name.startswith("DEAL_TYPE_")}
        return names.get(value, f"UNKNOWN_{value}")

    def deal_entry_name(self, value: int) -> str:
        mt5 = self._module()
        names = {getattr(mt5, name): name.removeprefix("DEAL_ENTRY_") for name in dir(mt5) if name.startswith("DEAL_ENTRY_")}
        return names.get(value, f"UNKNOWN_{value}")
