import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, type TestingModule } from '@nestjs/testing';
import {
  authenticatedSessionSchema,
  directConversationSchema,
  directConversationsSchema,
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
import { ConversationsService } from '../src/modules/conversations/conversations.service';
import { TypingService } from '../src/modules/realtime/typing.service';
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
      if (isBinary) {
        return;
      }
      const parsed = serverFrameSchema.safeParse(
        JSON.parse(
          Buffer.from(data as ArrayBuffer).toString('utf8'),
        ) as unknown,
      );
      if (!parsed.success || !predicate(parsed.data)) {
        return;
      }

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
    if (app) {
      await app.close();
    }
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

  it('tracks presence across sessions and only notifies conversation peers', async () => {
    const bobSocket = await openSocket(bob.accessToken);
    const charlieSocket = await openSocket(charlie.accessToken);
    const onlineForBob = waitForFrame(
      bobSocket,
      (frame) =>
        frame.type === 'presence.updated' &&
        frame.payload.userId === alice.user.id &&
        frame.payload.online,
    );
    const unrelatedOnline = waitForFrame(
      charlieSocket,
      (frame) =>
        frame.type === 'presence.updated' &&
        frame.payload.userId === alice.user.id,
      350,
    );

    const alicePrimary = await openSocket(alice.accessToken);
    await expect(onlineForBob).resolves.toMatchObject({
      type: 'presence.updated',
      payload: {
        userId: alice.user.id,
        online: true,
        lastSeenAt: null,
      },
    });
    await expect(unrelatedOnline).rejects.toThrow(
      'Timed out waiting for a WebSocket frame',
    );

    const onlineResponse = await request(app.getHttpServer())
      .get('/api/v1/conversations')
      .set('Authorization', authorization(bob))
      .expect(200);
    const onlineConversations = directConversationsSchema.parse(
      onlineResponse.body as unknown,
    );
    expect(onlineConversations[0]?.presence).toEqual({
      userId: alice.user.id,
      online: true,
      lastSeenAt: null,
    });

    const duplicateOnline = waitForFrame(
      bobSocket,
      (frame) =>
        frame.type === 'presence.updated' &&
        frame.payload.userId === alice.user.id &&
        frame.payload.online,
      350,
    );
    const aliceSecondary = await openSocket(alice.accessToken);
    await expect(duplicateOnline).rejects.toThrow(
      'Timed out waiting for a WebSocket frame',
    );

    const prematureOffline = waitForFrame(
      bobSocket,
      (frame) =>
        frame.type === 'presence.updated' &&
        frame.payload.userId === alice.user.id &&
        !frame.payload.online,
      350,
    );
    const primaryClosed = waitForClose(alicePrimary);
    alicePrimary.close(1000, 'Primary tab closed');
    await primaryClosed;
    await expect(prematureOffline).rejects.toThrow(
      'Timed out waiting for a WebSocket frame',
    );

    const offlineForBob = waitForFrame(
      bobSocket,
      (frame) =>
        frame.type === 'presence.updated' &&
        frame.payload.userId === alice.user.id &&
        !frame.payload.online,
    );
    const secondaryClosed = waitForClose(aliceSecondary);
    aliceSecondary.close(1000, 'Final tab closed');
    await secondaryClosed;
    const offline = await offlineForBob;
    expect(offline).toMatchObject({
      type: 'presence.updated',
      payload: {
        userId: alice.user.id,
        online: false,
      },
    });
    if (offline.type !== 'presence.updated' || !offline.payload.lastSeenAt) {
      throw new Error('Expected an offline presence timestamp');
    }

    const [persisted] = await database
      .select({ lastSeenAt: users.lastSeenAt })
      .from(users)
      .where(eq(users.id, alice.user.id))
      .limit(1);
    expect(persisted.lastSeenAt?.toISOString()).toBe(
      offline.payload.lastSeenAt,
    );

    const offlineResponse = await request(app.getHttpServer())
      .get('/api/v1/conversations')
      .set('Authorization', authorization(bob))
      .expect(200);
    const offlineConversations = directConversationsSchema.parse(
      offlineResponse.body as unknown,
    );
    expect(offlineConversations[0]?.presence).toEqual(offline.payload);

    bobSocket.close(1000, 'Presence test complete');
    charlieSocket.close(1000, 'Presence test complete');
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
  function setTyping(socket: WebSocket, isTyping: boolean): string {
    const requestId = randomUUID();
    socket.send(
      JSON.stringify({
        v: protocolVersion,
        type: 'typing.set',
        requestId,
        payload: { conversationId, isTyping },
      }),
    );
    return requestId;
  }

  function typingFrame(
    socket: WebSocket,
    isTyping: boolean,
    timeout = 3_000,
  ): Promise<ServerFrame> {
    return waitForFrame(
      socket,
      (frame) =>
        frame.type === 'typing.updated' &&
        frame.payload.conversationId === conversationId &&
        frame.payload.userId === alice.user.id &&
        frame.payload.isTyping === isTyping,
      timeout,
    );
  }

  async function closeSocket(socket: WebSocket): Promise<void> {
    const closed = waitForClose(socket);
    socket.close();
    await closed;
  }

  it('scopes typing to the conversation, aggregates sessions, and clears accepted messages', async () => {
    // Charlie is a presence peer of Alice, but not a member of Alice/Bob's chat.
    const otherChatResponse = await request(app.getHttpServer())
      .post('/api/v1/conversations/direct')
      .set('Authorization', authorization(alice))
      .send({ participantId: charlie.user.id })
      .expect(200);
    const otherChat = directConversationSchema.parse(
      otherChatResponse.body as unknown,
    );
    const bobFirst = await openSocket(bob.accessToken);
    const bobSecond = await openSocket(bob.accessToken);
    const outsider = await openSocket(charlie.accessToken);
    const aliceFirst = await openSocket(alice.accessToken);
    const aliceSecond = await openSocket(alice.accessToken);
    const outsiderUpdates: ServerFrame[] = [];
    const bobUpdates: ServerFrame[] = [];
    outsider.on('message', (raw: RawData) => {
      const frame = serverFrameSchema.parse(
        JSON.parse(Buffer.from(raw as ArrayBuffer).toString('utf8')) as unknown,
      );
      if (frame.type === 'typing.updated') {
        outsiderUpdates.push(frame);
      }
    });
    bobFirst.on('message', (raw: RawData) => {
      const frame = serverFrameSchema.parse(
        JSON.parse(Buffer.from(raw as ArrayBuffer).toString('utf8')) as unknown,
      );
      if (frame.type === 'typing.updated') {
        bobUpdates.push(frame);
      }
    });
    try {
      const firstStart = [
        typingFrame(bobFirst, true),
        typingFrame(bobSecond, true),
      ];
      setTyping(aliceFirst, true);
      await Promise.all(firstStart);
      const secondStart = typingFrame(bobFirst, true);
      setTyping(aliceSecond, true);
      await secondStart;
      const firstMessage = waitForFrame(
        bobFirst,
        (frame) =>
          frame.type === 'message.created' &&
          frame.payload.content === 'another tab is still typing',
      );
      aliceFirst.send(
        JSON.stringify({
          v: protocolVersion,
          type: 'message.send',
          requestId: randomUUID(),
          payload: {
            conversationId,
            clientMessageId: randomUUID(),
            content: 'another tab is still typing',
          },
        }),
      );
      await firstMessage;
      await closeSocket(aliceFirst);
      const renewed = typingFrame(bobFirst, true);
      setTyping(aliceSecond, true);
      await renewed;
      expect(
        bobUpdates.every(
          (frame) => frame.type === 'typing.updated' && frame.payload.isTyping,
        ),
      ).toBe(true);

      const forbidden = waitForFrame(
        outsider,
        (frame) => frame.type === 'error' && frame.payload.code === 'FORBIDDEN',
      );
      const requestId = setTyping(outsider, true);
      expect(await forbidden).toMatchObject({ requestId });
      expect(outsiderUpdates).toEqual([]);

      const stopped = [
        typingFrame(bobFirst, false),
        typingFrame(bobSecond, false),
      ];
      const accepted = waitForFrame(
        aliceSecond,
        (frame) => frame.type === 'message.accepted',
      );
      const clientMessageId = randomUUID();
      const sendFrame = {
        v: protocolVersion,
        type: 'message.send',
        requestId: randomUUID(),
        payload: {
          conversationId,
          clientMessageId,
          content: 'typing acceptance fallback',
        },
      };
      aliceSecond.send(JSON.stringify(sendFrame));
      await Promise.all([...stopped, accepted]);

      const restarted = typingFrame(bobFirst, true);
      setTyping(aliceSecond, true);
      await restarted;
      const duplicateStopped = typingFrame(bobFirst, false);
      const duplicateAccepted = waitForFrame(
        aliceSecond,
        (frame) => frame.type === 'message.accepted',
      );
      aliceSecond.send(
        JSON.stringify({ ...sendFrame, requestId: randomUUID() }),
      );
      await Promise.all([duplicateStopped, duplicateAccepted]);
      expect(outsiderUpdates).toEqual([]);
    } finally {
      for (const socket of [
        aliceFirst,
        aliceSecond,
        bobFirst,
        bobSecond,
        outsider,
      ]) {
        if (socket.readyState === WebSocket.OPEN) {
          await closeSocket(socket);
        }
      }
      await database
        .delete(conversations)
        .where(eq(conversations.id, otherChat.id));
    }
  });

  it('expires missing stops and clears typing on disconnect', async () => {
    const bobSocket = await openSocket(bob.accessToken);
    const aliceSocket = await openSocket(alice.accessToken);
    try {
      const started = typingFrame(bobSocket, true);
      setTyping(aliceSocket, true);
      await started;
      await typingFrame(bobSocket, false, 7_000);
      const restarted = typingFrame(bobSocket, true);
      setTyping(aliceSocket, true);
      await restarted;
      const stopped = typingFrame(bobSocket, false);
      await closeSocket(aliceSocket);
      await stopped;
    } finally {
      if (aliceSocket.readyState === WebSocket.OPEN) {
        await closeSocket(aliceSocket);
      }
      await closeSocket(bobSocket);
    }
  });

  it('does not restore typing if authorization finishes after disconnect', async () => {
    const socket = await openSocket(alice.accessToken);
    const conversationsService = app.get(ConversationsService);
    const typing = app.get(TypingService);
    const original =
      conversationsService.assertMember.bind(conversationsService);
    let release!: () => void;
    let entered!: () => void;
    let checked!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const membersRead = new Promise<void>((resolve) => {
      checked = resolve;
    });
    const membership = jest
      .spyOn(conversationsService, 'assertMember')
      .mockImplementationOnce(async (...args) => {
        entered();
        await gate;
        await original(...args);
      });
    const originalMembers =
      conversationsService.memberIds.bind(conversationsService);
    const members = jest
      .spyOn(conversationsService, 'memberIds')
      .mockImplementationOnce(async (id) => {
        const ids = await originalMembers(id);
        checked();
        return ids;
      });
    const refresh = jest.spyOn(typing, 'refresh');
    try {
      setTyping(socket, true);
      await started;
      await closeSocket(socket);
      release();
      await membersRead;
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(refresh).not.toHaveBeenCalled();
    } finally {
      release();
      membership.mockRestore();
      members.mockRestore();
      refresh.mockRestore();
      if (socket.readyState === WebSocket.OPEN) {
        await closeSocket(socket);
      }
    }
  });
});
