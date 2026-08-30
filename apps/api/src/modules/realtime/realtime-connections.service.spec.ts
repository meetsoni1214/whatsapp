import type { PublicUser } from '@event-chat/contracts';
import type WebSocket from 'ws';
import { RealtimeConnectionsService } from './realtime-connections.service';

describe('RealtimeConnectionsService', () => {
  const alice: PublicUser = {
    id: '426aa224-2ec1-4530-898c-d0c48f8b59c9',
    username: 'alice',
  };

  it('tracks every active session and removes only the closed socket', () => {
    const service = new RealtimeConnectionsService();
    const first = { close: jest.fn() } as unknown as WebSocket;
    const second = { close: jest.fn() } as unknown as WebSocket;
    const firstConnection = service.add(first);
    const secondConnection = service.add(second);

    const firstOnline = service.authenticate(firstConnection, alice);
    const secondOnline = service.authenticate(secondConnection, alice);

    expect(firstOnline).toMatchObject({ revision: 1, user: alice });
    expect(firstOnline?.occurredAt).toBeInstanceOf(Date);
    expect(secondOnline).toBeNull();
    expect(service.isOnline(alice.id)).toBe(true);
    expect(service.onlineUserIds()).toEqual([alice.id]);

    expect(service.forUsers([alice.id])).toEqual([
      firstConnection,
      secondConnection,
    ]);

    expect(service.remove(first)).toBeNull();
    expect(service.forUsers([alice.id])).toEqual([secondConnection]);

    const offline = service.remove(second);
    expect(offline).toMatchObject({ revision: 2, user: alice });
    expect(service.isCurrent(alice.id, 1)).toBe(false);
    expect(service.isCurrent(alice.id, 2)).toBe(true);
    expect(service.isOnline(alice.id)).toBe(false);
    expect(service.forUsers([alice.id])).toEqual([]);
  });

  it('deduplicates a connection when several target lists include its user', () => {
    const service = new RealtimeConnectionsService();
    const socket = { close: jest.fn() } as unknown as WebSocket;
    const connection = service.add(socket);
    service.authenticate(connection, alice);

    expect(service.forUsers([alice.id, alice.id])).toEqual([connection]);
  });
});
