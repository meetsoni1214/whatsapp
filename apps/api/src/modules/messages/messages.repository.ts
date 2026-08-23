import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, lt, or, sql } from 'drizzle-orm';
import { DATABASE } from '../../database/database.constants';
import { conversations, messages } from '../../database/schema';
import type { Database } from '../../database/database.types';
import type { MessageCursor } from './message-cursor';

export interface MessageRow {
  clientMessageId: string;
  content: string;
  conversationId: string;
  createdAt: Date;
  id: string;
  senderId: string;
}

export interface CreateMessageInput {
  clientMessageId: string;
  content: string;
  conversationId: string;
  senderId: string;
}

export interface PersistedMessage {
  inserted: boolean;
  row: MessageRow;
}

@Injectable()
export class MessagesRepository {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  findPage(
    conversationId: string,
    cursor: MessageCursor | undefined,
    pageSize: number,
  ): Promise<MessageRow[]> {
    const cursorCondition = cursor
      ? or(
          lt(messages.createdAt, cursor.createdAt),
          and(
            eq(messages.createdAt, cursor.createdAt),
            lt(messages.id, cursor.id),
          ),
        )
      : undefined;

    return this.database
      .select({
        id: messages.id,
        conversationId: messages.conversationId,
        senderId: messages.senderId,
        clientMessageId: messages.clientMessageId,
        content: messages.content,
        createdAt: messages.createdAt,
      })
      .from(messages)
      .where(and(eq(messages.conversationId, conversationId), cursorCondition))
      .orderBy(desc(messages.createdAt), desc(messages.id))
      .limit(pageSize);
  }

  createIdempotent(input: CreateMessageInput): Promise<PersistedMessage> {
    return this.database.transaction(async (transaction) => {
      const [inserted] = await transaction
        .insert(messages)
        .values(input)
        .onConflictDoNothing({
          target: [messages.senderId, messages.clientMessageId],
        })
        .returning({
          id: messages.id,
          conversationId: messages.conversationId,
          senderId: messages.senderId,
          clientMessageId: messages.clientMessageId,
          content: messages.content,
          createdAt: messages.createdAt,
        });

      if (inserted) {
        const createdAt = inserted.createdAt.toISOString();
        await transaction
          .update(conversations)
          .set({
            lastMessageAt: sql`greatest(coalesce(${conversations.lastMessageAt}, ${createdAt}::timestamptz), ${createdAt}::timestamptz)`,
          })
          .where(eq(conversations.id, input.conversationId));

        return { inserted: true, row: inserted };
      }

      const [existing] = await transaction
        .select({
          id: messages.id,
          conversationId: messages.conversationId,
          senderId: messages.senderId,
          clientMessageId: messages.clientMessageId,
          content: messages.content,
          createdAt: messages.createdAt,
        })
        .from(messages)
        .where(
          and(
            eq(messages.senderId, input.senderId),
            eq(messages.clientMessageId, input.clientMessageId),
          ),
        )
        .limit(1);

      if (!existing) {
        throw new Error('Idempotent message could not be reloaded');
      }

      return { inserted: false, row: existing };
    });
  }
}
