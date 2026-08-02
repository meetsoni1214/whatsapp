# Event-Driven Architecture Learning Path

## Project goal

We will learn event-driven architecture by gradually building a WhatsApp-style chat application with:

- NestJS and TypeScript for the backend
- React and TypeScript for the frontend
- PostgreSQL for durable application data
- WebSockets for live, two-way client/server communication
- RabbitMQ for backend events once the core application works
- Redis later, when we run multiple WebSocket server instances or need shared presence state

The first meaningful milestone is deliberately small:

> Two browser tabs can log in, create a direct conversation, exchange persisted messages in real time, reconnect, and retrieve missed messages.

We will begin with a modular monolith. We will not start with microservices. When the monolith exposes a real scaling or reliability problem, we will extract the relevant responsibility and learn why the extra architecture is useful.

## The four ideas to keep separate

### HTTP

HTTP normally follows request and response. The client asks for something and the server responds.

We will use HTTP for:

- Registration and login
- Loading conversations
- Fetching message history
- Creating conversations
- Uploading attachments later

### WebSocket

A WebSocket is a long-lived, two-way connection between a client and a server. After connecting, either side can send data without creating a new HTTP request each time.

We will use WebSockets for:

- Receiving new messages immediately
- Delivery and read receipts
- Typing indicators
- Presence updates

A WebSocket is only a transport. It does not automatically provide database persistence, retries, offline delivery, message ordering, or exactly-once processing.

### Event-driven architecture

In an event-driven system, a producer publishes a fact that has already happened. One or more consumers react to that fact asynchronously.

Examples:

```text
MessageCreated
MessageDelivered
MessageRead
UserCameOnline
```

An event is different from a command:

```text
SendMessage      command: please do this
MessageCreated   event: this has happened
```

### Database

The database is our source of durable application state. WebSockets and event brokers do not replace it. If a user is offline, their messages must still be retrievable from the database later.

## Target architecture

```text
                            PostgreSQL
                       users, conversations,
                        messages, outbox
                               ^
                               |
React client ----HTTP----> NestJS API / Message Service
     |
     +------WebSocket----> WebSocket Gateway
                               |
                        +------v-------+
                        | Event broker |
                        +----+----+----+
                             |    |
                       Delivery   Notifications
                       consumer   consumer
```

This is the destination, not the starting point.

## Example message lifecycle

1. Alice sends a message with a client-generated identifier.
2. The WebSocket gateway authenticates Alice.
3. The message service verifies that Alice belongs to the conversation.
4. PostgreSQL stores the message.
5. The application publishes a `MessageCreated` event.
6. A delivery consumer sends the message to Bob if he is connected.
7. Bob publishes a `MessageDelivered` or `MessageRead` acknowledgement.
8. Alice receives the updated receipt.
9. If Bob was offline, he retrieves missed messages after reconnecting.

## Learning phases

### Phase 0: Establish the foundation

Build and understand:

- A NestJS application
- A React application
- The boundary between frontend and backend
- Environment configuration
- Automated tests
- Local development commands

Outcome: React can call a health endpoint exposed by NestJS.

### Phase 1: Build an ordinary request-response application

Build:

- User registration
- Login and authentication
- Creating a direct conversation
- Listing conversations
- Sending a message through HTTP
- Fetching paginated message history
- PostgreSQL persistence

Learn:

- Controllers, services, and modules in NestJS
- DTO validation
- Database tables, primary keys, foreign keys, and indexes
- Transactions
- Authentication and authorization
- Cursor pagination

Do not add an event broker during this phase.

### Phase 2: Add WebSockets

Build:

- Authenticated WebSocket connections
- Live message delivery
- Reconnection behavior
- Heartbeats
- Typing indicators
- Basic online presence

Learn:

- The WebSocket handshake
- Long-lived connections
- Connection lifecycle and cleanup
- Server-to-client messages
- Why real-time delivery and durable storage are separate concerns

HTTP remains responsible for history and other request-response operations.

### Phase 3: Add events inside the monolith

Introduce a small in-process event bus:

```text
MessageService publishes MessageCreated
    +-- DeliveryHandler
    +-- NotificationHandler
    +-- AnalyticsHandler
```

Learn:

- Producers and consumers
- Commands versus events
- Event contracts
- Loose coupling
- Why an event should describe a fact in the past tense

The application still deploys as one backend process.

### Phase 4: Introduce RabbitMQ

Move selected internal events to RabbitMQ.

Learn:

- Exchanges, queues, bindings, producers, and consumers
- Work queues versus publish/subscribe
- Acknowledgements
- Durable messages
- Retries and exponential backoff
- Dead-letter queues
- Competing consumers
- Idempotent consumers

RabbitMQ is our first broker because its queueing and routing model makes the mechanics visible. Kafka can be introduced later when we need a replayable event log, partitions, or higher-throughput stream processing.

### Phase 5: Make message processing reliable

Study and implement:

1. At-most-once and at-least-once delivery
2. Duplicate message handling
3. Idempotency
4. Ordering within a conversation
5. Retry policies
6. Dead-letter queues
7. Eventual consistency
8. The transactional outbox pattern
9. Event schema versioning
10. Correlation identifiers, logs, metrics, and traces

An important rule is that `exactly once` is rarely a magic broker setting. We will normally combine at-least-once delivery with idempotent processing to achieve the correct user-visible result.

### Phase 6: Scale only after the single-instance version works

Explore:

- Multiple NestJS instances
- Shared connection and presence information in Redis
- Routing messages to a user connected to another server instance
- Load balancing and WebSocket connection affinity
- Partitioning messages by conversation identifier
- Rate limits and abuse controls
- Object storage for media
- Push notifications for offline mobile users

End-to-end encryption, voice/video calling, Kubernetes, Cassandra, and multi-region deployment are intentionally postponed.

## Initial database model

### `users`

```text
id
username
password_hash
created_at
```

### `conversations`

```text
id
type              direct or group
created_at
```

### `conversation_members`

```text
conversation_id
user_id
joined_at
```

### `messages`

```text
id
conversation_id
sender_id
client_message_id
content
created_at
```

### `message_receipts`

```text
message_id
user_id
status            delivered or read
updated_at
```

### `outbox_events`

```text
id
event_type
aggregate_id
payload
published_at
created_at
```

Design rules:

- Each message submission has a client-generated `client_message_id`.
- A uniqueness constraint prevents a reconnect or retry from creating the same message twice.
- Receipts belong to both a message and a recipient. One status column on `messages` cannot correctly represent a group conversation.
- Messages are indexed by conversation and creation position.
- Message history uses cursor pagination rather than large numeric offsets.
- Media will eventually live in object storage; PostgreSQL will store its metadata and location.

## Technology choices

### Start with

- NestJS
- TypeScript
- React
- Vite
- PostgreSQL
- A simple WebSocket implementation through NestJS gateways
- Docker Compose for local infrastructure
- Unit and integration tests

### Add when a lesson requires them

- RabbitMQ for reliable asynchronous backend communication
- Redis for shared ephemeral presence and multi-instance WebSocket routing
- Object storage for images, video, and documents
- Kafka for durable replayable streams and partitioning exercises

### Avoid initially

- Microservice-per-feature architecture
- Kubernetes
- Cassandra
- Multi-region deployment
- End-to-end encryption
- Voice and video calls
- Premature performance optimization

## First implementation milestone

We will complete the following vertical slices in order:

1. Workspace containing `apps/api` and `apps/web`
2. NestJS health endpoint
3. React screen that displays API health
4. PostgreSQL local environment
5. User registration and login
6. Direct conversations
7. Persisted HTTP messages
8. Live WebSocket messages
9. Reconnection and missed-message recovery

At every step we should be able to run the application and explain why every component exists.

## Learning discipline

For each feature:

1. Describe the problem in plain language.
2. Draw the current request or event flow.
3. Implement the smallest correct solution.
4. Test failure cases, retries, duplicates, and reconnections where relevant.
5. Record the architectural tradeoff.
6. Add infrastructure only after identifying the problem it solves.

The goal is not merely to finish a clone. The goal is to be able to explain the architecture, its failure modes, and why each tradeoff was selected.

## Reference material

- [MDN: WebSocket API](https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API)
- [NestJS: WebSockets](https://docs.nestjs.com/websockets/gateways)
- [RabbitMQ JavaScript tutorials](https://www.rabbitmq.com/tutorials/tutorial-one-javascript)
- [Azure Architecture Center: Event-driven architecture](https://learn.microsoft.com/en-us/azure/architecture/guide/architecture-styles/event-driven)
- [CloudEvents specification](https://cloudevents.io/)
- [Apache Kafka documentation](https://kafka.apache.org/documentation/)

