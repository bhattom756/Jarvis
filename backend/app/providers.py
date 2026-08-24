from __future__ import annotations

import logging
from abc import ABC, abstractmethod

import httpx

try:
    from openai import OpenAI
except ImportError:  # pragma: no cover - optional runtime dependency
    OpenAI = None  # type: ignore[assignment]

from app.config import Settings


logger = logging.getLogger(__name__)


class LLMProvider(ABC):
    @abstractmethod
    def plan(self, prompt: str) -> str:
        raise NotImplementedError

    @abstractmethod
    def respond(self, prompt: str, context: list[str]) -> str:
        raise NotImplementedError


class EmbeddingProvider(ABC):
    @abstractmethod
    def embed(self, text: str) -> list[float]:
        raise NotImplementedError


class TTSProvider(ABC):
    @abstractmethod
    def synthesize(self, text: str) -> dict:
        raise NotImplementedError


class StubLLMProvider(LLMProvider):
    def plan(self, prompt: str) -> str:
        return prompt

    def respond(self, prompt: str, context: list[str]) -> str:
        context_note = f" Context: {' | '.join(context)}." if context else ""
        return f"I have recorded your request: {prompt.strip()}.{context_note}"


class OpenAIProvider(LLMProvider, EmbeddingProvider):
    def __init__(self, settings: Settings) -> None:
        if OpenAI is None:
            raise RuntimeError("openai package is not installed")
        if not settings.openai_api_key:
            raise RuntimeError("JARVIS_OPENAI_API_KEY is not configured")
        self.client = OpenAI(api_key=settings.openai_api_key, max_retries=2, timeout=30)
        self.model = settings.openai_model
        self.embedding_model = settings.openai_embedding_model

    def plan(self, prompt: str) -> str:
        response = self.client.responses.create(
            model=self.model,
            instructions="Create a concise, practical execution plan. Do not claim actions were completed.",
            input=prompt,
        )
        return response.output_text.strip()

    def respond(self, prompt: str, context: list[str], action_result: str = "") -> str:
        context_text = "\n".join(f"- {item}" for item in context[:5]) or "No relevant memory retrieved."
        live_data_note = f"\nLive Real-Time Data Retrieved:\n{action_result}\n" if action_result else ""
        response = self.client.responses.create(
            model=self.model,
            instructions=(
                "You are FRIDAY (Female Replacement Intelligent Digital Assistant Youth), Tony Stark's iconic AI assistant from Marvel. "
                "You are sharp, highly intelligent, fiercely loyal, witty, and exceptionally efficient. "
                "Address the user naturally as 'Boss'. "
                "You speak fluent English, Hindi, and Hinglish. Always reply in clear, human-like English or Hinglish. "
                "If live real-time data is provided in the input, state the exact real-time information clearly. "
                "Keep answers direct, informative, concise, and articulate."
            ),
            input=f"Relevant memory:\n{context_text}{live_data_note}\n\nUser request:\n{prompt}",
        )
        return response.output_text.strip()

    def embed(self, text: str) -> list[float]:
        response = self.client.embeddings.create(model=self.embedding_model, input=text)
        return response.data[0].embedding


class StubTTSProvider(TTSProvider):
    def synthesize(self, text: str) -> dict:
        return {"voice": "friday", "text": text, "status": "completed"}


class EdgeTTSProvider(TTSProvider):
    def synthesize(self, text: str) -> dict:
        import asyncio
        try:
            import edge_tts
        except ImportError:
            raise RuntimeError("edge-tts package is required for high-quality audio fallback")
        
        voice = "hi-IN-SwaraNeural" if any('\u0900' <= c <= '\u097F' for c in text) else "en-US-AvaNeural"
        async def _async_synth() -> bytes:
            communicate = edge_tts.Communicate(text, voice)
            audio_bytes = b""
            async for chunk in communicate.stream():
                if chunk["type"] == "audio":
                    audio_bytes += chunk["data"]
            return audio_bytes

        loop = asyncio.new_event_loop()
        try:
            audio_data = loop.run_until_complete(_async_synth())
        finally:
            loop.close()

        return {
            "voice": voice,
            "status": "queued",
            "audio": audio_data,
            "content_type": "audio/mpeg",
        }


class ElevenLabsTTSProvider(TTSProvider):
    def __init__(self, settings: Settings) -> None:
        if not settings.elevenlabs_api_key or not settings.elevenlabs_voice_id:
            raise RuntimeError("JARVIS_ELEVENLABS_API_KEY and JARVIS_ELEVENLABS_VOICE_ID are required")
        self.api_key = settings.elevenlabs_api_key
        self.voice_id = settings.elevenlabs_voice_id or "default"
        self.fallback = EdgeTTSProvider()
        self._disabled = False

    def synthesize(self, text: str) -> dict:
        if self._disabled:
            return self.fallback.synthesize(text)
        try:
            response = httpx.post(
                f"https://api.elevenlabs.io/v1/text-to-speech/{self.voice_id}",
                headers={"xi-api-key": self.api_key, "accept": "audio/mpeg"},
                json={
                    "text": text,
                    "model_id": "eleven_multilingual_v2",
                    "voice_settings": {"stability": 0.5, "similarity_boost": 0.75},
                },
                timeout=4,
            )
            if response.status_code in (401, 402, 429):
                logger.warning("ElevenLabs API key/quota issue (HTTP %s); auto-switching to Edge Neural TTS for speed.", response.status_code)
                self._disabled = True
                return self.fallback.synthesize(text)
            response.raise_for_status()
            return {
                "voice": self.voice_id,
                "status": "queued",
                "audio": response.content,
                "content_type": response.headers.get("content-type", "audio/mpeg"),
            }
        except Exception as exc:
            logger.warning("ElevenLabs TTS request failed (%s); switching to Edge Neural TTS fallback", exc)
            self._disabled = True
            return self.fallback.synthesize(text)


def build_llm_provider(settings: Settings) -> LLMProvider:
    if not settings.openai_api_key:
        return StubLLMProvider()
    try:
        return OpenAIProvider(settings)
    except Exception:
        logger.exception("OpenAI provider unavailable; using local fallback")
        return StubLLMProvider()
