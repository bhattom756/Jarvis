from __future__ import annotations

import logging
import queue
import threading
import time
from dataclasses import dataclass, field
from typing import Callable

import numpy as np

try:
    import sounddevice as sd
except ImportError:  # pragma: no cover - optional runtime dependency
    sd = None  # type: ignore[assignment]

try:
    from faster_whisper import WhisperModel
except ImportError:  # pragma: no cover - optional runtime dependency
    WhisperModel = None  # type: ignore[assignment]

from app.config import Settings, settings as default_settings
from app.schemas import TranscriptPayload


logger = logging.getLogger(__name__)
TranscriptHandler = Callable[[str], None]
SpeechActivityHandler = Callable[[], None]


@dataclass
class RollingTranscriptBuffer:
    segments: list[str] = field(default_factory=list)

    def push(self, text: str, is_final: bool | None = None, source: str = "microphone") -> TranscriptPayload:
        cleaned = text.strip()
        if cleaned:
            self.segments.append(cleaned)
        final = cleaned.endswith((".", "!", "?")) if is_final is None else is_final
        return TranscriptPayload(text=cleaned, is_final=final, source=source)

    def consume_final_utterance(self) -> str:
        utterance = " ".join(self.segments).strip()
        self.segments.clear()
        return utterance


class SpeechEngine:
    """Continuously captures microphone audio and emits completed utterances.

    The audio callback only copies frames into a queue. Transcription happens on a
    worker thread so PortAudio is never blocked by model inference.
    """

    def __init__(
        self,
        settings: Settings | None = None,
        on_utterance: TranscriptHandler | None = None,
        on_speech_started: SpeechActivityHandler | None = None,
    ) -> None:
        self.settings = settings or default_settings
        self.buffer = RollingTranscriptBuffer()
        self.on_utterance = on_utterance
        self.on_speech_started = on_speech_started
        self._audio_queue: queue.Queue[np.ndarray | None] = queue.Queue(maxsize=300)
        self._stop_event = threading.Event()
        self._stream: object | None = None
        self._worker: threading.Thread | None = None
        self._model: object | None = None
        self._status = "disabled" if not self.settings.enable_microphone else "ready"
        self._last_error: str | None = None

    @property
    def status(self) -> str:
        return self._status

    @property
    def last_error(self) -> str | None:
        return self._last_error

    def set_handler(self, handler: TranscriptHandler) -> None:
        self.on_utterance = handler

    def set_speech_started_handler(self, handler: SpeechActivityHandler) -> None:
        self.on_speech_started = handler

    def start(self) -> None:
        if not self.settings.enable_microphone or self._stream is not None:
            return
        if sd is None or WhisperModel is None:
            self._status = "unavailable"
            self._last_error = "Install sounddevice and faster-whisper to enable microphone capture."
            logger.warning(self._last_error)
            return
        try:
            self._model = WhisperModel(
                self.settings.speech_model,
                device=self.settings.speech_device,
                compute_type=self.settings.speech_compute_type,
            )
            blocksize = int(self.settings.microphone_sample_rate * self.settings.microphone_block_duration_ms / 1000)
            self._stop_event.clear()
            self._worker = threading.Thread(target=self._transcription_loop, name="jarvis-transcription", daemon=True)
            self._worker.start()
            self._stream = sd.InputStream(
                samplerate=self.settings.microphone_sample_rate,
                channels=self.settings.microphone_channels,
                dtype="float32",
                blocksize=blocksize,
                device=self.settings.microphone_device,
                callback=self._audio_callback,
            )
            self._stream.start()
            self._status = "listening"
            self._last_error = None
            logger.info("Microphone capture started")
        except Exception as exc:
            self._status = "error"
            self._last_error = str(exc)
            logger.exception("Unable to start microphone capture")
            self.stop()

    def stop(self) -> None:
        self._stop_event.set()
        try:
            self._audio_queue.put_nowait(None)
        except queue.Full:
            pass
        if self._stream is not None:
            try:
                self._stream.stop()
                self._stream.close()
            except Exception:
                logger.debug("Microphone stream cleanup failed", exc_info=True)
        self._stream = None
        if self._worker and self._worker.is_alive() and self._worker is not threading.current_thread():
            self._worker.join(timeout=3)
        self._worker = None
        if self._status != "error":
            self._status = "stopped"

    def ingest_text(self, text: str) -> TranscriptPayload:
        return self.buffer.push(text, source="manual")

    def consume_if_final(self, payload: TranscriptPayload) -> str | None:
        return self.buffer.consume_final_utterance() if payload.is_final else None

    def _audio_callback(self, indata: np.ndarray, frames: int, time_info: object, status: object) -> None:
        if status:
            logger.debug("Microphone status: %s", status)
        try:
            self._audio_queue.put_nowait(indata.copy().reshape(-1))
        except queue.Full:
            try:
                self._audio_queue.get_nowait()
                self._audio_queue.put_nowait(indata.copy().reshape(-1))
            except Exception:
                pass

    def _transcription_loop(self) -> None:
        active_chunks: list[np.ndarray] = []
        silence_started: float | None = None
        speech_started_at: float | None = None
        activity_reported = False
        min_samples = int(self.settings.microphone_sample_rate * self.settings.speech_min_utterance_ms / 1000)
        silence_seconds = self.settings.speech_silence_duration_ms / 1000
        while not self._stop_event.is_set():
            try:
                chunk = self._audio_queue.get(timeout=0.25)
            except queue.Empty:
                continue
            if chunk is None:
                break
            rms = float(np.sqrt(np.mean(np.square(chunk)))) if chunk.size else 0.0
            if rms >= self.settings.speech_vad_threshold:
                active_chunks.append(chunk)
                silence_started = None
                if speech_started_at is None:
                    speech_started_at = time.monotonic()
                if (
                    not activity_reported
                    and self.on_speech_started is not None
                    and (time.monotonic() - speech_started_at) * 1000 >= self.settings.speech_barge_in_min_duration_ms
                ):
                    activity_reported = True
                    self.on_speech_started()
                continue
            if active_chunks:
                silence_started = silence_started or time.monotonic()
                if time.monotonic() - silence_started >= silence_seconds:
                    audio = np.concatenate(active_chunks)
                    active_chunks.clear()
                    silence_started = None
                    speech_started_at = None
                    activity_reported = False
                    if audio.size >= min_samples:
                        self._transcribe(audio)

    def _transcribe(self, audio: np.ndarray) -> None:
        if self._model is None:
            return
        try:
            lang = None if self.settings.speech_language in (None, "", "auto", "multilingual") else self.settings.speech_language
            segments, _ = self._model.transcribe(
                audio,
                language=lang,
                beam_size=3,
                vad_filter=True,
                initial_prompt="Friday AI assistant conversation in English and Hindi.",
                condition_on_previous_text=False,
            )
            text = " ".join(segment.text.strip() for segment in segments).strip()
            # Filter out common Whisper noise hallucinations
            noise_hallucinations = {"ah.", "right it.", "take it.", "you", "thank you.", "subtitles", "subtitle by", "the end.", "subscribe"}
            if text and text.lower() not in noise_hallucinations and len(text) >= 3 and self.on_utterance:
                self.on_utterance(text)
        except Exception as exc:
            self._last_error = str(exc)
            self._status = "error"
            logger.exception("Faster-Whisper transcription failed")
