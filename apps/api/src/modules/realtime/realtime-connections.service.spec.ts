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

    service.authenticate(firstConnection, alice);
    service.authenticate(secondConnection, alice);

    expect(service.forUsers([alice.id])).toEqual([
      firstConnection,
      secondConnection,
    ]);

    service.remove(first);
    expect(service.forUsers([alice.id])).toEqual([secondConnection]);

    service.remove(second);
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
