from __future__ import annotations

import asyncio
import logging
from collections.abc import Awaitable, Callable

from app.schemas import EventEnvelope


Subscriber = Callable[[EventEnvelope], Awaitable[None]]
logger = logging.getLogger(__name__)


class EventBus:
    def __init__(self) -> None:
        self._subscribers: set[Subscriber] = set()

    def subscribe(self, callback: Subscriber) -> None:
        self._subscribers.add(callback)

    def unsubscribe(self, callback: Subscriber) -> None:
        self._subscribers.discard(callback)

    async def publish(self, event: EventEnvelope) -> None:
        if not self._subscribers:
            return
        subscribers = list(self._subscribers)
        results = await asyncio.gather(*(subscriber(event) for subscriber in subscribers), return_exceptions=True)
        for subscriber, result in zip(subscribers, results):
            if isinstance(result, Exception):
                logger.warning("Removing failed event subscriber: %s", result)
                self.unsubscribe(subscriber)
