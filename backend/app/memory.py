from __future__ import annotations

import logging
from abc import ABC, abstractmethod
from datetime import datetime, timezone
from uuid import uuid4

try:
    from qdrant_client import QdrantClient
    from qdrant_client.models import Distance, PointStruct, VectorParams
except ImportError:  # pragma: no cover - optional runtime dependency
    QdrantClient = None  # type: ignore[assignment]
    Distance = PointStruct = VectorParams = None  # type: ignore[assignment]

from app.config import Settings
from app.providers import EmbeddingProvider


logger = logging.getLogger(__name__)


class MemoryStore(ABC):
    @abstractmethod
    def retrieve(self, query: str, limit: int = 5) -> list[str]:
        raise NotImplementedError

    @abstractmethod
    def remember(self, scope: str, summary: str, items: list[str]) -> None:
        raise NotImplementedError


class NullMemoryStore(MemoryStore):
    def __init__(self) -> None:
        self._memories: list[str] = []

    def retrieve(self, query: str, limit: int = 5) -> list[str]:
        terms = set(query.lower().split())
        ranked = sorted(
            self._memories,
            key=lambda item: len(terms.intersection(item.lower().split())),
            reverse=True,
        )
        return [item for item in ranked if item][:limit]

    def remember(self, scope: str, summary: str, items: list[str]) -> None:
        self._memories.extend([summary, *items])


class QdrantMemoryStore(MemoryStore):
    def __init__(self, settings: Settings, embedder: EmbeddingProvider) -> None:
        if QdrantClient is None:
            raise RuntimeError("qdrant-client package is not installed")
        self.settings = settings
        self.embedder = embedder
        self.client = QdrantClient(url=settings.qdrant_url, api_key=settings.qdrant_api_key)
        self._ensure_collection()

    def _ensure_collection(self) -> None:
        vector_size = len(self.embedder.embed("JARVIS memory collection probe"))
        if self.client.collection_exists(self.settings.qdrant_collection):
            return
        self.client.create_collection(
            collection_name=self.settings.qdrant_collection,
            vectors_config=VectorParams(size=vector_size, distance=Distance.COSINE),
        )

    def retrieve(self, query: str, limit: int = 5) -> list[str]:
        try:
            result = self.client.query_points(
                collection_name=self.settings.qdrant_collection,
                query=self.embedder.embed(query),
                limit=limit,
                with_payload=True,
            )
            return [str(point.payload.get("summary", "")) for point in result.points if point.payload]
        except Exception:
            logger.exception("Qdrant retrieval failed")
            return []

    def remember(self, scope: str, summary: str, items: list[str]) -> None:
        payload = {
            "scope": scope,
            "summary": summary,
            "items": items,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        try:
            self.client.upsert(
                collection_name=self.settings.qdrant_collection,
                points=[PointStruct(id=str(uuid4()), vector=self.embedder.embed(summary), payload=payload)],
            )
        except Exception:
            logger.exception("Qdrant memory write failed")
