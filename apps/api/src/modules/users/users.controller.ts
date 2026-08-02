import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  userSearchQuerySchema,
  type PublicUser,
  type UserSearchQuery,
} from '@event-chat/contracts';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AccessTokenGuard } from '../auth/access-token.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { UsersService } from './users.service';

@Controller('users')
@UseGuards(AccessTokenGuard)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('me')
  me(@CurrentUser() user: PublicUser): Promise<PublicUser> {
    return this.users.findMe(user.id);
  }

  @Get('search')
  search(
    @CurrentUser() user: PublicUser,
    @Query(new ZodValidationPipe(userSearchQuerySchema)) query: UserSearchQuery,
  ): Promise<PublicUser[]> {
    return this.users.search(user.id, query);
  }
}
