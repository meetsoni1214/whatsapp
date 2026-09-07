import { Injectable } from '@nestjs/common';
import { typingTiming, type TypingUpdatedFrame } from '@event-chat/contracts';
import type { RealtimeConnection } from './realtime-connections.service';

export interface TypingUpdate {
  payload: TypingUpdatedFrame['payload'];
  peerIds: string[];
}

interface Lease {
  expiresAt: number;
  timer: NodeJS.Timeout;
}

interface TypingGroup {
  peerIds: string[];
  connections: Map<RealtimeConnection, Lease>;
}

@Injectable()
export class TypingService {
  private readonly conversations = new Map<string, Map<string, TypingGroup>>();
  private readonly listeners = new Set<(update: TypingUpdate) => void>();
  private stopped = false;

  subscribe(listener: (update: TypingUpdate) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  refresh(
    connection: RealtimeConnection,
    conversationId: string,
    peerIds: string[],
  ): void {
    if (this.stopped || !connection.user) return;
    const userId = connection.user.id;
    const users =
      this.conversations.get(conversationId) ?? new Map<string, TypingGroup>();
    const group = users.get(userId) ?? {
      peerIds,
      connections: new Map<RealtimeConnection, Lease>(),
    };
    const previous = group.connections.get(connection);
    if (previous) clearTimeout(previous.timer);

    const lease: Lease = {
      expiresAt: performance.now() + typingTiming.expiryMs,
      timer: setTimeout(() => {
        // A cancelled callback must not delete a newer refresh.
        if (group.connections.get(connection) !== lease) return;
        this.stop(connection, conversationId);
      }, typingTiming.expiryMs),
    };
    lease.timer.unref();
    group.connections.set(connection, lease);
    group.peerIds = peerIds;
    users.set(userId, group);
    this.conversations.set(conversationId, users);
    // Renew receivers' display deadlines even if the visible boolean is unchanged.
    this.emit(conversationId, userId, true, peerIds);
  }

  stop(connection: RealtimeConnection, conversationId: string): void {
    if (!connection.user) return;
    const userId = connection.user.id;
    const users = this.conversations.get(conversationId);
    const group = users?.get(userId);
    const lease = group?.connections.get(connection);
    if (!group || !lease) return;
    clearTimeout(lease.timer);
    group.connections.delete(connection);

    // Prune expired siblings as well, so simultaneous expiries emit one stop.
    for (const [other, entry] of group.connections) {
      if (entry.expiresAt <= performance.now()) {
        clearTimeout(entry.timer);
        group.connections.delete(other);
      }
    }
    if (group.connections.size > 0) return;
    users!.delete(userId);
    if (users!.size === 0) this.conversations.delete(conversationId);
    this.emit(conversationId, userId, false, group.peerIds);
  }

  disconnect(connection: RealtimeConnection): void {
    for (const conversationId of this.conversations.keys()) {
      this.stop(connection, conversationId);
    }
  }

  shutdown(): void {
    this.stopped = true;
    for (const users of this.conversations.values()) {
      for (const group of users.values()) {
        for (const lease of group.connections.values())
          clearTimeout(lease.timer);
      }
    }
    this.conversations.clear();
    this.listeners.clear();
  }

  private emit(
    conversationId: string,
    userId: string,
    isTyping: boolean,
    peerIds: string[],
  ): void {
    const update: TypingUpdate = {
      payload: { conversationId, userId, isTyping },
      peerIds,
    };
    for (const listener of this.listeners) listener(update);
  }
}
