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

export interface PresenceTransition {
  occurredAt: Date;
  revision: number;
  user: PublicUser;
}

@Injectable()
export class RealtimeConnectionsService {
  private readonly connections = new Map<WebSocket, RealtimeConnection>();
  private readonly connectionsByUser = new Map<
    string,
    Set<RealtimeConnection>
  >();
  private readonly presenceRevisions = new Map<string, number>();

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

  authenticate(
    connection: RealtimeConnection,
    user: PublicUser,
  ): PresenceTransition | null {
    connection.user = user;
    const userConnections =
      this.connectionsByUser.get(user.id) ?? new Set<RealtimeConnection>();
    const wasOffline = userConnections.size === 0;
    userConnections.add(connection);
    this.connectionsByUser.set(user.id, userConnections);

    return wasOffline ? this.transition(user) : null;
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

  isOnline(userId: string): boolean {
    return (this.connectionsByUser.get(userId)?.size ?? 0) > 0;
  }

  isCurrent(userId: string, revision: number): boolean {
    return this.presenceRevisions.get(userId) === revision;
  }

  onlineUserIds(): string[] {
    return [...this.connectionsByUser.keys()];
  }

  remove(socket: WebSocket): PresenceTransition | null {
    const connection = this.connections.get(socket);
    if (!connection) return null;

    if (connection.authTimer) clearTimeout(connection.authTimer);
    if (connection.expiryTimer) clearTimeout(connection.expiryTimer);
    if (connection.user) {
      const userConnections = this.connectionsByUser.get(connection.user.id);
      userConnections?.delete(connection);
      if (userConnections?.size === 0) {
        this.connectionsByUser.delete(connection.user.id);
        this.connections.delete(socket);
        return this.transition(connection.user);
      }
    }

    this.connections.delete(socket);
    return null;
  }

  closeAll(code: number, reason: string): void {
    for (const connection of this.connections.values()) {
      connection.socket.close(code, reason);
      this.remove(connection.socket);
    }
  }

  private transition(user: PublicUser): PresenceTransition {
    const revision = (this.presenceRevisions.get(user.id) ?? 0) + 1;
    this.presenceRevisions.set(user.id, revision);
    return { occurredAt: new Date(), revision, user };
  }
}
