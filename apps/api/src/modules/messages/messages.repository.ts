import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, lt, or } from 'drizzle-orm';
import { DATABASE } from '../../database/database.constants';
import { messages } from '../../database/schema';
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
}
