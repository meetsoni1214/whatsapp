# Event Chat

A WhatsApp-style learning project built with NestJS, React, PostgreSQL, Drizzle, raw WebSockets, and an event-driven architecture.

- [Architecture plan](./ARCHITECTURE_PLAN.md)
- [Learning path](./LEARNING_PATH.md)

## Workspace

```text
apps/api             NestJS and TypeScript backend
apps/web             React, TypeScript, and Vite frontend
packages/contracts   Shared REST, WebSocket, and error contracts
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
pnpm --filter @event-chat/api test:e2e
pnpm test:integration
```

## Current milestone

Phase 1 is complete: PostgreSQL infrastructure, Drizzle schema and migrations, validated environment configuration, versioned API bootstrap, domain module boundaries, shared Zod runtime contracts, and persistence integration coverage are in place.

Phase 2 adds username/password authentication, access and refresh sessions, and user discovery.
