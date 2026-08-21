from __future__ import annotations

import json
import sqlite3
from pathlib import Path
from typing import Any


class SQLiteStore:
    def __init__(self, path: Path) -> None:
        self.path = path
        self._init_db()

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.path)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_db(self) -> None:
        with self._connect() as conn:
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS conversations (
                    id TEXT PRIMARY KEY,
                    role TEXT NOT NULL,
                    content TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS tasks (
                    id TEXT PRIMARY KEY,
                    title TEXT NOT NULL,
                    status TEXT NOT NULL,
                    detail TEXT,
                    created_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS actions (
                    id TEXT PRIMARY KEY,
                    category TEXT NOT NULL,
                    summary TEXT NOT NULL,
                    detail TEXT,
                    created_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS reminders (
                    id TEXT PRIMARY KEY,
                    summary TEXT NOT NULL,
                    due_at TEXT,
                    created_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS connector_events (
                    id TEXT PRIMARY KEY,
                    source TEXT NOT NULL,
                    severity TEXT NOT NULL,
                    summary TEXT NOT NULL,
                    detail TEXT,
                    created_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS confirmations (
                    id TEXT PRIMARY KEY,
                    category TEXT NOT NULL,
                    risk_level TEXT NOT NULL,
                    summary TEXT NOT NULL,
                    reversible INTEGER NOT NULL,
                    expires_at TEXT,
                    status TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS system_status_snapshots (
                    id TEXT PRIMARY KEY,
                    payload TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );
                """
            )

    def insert(self, table: str, record: dict[str, Any]) -> None:
        columns = ", ".join(record.keys())
        placeholders = ", ".join("?" for _ in record)
        with self._connect() as conn:
            conn.execute(
                f"INSERT OR REPLACE INTO {table} ({columns}) VALUES ({placeholders})",
                tuple(json.dumps(v) if isinstance(v, (dict, list)) else v for v in record.values()),
            )

    def list_recent(self, table: str, limit: int = 20) -> list[dict[str, Any]]:
        with self._connect() as conn:
            rows = conn.execute(
                f"SELECT * FROM {table} ORDER BY created_at DESC LIMIT ?",
                (limit,),
            ).fetchall()
        return [dict(row) for row in rows]

