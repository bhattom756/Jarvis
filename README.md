# JARVIS Monorepo

JARVIS is a Windows-first personal AI assistant built as a modular `pnpm` monorepo workspace:

- `apps/desktop`: Electron + React + TypeScript operator UI with floating HUD and tray controls
- `apps/mobile`: Expo SDK 57 React Native mobile shell and device capability agent
- `services/core`: TypeScript Fastify core orchestration and WebSocket service
- `packages/*`: Shared contracts (`protocol`, `shared-types`, `api-client`, `errors`, `logger`, `security`)
- `agents/*`: Device agent shells (`windows-agent`, `mobile-agent`)

## Monorepo Commands

From the workspace root, manage all applications and packages using `pnpm` and `Turborepo`:

```powershell
# Install dependencies across all workspace packages
pnpm install

# Run live development mode across desktop, core backend, and mobile
pnpm run dev

# Run TypeScript typechecks across all 11 workspace packages
pnpm run typecheck

# Run test suites across all packages
pnpm test

# Build production bundles
pnpm build
```

## Configuration & Runtime State

1. Copy `.env.example` to `.env` in the root workspace.
2. Runtime logs are stored in `data/runtime/logs/jarvis.log`.
3. SQLite state is stored in `data/runtime/jarvis.db`.

