import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import type { PublicUser, UserSearchQuery } from '@event-chat/contracts';
import { and, asc, eq, ilike, ne } from 'drizzle-orm';
import { DATABASE } from '../../database/database.constants';
import { users } from '../../database/schema';
import type { Database } from '../../database/database.types';

@Injectable()
export class UsersService {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async findMe(userId: string): Promise<PublicUser> {
    const [user] = await this.database
      .select({ id: users.id, username: users.username })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) {
      throw new UnauthorizedException({
        code: 'AUTHENTICATION_REQUIRED',
        message: 'The authenticated user no longer exists',
      });
    }

    return user;
  }

  search(currentUserId: string, query: UserSearchQuery): Promise<PublicUser[]> {
    const escapedPrefix = query.q.replace(/[\\%_]/g, '\\$&');
    return this.database
      .select({ id: users.id, username: users.username })
      .from(users)
      .where(
        and(
          ne(users.id, currentUserId),
          ilike(users.username, `${escapedPrefix}%`),
        ),
      )
      .orderBy(asc(users.username))
      .limit(query.limit);
  }
}
