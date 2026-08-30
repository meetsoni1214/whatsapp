import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { RealtimeConnectionsService } from '../realtime/realtime-connections.service';
import {
  ConversationsRepository,
  type DirectConversationRecord,
} from './conversations.repository';
import { ConversationsService } from './conversations.service';

const aliceId = '426aa224-2ec1-4530-898c-d0c48f8b59c9';
const bobId = '1685bc61-ac88-45e7-8437-593219fefb10';

describe('ConversationsService', () => {
  let repository: {
    conversationAccess: jest.MockedFunction<
      ConversationsRepository['conversationAccess']
    >;
    createDirectConversation: jest.MockedFunction<
      ConversationsRepository['createDirectConversation']
    >;
    findDirectByIdForUser: jest.MockedFunction<
      ConversationsRepository['findDirectByIdForUser']
    >;
    listDirectForUser: jest.MockedFunction<
      ConversationsRepository['listDirectForUser']
    >;
    participantExists: jest.MockedFunction<
      ConversationsRepository['participantExists']
    >;
  };
  let connections: {
    isOnline: jest.MockedFunction<RealtimeConnectionsService['isOnline']>;
  };
  let service: ConversationsService;

  beforeEach(() => {
    repository = {
      conversationAccess: jest.fn(),
      createDirectConversation: jest.fn(),
      findDirectByIdForUser: jest.fn(),
      listDirectForUser: jest.fn(),
      participantExists: jest.fn(),
    };
    connections = {
      isOnline: jest.fn().mockReturnValue(false),
    };
    service = new ConversationsService(
      repository as unknown as ConversationsRepository,
      connections as unknown as RealtimeConnectionsService,
    );
  });

  it('rejects a conversation with the authenticated user', async () => {
    await expect(
      service.createDirect(aliceId, { participantId: aliceId }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.createDirectConversation).not.toHaveBeenCalled();
  });

  it('rejects a participant that does not exist', async () => {
    repository.participantExists.mockResolvedValue(false);

    await expect(
      service.createDirect(aliceId, { participantId: bobId }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns the direct conversation created by the repository', async () => {
    const conversation: DirectConversationRecord = {
      id: 'af6ea967-9188-4a24-9908-81f8c0fc9443',
      participantId: bobId,
      participantUsername: 'bob',
      participantLastSeenAt: new Date('2026-08-02T07:55:00.000Z'),
      createdAt: new Date('2026-08-02T08:00:00.000Z'),
      lastMessageAt: null,
    };
    repository.participantExists.mockResolvedValue(true);
    repository.createDirectConversation.mockResolvedValue(conversation.id);
    repository.findDirectByIdForUser.mockResolvedValue(conversation);

    await expect(
      service.createDirect(aliceId, { participantId: bobId }),
    ).resolves.toEqual({
      id: conversation.id,
      type: 'direct',
      participant: { id: bobId, username: 'bob' },
      presence: {
        userId: bobId,
        online: false,
        lastSeenAt: '2026-08-02T07:55:00.000Z',
      },
      createdAt: '2026-08-02T08:00:00.000Z',
      lastMessageAt: null,
    });
  });

  it.each([
    ['missing', NotFoundException],
    ['forbidden', ForbiddenException],
  ] as const)(
    'maps %s conversation access to an HTTP error',
    async (access, error) => {
      repository.conversationAccess.mockResolvedValue(access);
      await expect(
        service.assertMember('conversation-id', aliceId),
      ).rejects.toBeInstanceOf(error);
    },
  );

  it('allows conversation members', async () => {
    repository.conversationAccess.mockResolvedValue('member');
    await expect(
      service.assertMember('conversation-id', aliceId),
    ).resolves.toBeUndefined();
  });
});
