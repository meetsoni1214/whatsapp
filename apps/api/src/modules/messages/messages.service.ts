import { BadRequestException, Injectable } from '@nestjs/common';
import type {
  Message,
  MessageHistoryQuery,
  MessagePage,
} from '@event-chat/contracts';
import { ConversationsService } from '../conversations/conversations.service';
import { decodeMessageCursor, encodeMessageCursor } from './message-cursor';
import { MessagesRepository, type MessageRow } from './messages.repository';

@Injectable()
export class MessagesService {
  constructor(
    private readonly repository: MessagesRepository,
    private readonly conversations: ConversationsService,
  ) {}

  async history(
    conversationId: string,
    userId: string,
    query: MessageHistoryQuery,
  ): Promise<MessagePage> {
    await this.conversations.assertMember(conversationId, userId);

    const cursor = query.cursor ? decodeMessageCursor(query.cursor) : undefined;
    if (query.cursor && !cursor) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: 'The message cursor is invalid',
      });
    }

    const rows = await this.repository.findPage(
      conversationId,
      cursor,
      query.limit + 1,
    );
    const hasMore = rows.length > query.limit;
    const pageRows = rows.slice(0, query.limit);
    const oldest = pageRows.at(-1);

    return {
      data: pageRows.map((row) => this.toMessage(row)),
      nextCursor:
        hasMore && oldest
          ? encodeMessageCursor({ id: oldest.id, createdAt: oldest.createdAt })
          : null,
    };
  }

  private toMessage(row: MessageRow): Message {
    return {
      id: row.id,
      conversationId: row.conversationId,
      senderId: row.senderId,
      clientMessageId: row.clientMessageId,
      content: row.content,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
