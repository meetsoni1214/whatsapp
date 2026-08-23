import { randomUUID } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres, { type Sql } from 'postgres';
import { conversations, messages, users } from '../src/database/schema';
import { MessagesRepository } from '../src/modules/messages/messages.repository';

describe('message persistence', () => {
  let client: Sql;
  let database: ReturnType<typeof drizzle>;
  let repository: MessagesRepository;
  const userIds: string[] = [];
  const conversationIds: string[] = [];

  beforeAll(async () => {
    const databaseUrl =
      process.env.TEST_DATABASE_URL ??
      'postgres://event_chat:event_chat@localhost:5433/event_chat_test';
    client = postgres(databaseUrl, { max: 4 });
    database = drizzle(client);
    await migrate(database, { migrationsFolder: './drizzle' });
    repository = new MessagesRepository(database);
  });

  afterAll(async () => {
    if (conversationIds.length > 0) {
      await database
        .delete(conversations)
        .where(inArray(conversations.id, conversationIds));
    }
    if (userIds.length > 0) {
      await database.delete(users).where(inArray(users.id, userIds));
    }
    await client.end();
  });

  it('creates one durable row across concurrent retries and advances activity', async () => {
    const suffix = randomUUID().slice(0, 8);
    const [user] = await database
      .insert(users)
      .values({
        username: `message_${suffix}`,
        passwordHash: 'integration-placeholder',
      })
      .returning({ id: users.id });
    userIds.push(user.id);

    const [conversation] = await database
      .insert(conversations)
      .values({ type: 'direct' })
      .returning({ id: conversations.id });
    conversationIds.push(conversation.id);

    const input = {
      senderId: user.id,
      conversationId: conversation.id,
      clientMessageId: randomUUID(),
      content: 'persist me once',
    };
    const results = await Promise.all([
      repository.createIdempotent(input),
      repository.createIdempotent(input),
    ]);

    expect(results.filter((result) => result.inserted)).toHaveLength(1);
    expect(new Set(results.map((result) => result.row.id)).size).toBe(1);

    const persisted = await database
      .select()
      .from(messages)
      .where(eq(messages.clientMessageId, input.clientMessageId));
    const [activity] = await database
      .select({ lastMessageAt: conversations.lastMessageAt })
      .from(conversations)
      .where(eq(conversations.id, conversation.id));

    expect(persisted).toHaveLength(1);
    expect(activity.lastMessageAt?.toISOString()).toBe(
      results[0].row.createdAt.toISOString(),
    );
  });
});
