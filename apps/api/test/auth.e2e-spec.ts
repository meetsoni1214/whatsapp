import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { authenticatedSessionSchema } from '@event-chat/contracts';
import { like } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres, { type Sql } from 'postgres';
import request, { type Response } from 'supertest';
import type { App } from 'supertest/types';
import { configureApp } from '../src/app.config';
import { AppModule } from '../src/app.module';
import { users } from '../src/database/schema';

function cookieFrom(response: Response, name: string): string {
  const header: unknown = response.headers['set-cookie'];
  const values: string[] = Array.isArray(header)
    ? header.filter((value): value is string => typeof value === 'string')
    : typeof header === 'string'
      ? [header]
      : [];
  const cookie = values.find((value) => value.startsWith(`${name}=`));

  if (!cookie) throw new Error(`Missing ${name} cookie`);
  return cookie.split(';', 1)[0];
}

describe('Phase 2 authentication and user discovery (e2e)', () => {
  let app: INestApplication<App>;
  let cleanupClient: Sql;
  const suffix = randomUUID().replaceAll('-', '').slice(0, 8);
  const alice = `p2alice_${suffix}`;
  const bob = `p2bob_${suffix}`;
  const password = 'correct-horse-42';

  beforeAll(async () => {
    const databaseUrl =
      process.env.TEST_DATABASE_URL ??
      'postgres://event_chat:event_chat@localhost:5433/event_chat_test';

    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL = databaseUrl;
    process.env.JWT_ACCESS_SECRET =
      'phase-2-e2e-secret-isolated-from-production';
    process.env.JWT_ACCESS_TTL_SECONDS = '900';
    process.env.REFRESH_SESSION_TTL_DAYS = '30';

    cleanupClient = postgres(databaseUrl, { max: 1 });
    await migrate(drizzle(cleanupClient), { migrationsFolder: './drizzle' });

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await drizzle(cleanupClient)
      .delete(users)
      .where(like(users.username, `p2%_${suffix}`));
    if (app) await app.close();
    await cleanupClient.end();
  });

  it('registers two users, protects endpoints, and discovers another user', async () => {
    const aliceRegistration = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ username: alice.toUpperCase(), password })
      .expect(201);

    const aliceSession = authenticatedSessionSchema.parse(
      aliceRegistration.body as unknown,
    );
    expect(aliceSession.user.username).toBe(alice);
    expect(cookieFrom(aliceRegistration, 'event_chat_refresh')).not.toContain(
      password,
    );

    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ username: alice, password })
      .expect(409);

    const bobRegistration = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ username: bob, password })
      .expect(201);
    const bobSession = authenticatedSessionSchema.parse(
      bobRegistration.body as unknown,
    );

    await request(app.getHttpServer()).get('/api/v1/users/me').expect(401);

    await request(app.getHttpServer())
      .get('/api/v1/users/me')
      .set('Authorization', `Bearer ${aliceSession.accessToken}`)
      .expect(200)
      .expect({ id: aliceSession.user.id, username: alice });

    await request(app.getHttpServer())
      .get('/api/v1/users/search')
      .query({ q: `p2bob_${suffix}` })
      .set('Authorization', `Bearer ${aliceSession.accessToken}`)
      .expect(200)
      .expect([{ id: bobSession.user.id, username: bob }]);

    const [persistedAlice] = await drizzle(cleanupClient)
      .select({ passwordHash: users.passwordHash })
      .from(users)
      .where(like(users.username, alice));

    expect(persistedAlice.passwordHash).not.toBe(password);
    expect(persistedAlice.passwordHash).toEqual(
      expect.stringMatching(/^\$argon2id\$/),
    );
  });

  it('rejects bad credentials and rotates refresh sessions once', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ username: alice, password: 'wrong-password' })
      .expect(401);

    const loginResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ username: alice, password })
      .expect(200);

    const firstCookie = cookieFrom(loginResponse, 'event_chat_refresh');
    const refreshResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', firstCookie)
      .expect(200);
    const secondCookie = cookieFrom(refreshResponse, 'event_chat_refresh');

    expect(secondCookie).not.toBe(firstCookie);

    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', firstCookie)
      .expect(401);

    await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Cookie', secondCookie)
      .expect(204);

    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', secondCookie)
      .expect(401);
  });
});
