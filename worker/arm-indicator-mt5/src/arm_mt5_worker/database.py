from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable


SCHEMA = """
PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS snapshots (
  timestamp_utc TEXT PRIMARY KEY, equity REAL NOT NULL, balance REAL NOT NULL,
  credit REAL NOT NULL, profit REAL NOT NULL, margin REAL NOT NULL,
  login INTEGER NOT NULL, server TEXT NOT NULL, collected_at_utc TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS deals (
  ticket INTEGER PRIMARY KEY, time_utc TEXT NOT NULL, time_msc INTEGER NOT NULL,
  type TEXT NOT NULL, entry TEXT NOT NULL, profit REAL NOT NULL,
  commission REAL NOT NULL, swap REAL NOT NULL, fee REAL NOT NULL,
  symbol TEXT NOT NULL, comment TEXT NOT NULL, external_id TEXT NOT NULL,
  position_id INTEGER NOT NULL, magic INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS daily_returns (
  date TEXT PRIMARY KEY, return_pct REAL NOT NULL, equity_close REAL NOT NULL,
  complete INTEGER NOT NULL, calculation_version TEXT NOT NULL,
  calculated_at TEXT NOT NULL, reason TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS worker_state (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS published_payloads (
  date TEXT PRIMARY KEY, payload_hash TEXT NOT NULL, published_at TEXT NOT NULL,
  status TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_snapshots_time ON snapshots(timestamp_utc);
CREATE INDEX IF NOT EXISTS idx_deals_time ON deals(time_utc);
"""


class Database:
    def __init__(self, path: Path) -> None:
        self.path = path
        self.path.parent.mkdir(parents=True, exist_ok=True)

    def connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.path)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys=ON")
        return connection

    def initialize(self) -> None:
        with self.connect() as connection:
            connection.executescript(SCHEMA)

    def insert_snapshot(self, snapshot: dict[str, Any]) -> None:
        with self.connect() as connection:
            connection.execute(
                "INSERT OR REPLACE INTO snapshots VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                tuple(snapshot[key] for key in ("timestamp_utc", "equity", "balance", "credit", "profit", "margin", "login", "server", "collected_at_utc")),
            )

    def insert_deals(self, deals: Iterable[dict[str, Any]]) -> int:
        rows = list(deals)
        with self.connect() as connection:
            connection.executemany(
                "INSERT OR IGNORE INTO deals VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                [tuple(item[key] for key in ("ticket", "time_utc", "time_msc", "type", "entry", "profit", "commission", "swap", "fee", "symbol", "comment", "external_id", "position_id", "magic")) for item in rows],
            )
            return connection.total_changes

    def snapshots(self) -> list[dict[str, Any]]:
        with self.connect() as connection:
            return [dict(row) for row in connection.execute("SELECT * FROM snapshots ORDER BY timestamp_utc")]

    def deals(self) -> list[dict[str, Any]]:
        with self.connect() as connection:
            return [dict(row) for row in connection.execute("SELECT * FROM deals ORDER BY time_msc, ticket")]

    def latest_deal_cursor(self) -> tuple[str | None, int | None]:
        with self.connect() as connection:
            row = connection.execute("SELECT time_utc, ticket FROM deals ORDER BY time_msc DESC, ticket DESC LIMIT 1").fetchone()
            return (row["time_utc"], row["ticket"]) if row else (None, None)

    def upsert_daily_returns(self, returns: Iterable[dict[str, Any]]) -> None:
        with self.connect() as connection:
            connection.executemany(
                "INSERT OR REPLACE INTO daily_returns VALUES (?, ?, ?, ?, ?, ?, ?)",
                [(item["date"], item["return_pct"], item["equity_close"], int(item["complete"]), item["calculation_version"], item["calculated_at"], item.get("reason", "")) for item in returns],
            )

    def daily_returns(self, complete_only: bool = False) -> list[dict[str, Any]]:
        query = "SELECT * FROM daily_returns"
        if complete_only:
            query += " WHERE complete=1"
        query += " ORDER BY date"
        with self.connect() as connection:
            return [dict(row) for row in connection.execute(query)]

    def set_state(self, key: str, value: Any) -> None:
        encoded = json.dumps(value, ensure_ascii=True)
        with self.connect() as connection:
            connection.execute("INSERT OR REPLACE INTO worker_state VALUES (?, ?)", (key, encoded))

    def get_state(self, key: str, default: Any = None) -> Any:
        with self.connect() as connection:
            row = connection.execute("SELECT value FROM worker_state WHERE key=?", (key,)).fetchone()
        return json.loads(row["value"]) if row else default

    def mark_published(self, date: str, payload_hash: str, status: str = "sent") -> None:
        self.set_state("last_successful_publish", {"date": date, "at": datetime.now(timezone.utc).isoformat()})
        with self.connect() as connection:
            connection.execute("INSERT OR REPLACE INTO published_payloads VALUES (?, ?, ?, ?)", (date, payload_hash, datetime.now(timezone.utc).isoformat(), status))
