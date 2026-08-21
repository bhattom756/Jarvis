from pathlib import Path
from typing import Literal
from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


ROOT_DIR = Path(__file__).resolve().parents[2]
DATA_DIR = ROOT_DIR / "data" / "runtime"
LOG_DIR = DATA_DIR / "logs"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=ROOT_DIR / ".env", env_prefix="JARVIS_", extra="ignore")

    app_name: str = "JARVIS"
    backend_host: str = "127.0.0.1"
    backend_port: int = 8000
    log_level: str = "INFO"
    desktop_ws_path: str = "/ws/desktop"
    sqlite_path: Path = Field(default=DATA_DIR / "jarvis.db")
    qdrant_url: str = "http://127.0.0.1:6333"
    qdrant_collection: str = "jarvis_memory"
    qdrant_api_key: str | None = None
    openai_api_key: str | None = None
    openai_model: str = "gpt-4.1-mini"
    openai_embedding_model: str = "text-embedding-3-small"
    elevenlabs_api_key: str | None = None
    elevenlabs_voice_id: str | None = None
    enable_microphone: bool = True
    microphone_device: str | int | None = None
    microphone_sample_rate: int = 16000
    microphone_channels: int = 1
    microphone_block_duration_ms: int = 100
    speech_model: str = "base.en"
    speech_device: Literal["auto", "cpu", "cuda"] = "auto"
    speech_compute_type: str = "int8"
    speech_language: str = "en"
    speech_vad_threshold: float = 0.012
    speech_silence_duration_ms: int = 900
    speech_min_utterance_ms: int = 350
    enable_monitoring: bool = True
    enable_browser_actions: bool = True
    enable_windows_actions: bool = True
    enable_qdrant: bool = False
    proactive_interval_seconds: int = 180
    transcript_idle_ms: int = 1400
    browser_headless: bool = False
    browser_session_dir: Path = Field(default=DATA_DIR / "browser-profile")
    email_imap_host: str | None = None
    email_imap_port: int = 993
    email_imap_username: str | None = None
    email_imap_password: str | None = None
    email_imap_folder: str = "INBOX"
    enable_email_connector: bool = False
    email_smtp_host: str | None = None
    email_smtp_port: int = 465
    email_smtp_username: str | None = None
    email_smtp_password: str | None = None
    email_from_address: str | None = None
    email_smtp_use_ssl: bool = True
    email_max_attachment_bytes: int = 20_000_000
    approved_write_roots: list[str] = Field(default_factory=lambda: [str(ROOT_DIR / "data")])

    @field_validator("microphone_device", mode="before")
    @classmethod
    def normalize_microphone_device(cls, value: object) -> object:
        return None if value == "" else value

    def ensure_directories(self) -> None:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        LOG_DIR.mkdir(parents=True, exist_ok=True)
        self.browser_session_dir.mkdir(parents=True, exist_ok=True)
        self.sqlite_path.parent.mkdir(parents=True, exist_ok=True)


settings = Settings()
settings.ensure_directories()
