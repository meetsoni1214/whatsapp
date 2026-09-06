# Event Chat

A WhatsApp-style learning project built with NestJS, React, PostgreSQL, Drizzle, raw WebSockets, and an event-driven architecture.

- [Architecture plan](./ARCHITECTURE_PLAN.md)
- [Learning path](./LEARNING_PATH.md)
- [Message pagination walkthrough](./message-pagination-visual.html)
- [Durable WebSocket lifecycle walkthrough](./websocket-lifecycle-visual.html)
- [Presence lifecycle walkthrough](./presence-lifecycle-visual.html)

## Workspace

```text
apps/api             NestJS and TypeScript backend
apps/web             React, TypeScript, and Vite frontend
packages/contracts   Shared REST, WebSocket, and error contracts
tests/browser        Two-session Playwright acceptance coverage
```

## Prerequisites

- Node.js 24 or later
- pnpm 11 or later
- Docker with Docker Compose

## Run locally

Install dependencies and prepare configuration:

```bash
pnpm install
cp .env.example .env
```

Start PostgreSQL and apply migrations:

```bash
pnpm db:up
pnpm db:migrate
```

Start the API and web application:

```bash
pnpm dev
```

Then open:

- Web application: http://localhost:5173
- API health endpoint: http://localhost:3000/api/v1/health
- Raw WebSocket endpoint: ws://localhost:3000/ws

The browser derives the WebSocket URL from `VITE_API_URL`; `VITE_WS_URL` can override it for split deployments.

## Database workflow

```bash
pnpm db:generate
pnpm db:migrate
pnpm db:test:up
pnpm test:integration
pnpm db:down
```

The development database uses port 5432. The isolated test database uses port 5433 with ephemeral storage.

## Verification

```bash
pnpm build
pnpm lint
pnpm test
pnpm test:e2e
pnpm test:integration
pnpm test:browser:install
pnpm test:browser
```

Playwright failure traces, screenshots, and videos are written under `output/playwright/`.

## Current milestone

Phases 1 through 4 are complete: authenticated users can discover people, create direct conversations, exchange persisted messages over raw WebSockets, retry without duplicates, synchronize multiple sessions, and recover missed history after reconnecting.

Phase 5 is in progress: peer-scoped multi-session presence and durable last-seen recovery are complete. Expiring typing indicators are next, followed by monotonic delivered/read receipts.
