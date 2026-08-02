# Event Chat

A WhatsApp-style learning project for understanding NestJS, React, WebSockets, databases, and event-driven architecture from first principles.

Read [LEARNING_PATH.md](./LEARNING_PATH.md) for the complete learning roadmap and the reasoning behind the implementation order.

## Workspace

```text
apps/api   NestJS and TypeScript backend
apps/web   React, TypeScript, and Vite frontend
```

## Prerequisites

- Node.js 24 or later
- pnpm 11 or later

## Run locally

```bash
pnpm install
pnpm dev
```

Then open:

- Web application: http://localhost:5173
- API health endpoint: http://localhost:3000/health

## Useful commands

```bash
pnpm build
pnpm lint
pnpm test
```

## Current milestone

Phase 0 starts with both applications running and a tested NestJS health endpoint. Next, the React client will call that endpoint before we add PostgreSQL.
