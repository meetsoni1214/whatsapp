import { Inject, Injectable } from '@nestjs/common';
import type { DirectConversation } from '@event-chat/contracts';
import { and, desc, eq, or, sql } from 'drizzle-orm';
import { DATABASE } from '../../database/database.constants';
import {
  conversationMembers,
  conversations,
  directConversations,
  users,
} from '../../database/schema';
import type { Database } from '../../database/database.types';

type ConversationAccess = 'forbidden' | 'member' | 'missing';

interface DirectConversationRow {
  createdAt: Date;
  id: string;
  lastMessageAt: Date | null;
  participantId: string;
  participantUsername: string;
}

@Injectable()
export class ConversationsRepository {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async participantExists(userId: string): Promise<boolean> {
    const [user] = await this.database
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    return Boolean(user);
  }

  async createDirectConversation(
    currentUserId: string,
    participantId: string,
  ): Promise<string> {
    const [userLowId, userHighId] = [currentUserId, participantId].sort();

    return this.database.transaction(async (transaction) => {
      const [candidate] = await transaction
        .insert(conversations)
        .values({ type: 'direct' })
        .returning({ id: conversations.id });

      const [pair] = await transaction
        .insert(directConversations)
        .values({
          conversationId: candidate.id,
          userLowId,
          userHighId,
        })
        .onConflictDoUpdate({
          target: [
            directConversations.userLowId,
            directConversations.userHighId,
          ],
          set: { userLowId },
        })
        .returning({ conversationId: directConversations.conversationId });

      if (pair.conversationId !== candidate.id) {
        await transaction
          .delete(conversations)
          .where(eq(conversations.id, candidate.id));
      }

      await transaction
        .insert(conversationMembers)
        .values([
          { conversationId: pair.conversationId, userId: userLowId },
          { conversationId: pair.conversationId, userId: userHighId },
        ])
        .onConflictDoNothing();

      return pair.conversationId;
    });
  }

  async findDirectByIdForUser(
    conversationId: string,
    currentUserId: string,
  ): Promise<DirectConversation | undefined> {
    const [conversation] = await this.directConversationQuery(currentUserId)
      .where(eq(conversations.id, conversationId))
      .limit(1);

    return conversation ? this.toDirectConversation(conversation) : undefined;
  }

  async listDirectForUser(
    currentUserId: string,
  ): Promise<DirectConversation[]> {
    const rows = await this.directConversationQuery(currentUserId)
      .where(eq(conversationMembers.userId, currentUserId))
      .orderBy(
        desc(
          sql`coalesce(${conversations.lastMessageAt}, ${conversations.createdAt})`,
        ),
        desc(conversations.id),
      );

    return rows.map((row) => this.toDirectConversation(row));
  }

  async conversationAccess(
    conversationId: string,
    userId: string,
  ): Promise<ConversationAccess> {
    const [row] = await this.database
      .select({
        conversationId: conversations.id,
        memberId: conversationMembers.userId,
      })
      .from(conversations)
      .leftJoin(
        conversationMembers,
        and(
          eq(conversationMembers.conversationId, conversations.id),
          eq(conversationMembers.userId, userId),
        ),
      )
      .where(eq(conversations.id, conversationId))
      .limit(1);

    if (!row) return 'missing';
    return row.memberId ? 'member' : 'forbidden';
  }

  private directConversationQuery(currentUserId: string) {
    return this.database
      .select({
        id: conversations.id,
        createdAt: conversations.createdAt,
        lastMessageAt: conversations.lastMessageAt,
        participantId: users.id,
        participantUsername: users.username,
      })
      .from(conversations)
      .innerJoin(
        conversationMembers,
        eq(conversationMembers.conversationId, conversations.id),
      )
      .innerJoin(
        directConversations,
        eq(directConversations.conversationId, conversations.id),
      )
      .innerJoin(
        users,
        or(
          and(
            eq(directConversations.userLowId, currentUserId),
            eq(users.id, directConversations.userHighId),
          ),
          and(
            eq(directConversations.userHighId, currentUserId),
            eq(users.id, directConversations.userLowId),
          ),
        ),
      );
  }

  private toDirectConversation(row: DirectConversationRow): DirectConversation {
    return {
      id: row.id,
      type: 'direct',
      participant: {
        id: row.participantId,
        username: row.participantUsername,
      },
      createdAt: row.createdAt.toISOString(),
      lastMessageAt: row.lastMessageAt?.toISOString() ?? null,
    };
  }
}
