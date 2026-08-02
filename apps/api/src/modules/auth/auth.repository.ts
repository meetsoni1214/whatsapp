import { Inject, Injectable } from '@nestjs/common';
import type { PublicUser } from '@event-chat/contracts';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { DATABASE } from '../../database/database.constants';
import { isUniqueConstraintViolation } from '../../database/postgres-errors';
import {
  authSessions,
  USERS_USERNAME_UNIQUE_CONSTRAINT,
  users,
} from '../../database/schema';
import type { Database } from '../../database/database.types';
import { UsernameAlreadyExistsError } from './auth.errors';
import type { NewRefreshSession, UserWithPassword } from './auth.types';

interface NewUser {
  passwordHash: string;
  username: string;
}

@Injectable()
export class AuthRepository {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async createUserWithSession(
    input: NewUser,
    session: NewRefreshSession,
  ): Promise<PublicUser> {
    try {
      return await this.database.transaction(async (transaction) => {
        const [createdUser] = await transaction
          .insert(users)
          .values(input)
          .returning({ id: users.id, username: users.username });

        await transaction.insert(authSessions).values({
          userId: createdUser.id,
          refreshTokenHash: session.tokenHash,
          expiresAt: session.expiresAt,
        });

        return createdUser;
      });
    } catch (error) {
      if (
        isUniqueConstraintViolation(error, USERS_USERNAME_UNIQUE_CONSTRAINT)
      ) {
        throw new UsernameAlreadyExistsError();
      }

      throw error;
    }
  }

  async findUserWithPassword(
    username: string,
  ): Promise<UserWithPassword | undefined> {
    const [user] = await this.database
      .select({
        id: users.id,
        username: users.username,
        passwordHash: users.passwordHash,
      })
      .from(users)
      .where(eq(users.username, username))
      .limit(1);

    return user;
  }

  async createSession(
    userId: string,
    session: NewRefreshSession,
  ): Promise<void> {
    await this.database.insert(authSessions).values({
      userId,
      refreshTokenHash: session.tokenHash,
      expiresAt: session.expiresAt,
    });
  }

  async rotateSession(
    currentTokenHash: string,
    now: Date,
    nextSession: NewRefreshSession,
  ): Promise<PublicUser | undefined> {
    return this.database.transaction(async (transaction) => {
      const [session] = await transaction
        .update(authSessions)
        .set({ revokedAt: now })
        .where(
          and(
            eq(authSessions.refreshTokenHash, currentTokenHash),
            isNull(authSessions.revokedAt),
            gt(authSessions.expiresAt, now),
          ),
        )
        .returning({ userId: authSessions.userId });

      if (!session) return undefined;

      const [user] = await transaction
        .select({ id: users.id, username: users.username })
        .from(users)
        .where(eq(users.id, session.userId))
        .limit(1);

      if (!user) return undefined;

      await transaction.insert(authSessions).values({
        userId: user.id,
        refreshTokenHash: nextSession.tokenHash,
        expiresAt: nextSession.expiresAt,
      });

      return user;
    });
  }

  async revokeSession(tokenHash: string, revokedAt: Date): Promise<void> {
    await this.database
      .update(authSessions)
      .set({ revokedAt })
      .where(
        and(
          eq(authSessions.refreshTokenHash, tokenHash),
          isNull(authSessions.revokedAt),
        ),
      );
  }
}
