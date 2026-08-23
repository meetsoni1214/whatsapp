import { Injectable } from '@nestjs/common';
import type { PublicUser } from '@event-chat/contracts';
import type WebSocket from 'ws';

export interface RealtimeConnection {
  alive: boolean;
  authTimer?: NodeJS.Timeout;
  expiryTimer?: NodeJS.Timeout;
  queue: Promise<void>;
  socket: WebSocket;
  user: PublicUser | null;
}

@Injectable()
export class RealtimeConnectionsService {
  private readonly connections = new Map<WebSocket, RealtimeConnection>();
  private readonly connectionsByUser = new Map<
    string,
    Set<RealtimeConnection>
  >();

  add(socket: WebSocket): RealtimeConnection {
    const connection: RealtimeConnection = {
      alive: true,
      queue: Promise.resolve(),
      socket,
      user: null,
    };
    this.connections.set(socket, connection);
    return connection;
  }

  get(socket: WebSocket): RealtimeConnection | undefined {
    return this.connections.get(socket);
  }

  authenticate(connection: RealtimeConnection, user: PublicUser): void {
    connection.user = user;
    const userConnections =
      this.connectionsByUser.get(user.id) ?? new Set<RealtimeConnection>();
    userConnections.add(connection);
    this.connectionsByUser.set(user.id, userConnections);
  }

  forUsers(userIds: string[]): RealtimeConnection[] {
    const found = new Set<RealtimeConnection>();
    for (const userId of userIds) {
      for (const connection of this.connectionsByUser.get(userId) ?? []) {
        found.add(connection);
      }
    }
    return [...found];
  }

  all(): RealtimeConnection[] {
    return [...this.connections.values()];
  }

  remove(socket: WebSocket): void {
    const connection = this.connections.get(socket);
    if (!connection) return;

    if (connection.authTimer) clearTimeout(connection.authTimer);
    if (connection.expiryTimer) clearTimeout(connection.expiryTimer);
    if (connection.user) {
      const userConnections = this.connectionsByUser.get(connection.user.id);
      userConnections?.delete(connection);
      if (userConnections?.size === 0) {
        this.connectionsByUser.delete(connection.user.id);
      }
    }

    this.connections.delete(socket);
  }

  closeAll(code: number, reason: string): void {
    for (const connection of this.connections.values()) {
      connection.socket.close(code, reason);
      this.remove(connection.socket);
    }
  }
}
