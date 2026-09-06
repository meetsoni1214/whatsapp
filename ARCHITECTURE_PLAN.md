# WhatsApp Skeleton Architecture Plan

## Summary

Build a responsive one-to-one chat application as a NestJS modular monolith with React, PostgreSQL through Drizzle, raw WebSockets, username/password authentication, and multiple active sessions per user.

The first production-like milestone is two users in separate browser sessions authenticating, creating a direct conversation, exchanging persisted messages in real time, seeing presence and receipts, reconnecting, and recovering missed messages.

Implementation status: Phases 1 through 4 are complete. Phase 5 is in progress; presence is complete, while typing indicators and receipts remain.

## Phase 1 — Architecture and persistence foundation

- Add Docker Compose with PostgreSQL.
- Configure Drizzle ORM, migrations, environment validation, shared Zod runtime contracts, and API v1 routing.
- Organize NestJS into auth, users, conversations, messages, and realtime modules.
- Add a shared contracts package for REST DTOs, WebSocket frames, events, and error codes.
- Establish users, sessions, conversations, direct pairs, membership, messages, and receipts tables.
- Store normalized lowercase usernames with a unique database constraint.
- Use UUID identifiers and created-at/id cursor ordering.
- Gate: migrations run from an empty database and integration tests insert and query users and conversations.

## Phase 2 — Authentication and user discovery

- Register and log in with username/password using Argon2id.
- Issue 15-minute JWT access tokens and rotated 30-day refresh sessions through HttpOnly cookies.
- Add logout, session revocation, user search, and React authentication screens.
- Gate: two users can authenticate, refresh sessions, find each other, and log out.

## Phase 3 — Direct conversations and history

- Make direct conversation creation idempotent using a unique sorted participant pair.
- Add conversation lists and cursor-paginated message history.
- Authorize operations through conversation membership.
- Build a responsive two-pane chat interface.
- Gate: members can create and reload conversations while non-members are denied access.

## Phase 4 — Raw WebSocket messaging

- Use the NestJS ws adapter at /ws.
- Require auth.authenticate as the first frame within five seconds.
- Support multiple active connections per user with heartbeat cleanup.
- Accept message.send, persist idempotently, and acknowledge only after commit.
- Reconnect with exponential backoff and recover missed data over HTTP.
- Gate: two browsers exchange durable messages and retries create no duplicate rows.

## Phase 5 — Presence, typing, and receipts

Status: presence is complete; typing indicators and receipts are next.

- Keep a user online until the final connection closes and persist last-seen time.
- Expire ephemeral typing state automatically.
- Model monotonic sent, delivered, and read recipient receipts.
- Synchronize messages and receipts across active sessions.
- Gate: presence, typing, receipts, offline recovery, and reconnect behavior work consistently.

## Phase 6 — Internal events and RabbitMQ

- Put an event-bus interface between domain services and side effects.
- Publish message-created, message-delivered, message-read, and presence events.
- Add a transactional outbox, publisher confirms, idempotent consumers, retries, and dead letters.
- Add notification and analytics NestJS workers.
- Gate: restarts and redelivery do not lose events or duplicate visible effects.

## Phase 7 — Scaling and operational hardening

- Move cross-instance presence and live routing to Redis without making Redis durable storage.
- Add multiple gateway instances, correlation IDs, metrics, readiness checks, rate limits, and load tests.
- Gate: separately connected API instances preserve delivery, presence, and recovery.

## Public interfaces

REST endpoints:

- POST /api/v1/auth/register
- POST /api/v1/auth/login
- POST /api/v1/auth/refresh
- POST /api/v1/auth/logout
- GET /api/v1/users/me
- GET /api/v1/users/search
- POST /api/v1/conversations/direct
- GET /api/v1/conversations
- GET /api/v1/conversations/:id/messages

The version-one WebSocket protocol has client frames with version, type, request ID, and payload; server frames add event ID, optional request ID, occurrence time, and payload.

Client message types are auth.authenticate, message.send, receipt.update, and typing.set. Server message types are auth.authenticated, message.accepted, message.created, receipt.updated, typing.updated, presence.updated, and error.

## Testing strategy

- Unit-test normalization, session handling, direct-pair uniqueness, message idempotency, authorization, and receipts.
- Run PostgreSQL integration tests against an isolated database.
- Cover authentication, refresh rotation, search, conversations, and pagination over HTTP.
- Cover authentication timeout, acknowledgement order, multiple sessions, reconnects, duplicates, recovery, typing, and receipts over raw WebSockets.
- Verify RabbitMQ confirmation, redelivery, idempotency, retries, and dead-letter behavior.
- Exercise two-user desktop and mobile flows in a real browser.

## Assumptions

- The initial product supports direct text conversations only.
- Groups, media, push notifications, encryption, calls, and multi-region deployment are deferred.
- PostgreSQL is the durable source of truth.
- RabbitMQ is the first external broker; Kafka is deferred.
- Local development uses Docker Compose and one API instance until the scaling phase.
