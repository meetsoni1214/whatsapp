import { BadRequestException } from '@nestjs/common';
import { ConversationsService } from '../conversations/conversations.service';
import { MessagesRepository } from './messages.repository';
import { MessagesService } from './messages.service';

describe('MessagesService', () => {
  const conversationId = '426aa224-2ec1-4530-898c-d0c48f8b59c9';
  const userId = '1685bc61-ac88-45e7-8437-593219fefb10';
  let repository: {
    findPage: jest.MockedFunction<MessagesRepository['findPage']>;
  };
  let conversations: {
    assertMember: jest.MockedFunction<ConversationsService['assertMember']>;
  };
  let service: MessagesService;

  beforeEach(() => {
    repository = { findPage: jest.fn() };
    conversations = { assertMember: jest.fn() };
    service = new MessagesService(
      repository as unknown as MessagesRepository,
      conversations as unknown as ConversationsService,
    );
  });

  it('authorizes membership before loading messages', async () => {
    conversations.assertMember.mockRejectedValue(new Error('denied'));

    await expect(
      service.history(conversationId, userId, { limit: 50 }),
    ).rejects.toThrow('denied');
    expect(repository.findPage).not.toHaveBeenCalled();
  });

  it('rejects malformed cursors', async () => {
    await expect(
      service.history(conversationId, userId, {
        limit: 50,
        cursor: 'invalid',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('returns newest-first data and a cursor when another row exists', async () => {
    const createdAt = new Date('2026-08-02T08:00:00.000Z');
    repository.findPage.mockResolvedValue(
      [
        '30000000-0000-4000-8000-000000000000',
        '20000000-0000-4000-8000-000000000000',
        '10000000-0000-4000-8000-000000000000',
      ].map((id) => ({
        id,
        conversationId,
        senderId: userId,
        clientMessageId: id,
        content: id,
        createdAt,
      })),
    );

    const page = await service.history(conversationId, userId, { limit: 2 });

    expect(page.data.map((message) => message.id)).toEqual([
      '30000000-0000-4000-8000-000000000000',
      '20000000-0000-4000-8000-000000000000',
    ]);
    expect(page.nextCursor).not.toBeNull();
    expect(repository.findPage).toHaveBeenCalledWith(
      conversationId,
      undefined,
      3,
    );
  });
});
