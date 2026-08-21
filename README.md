# JARVIS V1

JARVIS is a Windows-first personal AI assistant built as a two-process system:

- `desktop/`: Electron + React + TypeScript operator UI
- `backend/`: FastAPI orchestration service
- `shared/`: cross-process event contracts and schemas
- `data/`: runtime persistence and logs

## Status

This repository provides a local integrated foundation:

- shared websocket event protocol
- backend orchestration, memory/logging, monitoring, planning, and action guardrails
- desktop dashboard, floating HUD, tray integration, and operator controls
- a root `.env` template at `.env.example`

External integrations are optional and fall back safely when they are not configured:

- Faster-Whisper speech integration
- ElevenLabs TTS
- OpenAI planning and response generation
- Playwright browser automation
- Qdrant semantic memory
- IMAP unread-email monitoring (read-only)

## Structure

```text
backend/
desktop/
shared/
data/
```

## Run JARVIS

```powershell
python -m pip install -e backend[dev]
python -m uvicorn app.main:app --reload --app-dir backend
```

## Desktop setup

```powershell
cd desktop
npm install
npm run dev
```

Start the Electron desktop in a second PowerShell window. The desktop reconnects automatically to `http://127.0.0.1:8000` and restores its last dashboard state.

```powershell
cd desktop
npm run dev
```

Copy `.env.example` to `.env` when starting from a clean checkout, then add only the provider credentials you want to enable. The assistant uses local fallbacks for unset provider credentials. Faster-Whisper downloads the selected speech model on its first microphone-enabled startup.

Runtime logs are written to `data/runtime/logs/jarvis.log`; SQLite state is stored in `data/runtime/jarvis.db`.
