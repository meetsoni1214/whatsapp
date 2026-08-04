import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import {
  authenticatedSessionSchema,
  directConversationSchema,
  directConversationsSchema,
  messagePageSchema,
  type AuthenticatedSession,
} from '@event-chat/contracts';
import { and, desc, eq, like } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres, { type Sql } from 'postgres';
import request from 'supertest';
import type { App } from 'supertest/types';
import { configureApp } from '../src/app.config';
import { AppModule } from '../src/app.module';
import {
  conversationMembers,
  conversations,
  directConversations,
  messages,
  users,
} from '../src/database/schema';

describe('Phase 3 direct conversations and history (e2e)', () => {
  let app: INestApplication<App>;
  let cleanupClient: Sql;
  let database: ReturnType<typeof drizzle>;
  let aliceSession: AuthenticatedSession;
  let bobSession: AuthenticatedSession;
  let charlieSession: AuthenticatedSession;
  let conversationId: string;

  const suffix = randomUUID().replaceAll('-', '').slice(0, 8);
  const alice = `p3alice_${suffix}`;
  const bob = `p3bob_${suffix}`;
  const charlie = `p3charlie_${suffix}`;
  const password = 'correct-horse-42';

  beforeAll(async () => {
    const databaseUrl =
      process.env.TEST_DATABASE_URL ??
      'postgres://event_chat:event_chat@localhost:5433/event_chat_test';

    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL = databaseUrl;
    process.env.JWT_ACCESS_SECRET =
      'phase-3-e2e-secret-isolated-from-production';
    process.env.JWT_ACCESS_TTL_SECONDS = '900';
    process.env.REFRESH_SESSION_TTL_DAYS = '30';

    cleanupClient = postgres(databaseUrl, { max: 1 });
    database = drizzle(cleanupClient);
    await migrate(database, { migrationsFolder: './drizzle' });

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();

    aliceSession = await register(alice);
    bobSession = await register(bob);
    charlieSession = await register(charlie);
  });

  afterAll(async () => {
    if (conversationId) {
      await database
        .delete(conversations)
        .where(eq(conversations.id, conversationId));
    }
    await database.delete(users).where(like(users.username, `p3%_${suffix}`));
    if (app) await app.close();
    await cleanupClient.end();
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

  it('creates one direct conversation under retries and opposite-direction races', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/conversations/direct')
      .send({ participantId: bobSession.user.id })
      .expect(401);

    await request(app.getHttpServer())
      .post('/api/v1/conversations/direct')
      .set('Authorization', authorization(aliceSession))
      .send({ participantId: aliceSession.user.id })
      .expect(400);

    await request(app.getHttpServer())
      .post('/api/v1/conversations/direct')
      .set('Authorization', authorization(aliceSession))
      .send({ participantId: randomUUID() })
      .expect(404);

    const [fromAliceResponse, fromBobResponse] = await Promise.all([
      request(app.getHttpServer())
        .post('/api/v1/conversations/direct')
        .set('Authorization', authorization(aliceSession))
        .send({ participantId: bobSession.user.id })
        .expect(200),
      request(app.getHttpServer())
        .post('/api/v1/conversations/direct')
        .set('Authorization', authorization(bobSession))
        .send({ participantId: aliceSession.user.id })
        .expect(200),
    ]);

    const fromAlice = directConversationSchema.parse(
      fromAliceResponse.body as unknown,
    );
    const fromBob = directConversationSchema.parse(
      fromBobResponse.body as unknown,
    );
    conversationId = fromAlice.id;

    expect(fromBob.id).toBe(conversationId);
    expect(fromAlice.participant.username).toBe(bob);
    expect(fromBob.participant.username).toBe(alice);

    const [userLowId, userHighId] = [
      aliceSession.user.id,
      bobSession.user.id,
    ].sort();
    const pairs = await database
      .select()
      .from(directConversations)
      .where(
        and(
          eq(directConversations.userLowId, userLowId),
          eq(directConversations.userHighId, userHighId),
        ),
      );
    const members = await database
      .select()
      .from(conversationMembers)
      .where(eq(conversationMembers.conversationId, conversationId));

    expect(pairs).toHaveLength(1);
    expect(members).toHaveLength(2);

    const retry = await request(app.getHttpServer())
      .post('/api/v1/conversations/direct')
      .set('Authorization', authorization(aliceSession))
      .send({ participantId: bobSession.user.id })
      .expect(200);
    expect(directConversationSchema.parse(retry.body as unknown).id).toBe(
      conversationId,
    );

    const aliceList = await request(app.getHttpServer())
      .get('/api/v1/conversations')
      .set('Authorization', authorization(aliceSession))
      .expect(200);
    const bobList = await request(app.getHttpServer())
      .get('/api/v1/conversations')
      .set('Authorization', authorization(bobSession))
      .expect(200);
    const charlieList = await request(app.getHttpServer())
      .get('/api/v1/conversations')
      .set('Authorization', authorization(charlieSession))
      .expect(200);

    expect(
      directConversationsSchema.parse(aliceList.body as unknown),
    ).toHaveLength(1);
    expect(
      directConversationsSchema.parse(bobList.body as unknown),
    ).toHaveLength(1);
    expect(
      directConversationsSchema.parse(charlieList.body as unknown),
    ).toEqual([]);
  });

  it('paginates history by created time and UUID and enforces membership', async () => {
    const tiedAt = new Date('2026-08-02T08:00:00.000Z');
    await database.insert(messages).values(
      Array.from({ length: 5 }, (_, index) => ({
        id: randomUUID(),
        conversationId,
        senderId: index % 2 === 0 ? aliceSession.user.id : bobSession.user.id,
        clientMessageId: randomUUID(),
        content: `message-${index}`,
        createdAt:
          index < 3 ? tiedAt : new Date(tiedAt.getTime() - index * 1000),
      })),
    );

    const expected = await database
      .select({ id: messages.id })
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(desc(messages.createdAt), desc(messages.id));

    const firstResponse = await request(app.getHttpServer())
      .get(`/api/v1/conversations/${conversationId}/messages`)
      .query({ limit: 2 })
      .set('Authorization', authorization(aliceSession))
      .expect(200);
    const first = messagePageSchema.parse(firstResponse.body as unknown);
    expect(first.nextCursor).not.toBeNull();

    const secondResponse = await request(app.getHttpServer())
      .get(`/api/v1/conversations/${conversationId}/messages`)
      .query({ limit: 2, cursor: first.nextCursor })
      .set('Authorization', authorization(aliceSession))
      .expect(200);
    const second = messagePageSchema.parse(secondResponse.body as unknown);

    const thirdResponse = await request(app.getHttpServer())
      .get(`/api/v1/conversations/${conversationId}/messages`)
      .query({ limit: 2, cursor: second.nextCursor })
      .set('Authorization', authorization(aliceSession))
      .expect(200);
    const third = messagePageSchema.parse(thirdResponse.body as unknown);

    expect(
      [...first.data, ...second.data, ...third.data].map((item) => item.id),
    ).toEqual(expected.map((item) => item.id));
    expect(third.nextCursor).toBeNull();

    await request(app.getHttpServer())
      .get(`/api/v1/conversations/${conversationId}/messages`)
      .set('Authorization', authorization(bobSession))
      .expect(200);
    await request(app.getHttpServer())
      .get(`/api/v1/conversations/${conversationId}/messages`)
      .set('Authorization', authorization(charlieSession))
      .expect(403);
    await request(app.getHttpServer())
      .get(`/api/v1/conversations/${randomUUID()}/messages`)
      .set('Authorization', authorization(aliceSession))
      .expect(404);
    await request(app.getHttpServer())
      .get(`/api/v1/conversations/${conversationId}/messages`)
      .query({ cursor: 'not-a-valid-cursor' })
      .set('Authorization', authorization(aliceSession))
      .expect(400);
  });
});
