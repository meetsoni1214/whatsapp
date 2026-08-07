import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import {
  conversationParamsSchema,
  messageHistoryQuerySchema,
  type ConversationParams,
  type MessageHistoryQuery,
  type MessagePage,
  type PublicUser,
} from '@event-chat/contracts';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AccessTokenGuard } from '../auth/access-token.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { MessagesService } from './messages.service';

@Controller('conversations/:conversationId/messages')
@UseGuards(AccessTokenGuard)
export class MessagesController {
  constructor(private readonly messages: MessagesService) {}

  @Get()
  history(
    @CurrentUser() user: PublicUser,
    @Param(new ZodValidationPipe(conversationParamsSchema))
    params: ConversationParams,
    @Query(new ZodValidationPipe(messageHistoryQuerySchema))
    query: MessageHistoryQuery,
  ): Promise<MessagePage> {
    return this.messages.history(params.conversationId, user.id, query);
  }
}
