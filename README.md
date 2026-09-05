# JARVIS Monorepo

JARVIS is a Windows-first personal AI assistant built as a modular monorepo workspace:

- `apps/desktop`: Electron + React + TypeScript operator UI with floating HUD and tray controls
- `apps/mobile`: Expo SDK 57 React Native mobile shell and device capability agent
- `services/core`: TypeScript Fastify core orchestration and WebSocket service
- `packages/*`: Shared contracts (`protocol`, `shared-types`, `api-client`, `errors`, `logger`, `security`)
- `agents/*`: Device agent shells (`windows-agent`, `mobile-agent`)

## Development & Running Services

Run each service directly from its respective directory:

### 1. Core Backend (`services/core`)
Open terminal in `services/core`:
```powershell
cd services/core
npm run dev
```

### 2. Desktop App (`apps/desktop`)
Open terminal in `apps/desktop`:
```powershell
cd apps/desktop
npm run dev
```

### 3. Mobile App (`apps/mobile`)
Open terminal in `apps/mobile`:
```powershell
cd apps/mobile
npm run start
```

## Workspace Commands (Root)

From the workspace root:

```powershell
# Install dependencies across all workspace packages
npm install

# Run TypeScript typechecks across all packages
npm run typecheck

# Run test suites
npm test
```

## Configuration & Runtime State

1. Copy `.env.example` to `.env` in the root workspace.
2. Runtime logs are stored in `data/runtime/logs/jarvis.log`.
3. SQLite state is stored in `data/runtime/jarvis.db`.

