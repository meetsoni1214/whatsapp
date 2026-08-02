import { Injectable, UnauthorizedException } from '@nestjs/common';
import type { PublicUser, UserSearchQuery } from '@event-chat/contracts';
import { UsersRepository } from './users.repository';

@Injectable()
export class UsersService {
  constructor(private readonly repository: UsersRepository) {}

  async findMe(userId: string): Promise<PublicUser> {
    const user = await this.repository.findPublicById(userId);

    if (!user) {
      throw new UnauthorizedException({
        code: 'AUTHENTICATION_REQUIRED',
        message: 'The authenticated user no longer exists',
      });
    }

    return user;
  }

  search(currentUserId: string, query: UserSearchQuery): Promise<PublicUser[]> {
    return this.repository.searchByUsernamePrefix(
      currentUserId,
      query.q,
      query.limit,
    );
  }
}
