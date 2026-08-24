from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlparse
from uuid import uuid4

try:
    from pymongo import ASCENDING, DESCENDING, MongoClient
except ImportError:  # pragma: no cover - optional runtime dependency
    ASCENDING = DESCENDING = MongoClient = None  # type: ignore[assignment]


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
                CREATE TABLE IF NOT EXISTS conversation_sessions (
                    id TEXT PRIMARY KEY,
                    title TEXT NOT NULL,
                    preview TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    message_count INTEGER NOT NULL DEFAULT 0
                );
                CREATE TABLE IF NOT EXISTS conversation_messages (
                    id TEXT PRIMARY KEY,
                    conversation_id TEXT NOT NULL,
                    role TEXT NOT NULL,
                    content TEXT NOT NULL,
                    source TEXT NOT NULL,
                    status TEXT,
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


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class SQLiteConversationStore:
    def __init__(self, path: Path) -> None:
        self.path = path

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.path)
        conn.row_factory = sqlite3.Row
        return conn

    def start_session(self, title: str = "New conversation") -> dict[str, Any]:
        now = _utc_now_iso()
        record = {
            "id": str(uuid4()),
            "title": title,
            "preview": None,
            "created_at": now,
            "updated_at": now,
            "message_count": 0,
        }
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO conversation_sessions (id, title, preview, created_at, updated_at, message_count)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                tuple(record.values()),
            )
        return record

    def append_message(
        self,
        conversation_id: str,
        role: str,
        content: str,
        source: str = "system",
        status: str | None = None,
        created_at: str | None = None,
    ) -> dict[str, Any]:
        timestamp = created_at or _utc_now_iso()
        message = {
            "id": str(uuid4()),
            "conversation_id": conversation_id,
            "role": role,
            "content": content,
            "source": source,
            "status": status,
            "created_at": timestamp,
        }
        preview = content[:160]
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO conversation_messages (id, conversation_id, role, content, source, status, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                tuple(message.values()),
            )
            current = conn.execute(
                "SELECT title, message_count FROM conversation_sessions WHERE id = ?",
                (conversation_id,),
            ).fetchone()
            title = current["title"] if current else "New conversation"
            if role == "user" and title == "New conversation":
                title = content[:48].strip() or title
            conn.execute(
                """
                UPDATE conversation_sessions
                SET title = ?, preview = ?, updated_at = ?, message_count = message_count + 1
                WHERE id = ?
                """,
                (title, preview, timestamp, conversation_id),
            )
        return message

    def list_sessions(self, limit: int = 30) -> list[dict[str, Any]]:
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT id, title, preview, created_at, updated_at, message_count
                FROM conversation_sessions
                ORDER BY updated_at DESC
                LIMIT ?
                """,
                (limit,),
            ).fetchall()
        return [dict(row) for row in rows]

    def list_messages(self, conversation_id: str, limit: int = 250) -> list[dict[str, Any]]:
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT id, conversation_id, role, content, source, status, created_at
                FROM conversation_messages
                WHERE conversation_id = ?
                ORDER BY created_at ASC
                LIMIT ?
                """,
                (conversation_id, limit),
            ).fetchall()
        return [dict(row) for row in rows]


class MongoConversationStore:
    def __init__(self, uri: str) -> None:
        if MongoClient is None:
            raise RuntimeError("pymongo is not installed")
        database_name = urlparse(uri).path.lstrip("/") or "jarvis"
        self.client = MongoClient(uri, serverSelectionTimeoutMS=3_000)
        self.client.admin.command("ping")
        self.database = self.client[database_name]
        self.sessions = self.database["conversation_sessions"]
        self.messages = self.database["conversation_messages"]
        self.sessions.create_index([("updated_at", DESCENDING)])
        self.messages.create_index([("conversation_id", ASCENDING), ("created_at", ASCENDING)])

    def start_session(self, title: str = "New conversation") -> dict[str, Any]:
        now = _utc_now_iso()
        record = {
            "id": str(uuid4()),
            "title": title,
            "preview": None,
            "created_at": now,
            "updated_at": now,
            "message_count": 0,
        }
        self.sessions.insert_one(record)
        return record

    def append_message(
        self,
        conversation_id: str,
        role: str,
        content: str,
        source: str = "system",
        status: str | None = None,
        created_at: str | None = None,
    ) -> dict[str, Any]:
        timestamp = created_at or _utc_now_iso()
        message = {
            "id": str(uuid4()),
            "conversation_id": conversation_id,
            "role": role,
            "content": content,
            "source": source,
            "status": status,
            "created_at": timestamp,
        }
        self.messages.insert_one(message)
        session = self.sessions.find_one({"id": conversation_id}, {"title": 1, "_id": 0}) or {"title": "New conversation"}
        title = session["title"]
        if role == "user" and title == "New conversation":
            title = content[:48].strip() or title
        self.sessions.update_one(
            {"id": conversation_id},
            {
                "$set": {"updated_at": timestamp, "preview": content[:160], "title": title},
                "$inc": {"message_count": 1},
            },
        )
        return message

    def list_sessions(self, limit: int = 30) -> list[dict[str, Any]]:
        return list(self.sessions.find({}, {"_id": 0}).sort("updated_at", DESCENDING).limit(limit))

    def list_messages(self, conversation_id: str, limit: int = 250) -> list[dict[str, Any]]:
        return list(
            self.messages.find({"conversation_id": conversation_id}, {"_id": 0}).sort("created_at", ASCENDING).limit(limit)
        )
