import { Inject, Injectable } from '@nestjs/common';
import type { PublicUser } from '@event-chat/contracts';
import { and, asc, eq, ilike, ne } from 'drizzle-orm';
import { DATABASE } from '../../database/database.constants';
import { users } from '../../database/schema';
import type { Database } from '../../database/database.types';

@Injectable()
export class UsersRepository {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async findPublicById(userId: string): Promise<PublicUser | undefined> {
    const [user] = await this.database
      .select({ id: users.id, username: users.username })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    return user;
  }

  searchByUsernamePrefix(
    currentUserId: string,
    prefix: string,
    limit: number,
  ): Promise<PublicUser[]> {
    const escapedPrefix = prefix.replace(/[\\%_]/g, '\\$&');

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
      .limit(limit);
  }
}
