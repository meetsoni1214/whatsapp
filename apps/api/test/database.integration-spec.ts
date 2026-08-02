import { randomUUID } from 'node:crypto';
import { asc, eq, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres, { type Sql } from 'postgres';
import {
  conversationMembers,
  conversations,
  directConversations,
  users,
} from '../src/database/schema';

describe('database foundation', () => {
  let client: Sql;
  let database: ReturnType<typeof drizzle>;

  beforeAll(async () => {
    const databaseUrl =
      process.env.TEST_DATABASE_URL ??
      'postgres://event_chat:event_chat@localhost:5433/event_chat_test';

    client = postgres(databaseUrl, { max: 1 });
    database = drizzle(client);

    await migrate(database, { migrationsFolder: './drizzle' });
  });

  afterAll(async () => {
    await client.end();
  });

  it('persists users, a direct conversation, and its membership', async () => {
    const suffix = randomUUID().slice(0, 8);
    const createdUsers = await database
      .insert(users)
      .values([
        {
          username: `alice_${suffix}`,
          passwordHash: 'phase-one-placeholder-hash',
        },
        {
          username: `bob_${suffix}`,
          passwordHash: 'phase-one-placeholder-hash',
        },
      ])
      .returning({ id: users.id, username: users.username });

    const orderedUsers = [...createdUsers].sort((left, right) =>
      left.id.localeCompare(right.id),
    );

    const [conversation] = await database
      .insert(conversations)
      .values({ type: 'direct' })
      .returning({ id: conversations.id });

    await database.transaction(async (transaction) => {
      await transaction.insert(directConversations).values({
        conversationId: conversation.id,
        userLowId: orderedUsers[0].id,
        userHighId: orderedUsers[1].id,
      });

      await transaction.insert(conversationMembers).values(
        orderedUsers.map((user) => ({
          conversationId: conversation.id,
          userId: user.id,
        })),
      );
    });

    const persistedUsers = await database
      .select({ username: users.username })
      .from(users)
      .where(
        inArray(
          users.id,
          orderedUsers.map((user) => user.id),
        ),
      )
      .orderBy(asc(users.username));

    const persistedPair = await database
      .select()
      .from(directConversations)
      .where(eq(directConversations.conversationId, conversation.id));

    const persistedMembers = await database
      .select()
      .from(conversationMembers)
      .where(eq(conversationMembers.conversationId, conversation.id));

    expect(persistedUsers.map((user) => user.username)).toEqual([
      `alice_${suffix}`,
      `bob_${suffix}`,
    ]);
    expect(persistedPair).toHaveLength(1);
    expect(persistedMembers).toHaveLength(2);

    await database.delete(users).where(
      inArray(
        users.id,
        orderedUsers.map((user) => user.id),
      ),
    );
  });
});
