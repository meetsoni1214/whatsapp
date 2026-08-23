import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, type TestingModule } from '@nestjs/testing';
import {
  authenticatedSessionSchema,
  directConversationSchema,
  messagePageSchema,
  protocolVersion,
  serverFrameSchema,
  type AuthenticatedSession,
  type ServerFrame,
  webSocketCloseCodes,
} from '@event-chat/contracts';
import { count, eq, like } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres, { type Sql } from 'postgres';
import request from 'supertest';
import type { App } from 'supertest/types';
import WebSocket, { type RawData } from 'ws';
import { configureApp } from '../src/app.config';
import { AppModule } from '../src/app.module';
import { conversations, messages, users } from '../src/database/schema';

jest.setTimeout(20_000);

function waitForFrame(
  socket: WebSocket,
  predicate: (frame: ServerFrame) => boolean,
  timeoutMs = 3_000,
): Promise<ServerFrame> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off('message', handleMessage);
      reject(new Error('Timed out waiting for a WebSocket frame'));
    }, timeoutMs);

    const handleMessage = (data: RawData, isBinary: boolean) => {
      if (isBinary) return;
      const parsed = serverFrameSchema.safeParse(
        JSON.parse(
          Buffer.from(data as ArrayBuffer).toString('utf8'),
        ) as unknown,
      );
      if (!parsed.success || !predicate(parsed.data)) return;

      clearTimeout(timer);
      socket.off('message', handleMessage);
      resolve(parsed.data);
    };

    socket.on('message', handleMessage);
  });
}

function waitForClose(socket: WebSocket): Promise<{ code: number }> {
  return new Promise((resolve) => {
    socket.once('close', (code) => resolve({ code }));
  });
}

describe('Phase 4 raw WebSocket messaging (e2e)', () => {
  let app: INestApplication<App>;
  let databaseClient: Sql;
  let database: ReturnType<typeof drizzle>;
  let websocketUrl: string;
  let alice: AuthenticatedSession;
  let bob: AuthenticatedSession;
  let charlie: AuthenticatedSession;
  let conversationId: string;
  const sockets: WebSocket[] = [];
  const suffix = randomUUID().replaceAll('-', '').slice(0, 8);
  const password = 'correct-horse-42';

  beforeAll(async () => {
    const databaseUrl =
      process.env.TEST_DATABASE_URL ??
      'postgres://event_chat:event_chat@localhost:5433/event_chat_test';
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL = databaseUrl;
    process.env.JWT_ACCESS_SECRET =
      'phase-4-e2e-secret-isolated-from-production';
    process.env.JWT_ACCESS_TTL_SECONDS = '900';
    process.env.REFRESH_SESSION_TTL_DAYS = '30';

    databaseClient = postgres(databaseUrl, { max: 4 });
    database = drizzle(databaseClient);
    await migrate(database, { migrationsFolder: './drizzle' });

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.listen(0, '127.0.0.1');

    const httpUrl = new URL(await app.getUrl());
    httpUrl.protocol = 'ws:';
    httpUrl.pathname = '/ws';
    websocketUrl = httpUrl.toString();

    alice = await register(`p4alice_${suffix}`);
    bob = await register(`p4bob_${suffix}`);
    charlie = await register(`p4charlie_${suffix}`);

    const response = await request(app.getHttpServer())
      .post('/api/v1/conversations/direct')
      .set('Authorization', authorization(alice))
      .send({ participantId: bob.user.id })
      .expect(200);
    conversationId = directConversationSchema.parse(
      response.body as unknown,
    ).id;
  });

  afterAll(async () => {
    for (const socket of sockets) {
      if (
        socket.readyState === WebSocket.OPEN ||
        socket.readyState === WebSocket.CONNECTING
      ) {
        socket.terminate();
      }
    }
    await database
      .delete(conversations)
      .where(eq(conversations.id, conversationId));
    if (app) await app.close();
    await database.delete(users).where(like(users.username, `p4%_${suffix}`));
    await databaseClient.end();
  });

  async function register(username: string): Promise<AuthenticatedSession> {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ username, password })
      .expect(201);
    return authenticatedSessionSchema.parse(response.body as unknown);
  }

  function authorization(session: AuthenticatedSession): string {
    return `Bearer ${session.accessToken}`;
  }

  async function openSocket(accessToken: string): Promise<WebSocket> {
    const socket = new WebSocket(websocketUrl);
    sockets.push(socket);
    await once(socket, 'open');

    const authenticated = waitForFrame(
      socket,
      (frame) => frame.type === 'auth.authenticated',
    );
    socket.send(
      JSON.stringify({
        v: protocolVersion,
        type: 'auth.authenticate',
        requestId: randomUUID(),
        payload: { accessToken },
      }),
    );
    await authenticated;
    return socket;
  }

  it('requires authentication as the first frame', async () => {
    const socket = new WebSocket(websocketUrl);
    sockets.push(socket);
    await once(socket, 'open');
    const errorFrame = waitForFrame(
      socket,
      (frame) =>
        frame.type === 'error' &&
        frame.payload.code === 'AUTHENTICATION_REQUIRED',
    );
    const closed = waitForClose(socket);

    socket.send(
      JSON.stringify({
        v: protocolVersion,
        type: 'message.send',
        requestId: randomUUID(),
        payload: {
          conversationId,
          clientMessageId: randomUUID(),
          content: 'not authenticated',
        },
      }),
    );

    await errorFrame;
    await expect(closed).resolves.toEqual({ code: 1008 });
  });

  it('delivers after commit to every active member session and deduplicates retries', async () => {
    const alicePrimary = await openSocket(alice.accessToken);
    const aliceSecondary = await openSocket(alice.accessToken);
    const bobSocket = await openSocket(bob.accessToken);
    const clientMessageId = randomUUID();
    const requestId = randomUUID();

    const acceptedPromise = waitForFrame(
      alicePrimary,
      (frame) =>
        frame.type === 'message.accepted' && frame.requestId === requestId,
    );
    const senderCreated = waitForFrame(
      alicePrimary,
      (frame) =>
        frame.type === 'message.created' &&
        frame.payload.clientMessageId === clientMessageId,
    );
    const secondaryCreated = waitForFrame(
      aliceSecondary,
      (frame) =>
        frame.type === 'message.created' &&
        frame.payload.clientMessageId === clientMessageId,
    );
    const recipientCreated = waitForFrame(
      bobSocket,
      (frame) =>
        frame.type === 'message.created' &&
        frame.payload.clientMessageId === clientMessageId,
    );

    alicePrimary.send(
      JSON.stringify({
        v: protocolVersion,
        type: 'message.send',
        requestId,
        payload: {
          conversationId,
          clientMessageId,
          content: 'stored before delivery',
        },
      }),
    );

    const accepted = await acceptedPromise;
    await Promise.all([senderCreated, secondaryCreated, recipientCreated]);
    if (accepted.type !== 'message.accepted') {
      throw new Error('Expected message.accepted');
    }

    const [persisted] = await database
      .select({ total: count() })
      .from(messages)
      .where(eq(messages.id, accepted.payload.messageId));
    expect(persisted.total).toBe(1);

    const duplicateRequestId = randomUUID();
    const duplicateAccepted = waitForFrame(
      alicePrimary,
      (frame) =>
        frame.type === 'message.accepted' &&
        frame.requestId === duplicateRequestId,
    );
    const unexpectedBroadcast = waitForFrame(
      bobSocket,
      (frame) =>
        frame.type === 'message.created' &&
        frame.payload.clientMessageId === clientMessageId,
      350,
    );
    alicePrimary.send(
      JSON.stringify({
        v: protocolVersion,
        type: 'message.send',
        requestId: duplicateRequestId,
        payload: {
          conversationId,
          clientMessageId,
          content: 'stored before delivery',
        },
      }),
    );

    const duplicate = await duplicateAccepted;
    expect(duplicate.type).toBe('message.accepted');
    await expect(unexpectedBroadcast).rejects.toThrow(
      'Timed out waiting for a WebSocket frame',
    );

    const [afterRetry] = await database
      .select({ total: count() })
      .from(messages)
      .where(eq(messages.clientMessageId, clientMessageId));
    expect(afterRetry.total).toBe(1);
  });

  it('rejects non-members and recovers messages missed while offline over HTTP', async () => {
    const aliceSocket = await openSocket(alice.accessToken);
    const charlieSocket = await openSocket(charlie.accessToken);
    const deniedRequestId = randomUUID();
    const denied = waitForFrame(
      charlieSocket,
      (frame) => frame.type === 'error' && frame.requestId === deniedRequestId,
    );
    charlieSocket.send(
      JSON.stringify({
        v: protocolVersion,
        type: 'message.send',
        requestId: deniedRequestId,
        payload: {
          conversationId,
          clientMessageId: randomUUID(),
          content: 'forbidden',
        },
      }),
    );
    await expect(denied).resolves.toMatchObject({
      type: 'error',
      payload: { code: 'FORBIDDEN' },
    });

    const clientMessageId = randomUUID();
    const requestId = randomUUID();
    const accepted = waitForFrame(
      aliceSocket,
      (frame) =>
        frame.type === 'message.accepted' && frame.requestId === requestId,
    );
    aliceSocket.send(
      JSON.stringify({
        v: protocolVersion,
        type: 'message.send',
        requestId,
        payload: {
          conversationId,
          clientMessageId,
          content: 'missed while offline',
        },
      }),
    );
    await accepted;

    const historyResponse = await request(app.getHttpServer())
      .get(`/api/v1/conversations/${conversationId}/messages`)
      .set('Authorization', authorization(bob))
      .expect(200);
    const history = messagePageSchema.parse(historyResponse.body as unknown);
    expect(
      history.data.some(
        (message) => message.clientMessageId === clientMessageId,
      ),
    ).toBe(true);
  });

  it('closes an authenticated connection when its access token expires', async () => {
    const jwt = app.get(JwtService);
    const shortToken = await jwt.signAsync(
      { sub: alice.user.id, username: alice.user.username },
      { expiresIn: 1 },
    );
    const socket = await openSocket(shortToken);
    const expired = waitForFrame(
      socket,
      (frame) =>
        frame.type === 'error' &&
        frame.payload.code === 'AUTHENTICATION_REQUIRED',
      2_000,
    );
    const closed = waitForClose(socket);

    await expired;
    await expect(closed).resolves.toEqual({
      code: webSocketCloseCodes.tokenExpired,
    });
  });

  it('closes a connection that does not authenticate within five seconds', async () => {
    const socket = new WebSocket(websocketUrl);
    sockets.push(socket);
    await once(socket, 'open');
    const timeoutError = waitForFrame(
      socket,
      (frame) =>
        frame.type === 'error' &&
        frame.payload.code === 'AUTHENTICATION_REQUIRED',
      6_000,
    );
    const closed = waitForClose(socket);

    await timeoutError;
    await expect(closed).resolves.toEqual({ code: 1008 });
  });
});
