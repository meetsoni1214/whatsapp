import { Injectable } from '@nestjs/common';
import type { PresenceState } from '@event-chat/contracts';
import { ConversationsService } from '../conversations/conversations.service';
import { UsersService } from '../users/users.service';
import {
  type PresenceTransition,
  type RealtimeConnection,
  RealtimeConnectionsService,
} from './realtime-connections.service';

export interface PresenceBroadcast {
  occurredAt: string;
  recipients: RealtimeConnection[];
  state: PresenceState;
}

@Injectable()
export class PresenceService {
  constructor(
    private readonly conversations: ConversationsService,
    private readonly users: UsersService,
    private readonly connections: RealtimeConnectionsService,
  ) {}

  async online(
    transition: PresenceTransition,
  ): Promise<PresenceBroadcast | null> {
    const peerIds = await this.conversations.peerIdsForUser(transition.user.id);
    if (
      !this.connections.isCurrent(transition.user.id, transition.revision) ||
      !this.connections.isOnline(transition.user.id)
    ) {
      return null;
    }

    return this.broadcast(transition, peerIds, true, null);
  }

  async offline(
    transition: PresenceTransition,
  ): Promise<PresenceBroadcast | null> {
    const [, peerIds] = await Promise.all([
      this.users.updateLastSeenAt(transition.user.id, transition.occurredAt),
      this.conversations.peerIdsForUser(transition.user.id),
    ]);
    if (
      !this.connections.isCurrent(transition.user.id, transition.revision) ||
      this.connections.isOnline(transition.user.id)
    ) {
      return null;
    }

    return this.broadcast(
      transition,
      peerIds,
      false,
      transition.occurredAt.toISOString(),
    );
  }

  async persistShutdown(userIds: string[], occurredAt: Date): Promise<void> {
    await Promise.all(
      userIds.map((userId) => this.users.updateLastSeenAt(userId, occurredAt)),
    );
  }

  private broadcast(
    transition: PresenceTransition,
    peerIds: string[],
    online: boolean,
    lastSeenAt: string | null,
  ): PresenceBroadcast {
    return {
      occurredAt: transition.occurredAt.toISOString(),
      recipients: this.connections.forUsers(peerIds),
      state: { userId: transition.user.id, online, lastSeenAt },
    };
  }
}
