import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  CreateDirectConversationInput,
  DirectConversation,
} from '@event-chat/contracts';
import { ConversationsRepository } from './conversations.repository';

@Injectable()
export class ConversationsService {
  constructor(private readonly repository: ConversationsRepository) {}

  async createDirect(
    currentUserId: string,
    input: CreateDirectConversationInput,
  ): Promise<DirectConversation> {
    if (currentUserId === input.participantId) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: 'A direct conversation requires another user',
      });
    }

    if (!(await this.repository.participantExists(input.participantId))) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'The requested participant was not found',
      });
    }

    const conversationId = await this.repository.createDirectConversation(
      currentUserId,
      input.participantId,
    );
    const conversation = await this.repository.findDirectByIdForUser(
      conversationId,
      currentUserId,
    );

    if (!conversation) {
      throw new Error('Created direct conversation could not be loaded');
    }

    return conversation;
  }

  list(currentUserId: string): Promise<DirectConversation[]> {
    return this.repository.listDirectForUser(currentUserId);
  }

  async assertMember(conversationId: string, userId: string): Promise<void> {
    const access = await this.repository.conversationAccess(
      conversationId,
      userId,
    );

    if (access === 'missing') {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'The requested conversation was not found',
      });
    }

    if (access === 'forbidden') {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'You are not a member of this conversation',
      });
    }
  }

  memberIds(conversationId: string): Promise<string[]> {
    return this.repository.memberIds(conversationId);
  }
}
