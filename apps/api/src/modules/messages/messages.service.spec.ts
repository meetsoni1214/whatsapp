import { BadRequestException } from '@nestjs/common';
import { ConversationsService } from '../conversations/conversations.service';
import { MessagesRepository } from './messages.repository';
import { MessagesService } from './messages.service';

describe('MessagesService', () => {
  const conversationId = '426aa224-2ec1-4530-898c-d0c48f8b59c9';
  const userId = '1685bc61-ac88-45e7-8437-593219fefb10';
  let repository: {
    createIdempotent: jest.MockedFunction<
      MessagesRepository['createIdempotent']
    >;
    findPage: jest.MockedFunction<MessagesRepository['findPage']>;
  };
  let conversations: {
    assertMember: jest.MockedFunction<ConversationsService['assertMember']>;
    memberIds: jest.MockedFunction<ConversationsService['memberIds']>;
  };
  let service: MessagesService;

  beforeEach(() => {
    repository = { createIdempotent: jest.fn(), findPage: jest.fn() };
    conversations = { assertMember: jest.fn(), memberIds: jest.fn() };
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

  it('creates an authorized message and returns its delivery members', async () => {
    const row = {
      id: '30000000-0000-4000-8000-000000000000',
      conversationId,
      senderId: userId,
      clientMessageId: '20000000-0000-4000-8000-000000000000',
      content: 'hello',
      createdAt: new Date('2026-08-02T08:00:00.000Z'),
    };
    repository.createIdempotent.mockResolvedValue({ inserted: true, row });
    conversations.memberIds.mockResolvedValue([userId]);

    const result = await service.create(userId, {
      conversationId,
      clientMessageId: row.clientMessageId,
      content: row.content,
    });

    expect(conversations.assertMember).toHaveBeenCalledWith(
      conversationId,
      userId,
    );
    expect(result).toMatchObject({
      inserted: true,
      memberIds: [userId],
      message: { id: row.id, content: 'hello' },
    });
  });

  it('rejects reuse of a client message ID with different content', async () => {
    repository.createIdempotent.mockResolvedValue({
      inserted: false,
      row: {
        id: '30000000-0000-4000-8000-000000000000',
        conversationId,
        senderId: userId,
        clientMessageId: '20000000-0000-4000-8000-000000000000',
        content: 'original',
        createdAt: new Date(),
      },
    });

    await expect(
      service.create(userId, {
        conversationId,
        clientMessageId: '20000000-0000-4000-8000-000000000000',
        content: 'changed',
      }),
    ).rejects.toMatchObject({ status: 409 });
    expect(conversations.memberIds).not.toHaveBeenCalled();
  });
});
