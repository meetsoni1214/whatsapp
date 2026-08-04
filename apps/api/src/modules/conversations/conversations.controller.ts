import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  createDirectConversationInputSchema,
  type CreateDirectConversationInput,
  type DirectConversation,
  type PublicUser,
} from '@event-chat/contracts';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AccessTokenGuard } from '../auth/access-token.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { ConversationsService } from './conversations.service';

@Controller('conversations')
@UseGuards(AccessTokenGuard)
export class ConversationsController {
  constructor(private readonly conversations: ConversationsService) {}

  @Post('direct')
  @HttpCode(200)
  createDirect(
    @CurrentUser() user: PublicUser,
    @Body(new ZodValidationPipe(createDirectConversationInputSchema))
    input: CreateDirectConversationInput,
  ): Promise<DirectConversation> {
    return this.conversations.createDirect(user.id, input);
  }

  @Get()
  list(@CurrentUser() user: PublicUser): Promise<DirectConversation[]> {
    return this.conversations.list(user.id);
  }
}
