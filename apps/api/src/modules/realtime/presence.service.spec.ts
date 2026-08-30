import type { PublicUser } from '@event-chat/contracts';
import { ConversationsService } from '../conversations/conversations.service';
import { UsersService } from '../users/users.service';
import { PresenceService } from './presence.service';
import {
  type PresenceTransition,
  type RealtimeConnection,
  RealtimeConnectionsService,
} from './realtime-connections.service';

describe('PresenceService', () => {
  const alice: PublicUser = {
    id: '426aa224-2ec1-4530-898c-d0c48f8b59c9',
    username: 'alice',
  };
  const occurredAt = new Date('2026-08-02T08:00:00.000Z');
  const transition: PresenceTransition = {
    occurredAt,
    revision: 2,
    user: alice,
  };
  const recipient = {} as RealtimeConnection;
  let conversations: {
    peerIdsForUser: jest.MockedFunction<ConversationsService['peerIdsForUser']>;
  };
  let users: {
    updateLastSeenAt: jest.MockedFunction<UsersService['updateLastSeenAt']>;
  };
  let connections: {
    forUsers: jest.MockedFunction<RealtimeConnectionsService['forUsers']>;
    isCurrent: jest.MockedFunction<RealtimeConnectionsService['isCurrent']>;
    isOnline: jest.MockedFunction<RealtimeConnectionsService['isOnline']>;
  };
  let service: PresenceService;

  beforeEach(() => {
    conversations = {
      peerIdsForUser: jest.fn().mockResolvedValue(['bob-id']),
    };
    users = {
      updateLastSeenAt: jest.fn().mockResolvedValue(undefined),
    };
    connections = {
      forUsers: jest.fn().mockReturnValue([recipient]),
      isCurrent: jest.fn().mockReturnValue(true),
      isOnline: jest.fn().mockReturnValue(false),
    };
    service = new PresenceService(
      conversations as unknown as ConversationsService,
      users as unknown as UsersService,
      connections as unknown as RealtimeConnectionsService,
    );
  });

  it('persists a final disconnect and targets direct-conversation peers', async () => {
    await expect(service.offline(transition)).resolves.toEqual({
      occurredAt: occurredAt.toISOString(),
      recipients: [recipient],
      state: {
        userId: alice.id,
        online: false,
        lastSeenAt: occurredAt.toISOString(),
      },
    });
    expect(users.updateLastSeenAt).toHaveBeenCalledWith(alice.id, occurredAt);
    expect(conversations.peerIdsForUser).toHaveBeenCalledWith(alice.id);
    expect(connections.forUsers).toHaveBeenCalledWith(['bob-id']);
  });

  it('suppresses stale offline work after a reconnect advances the revision', async () => {
    connections.isCurrent.mockReturnValue(false);

    await expect(service.offline(transition)).resolves.toBeNull();
    expect(users.updateLastSeenAt).toHaveBeenCalled();
    expect(connections.forUsers).not.toHaveBeenCalled();
  });

  it('publishes online only while the transition remains current', async () => {
    connections.isOnline.mockReturnValue(true);

    await expect(service.online(transition)).resolves.toEqual({
      occurredAt: occurredAt.toISOString(),
      recipients: [recipient],
      state: { userId: alice.id, online: true, lastSeenAt: null },
    });
  });
});
