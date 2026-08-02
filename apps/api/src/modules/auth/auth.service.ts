import { createHash, randomBytes } from 'node:crypto';
import {
  ConflictException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  AuthenticatedSession,
  LoginInput,
  PublicUser,
  RegisterInput,
} from '@event-chat/contracts';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { and, eq, gt, isNull } from 'drizzle-orm';
import type { Environment } from '../../config/environment';
import { DATABASE } from '../../database/database.constants';
import { authSessions, users } from '../../database/schema';
import type { Database } from '../../database/database.types';
import { REFRESH_TOKEN_BYTES } from './auth.constants';

interface IssuedSession {
  body: AuthenticatedSession;
  refreshToken: string;
  refreshExpiresAt: Date;
}

@Injectable()
export class AuthService {
  constructor(
    @Inject(DATABASE) private readonly database: Database,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Environment, true>,
  ) {}

  async register(input: RegisterInput): Promise<IssuedSession> {
    const passwordHash = await argon2.hash(input.password, {
      type: argon2.argon2id,
      memoryCost: 19_456,
      timeCost: 2,
      parallelism: 1,
    });

    const refresh = this.newRefreshToken();
    let user: PublicUser;
    try {
      user = await this.database.transaction(async (transaction) => {
        const [createdUser] = await transaction
          .insert(users)
          .values({ username: input.username, passwordHash })
          .returning({ id: users.id, username: users.username });

        await transaction.insert(authSessions).values({
          userId: createdUser.id,
          refreshTokenHash: this.hashRefreshToken(refresh.token),
          expiresAt: refresh.expiresAt,
        });

        return createdUser;
      });
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException({
          code: 'CONFLICT',
          message: 'That username is already registered',
        });
      }
      throw error;
    }

    return {
      body: await this.createResponse(user),
      refreshToken: refresh.token,
      refreshExpiresAt: refresh.expiresAt,
    };
  }

  async login(input: LoginInput): Promise<IssuedSession> {
    const [record] = await this.database
      .select({
        id: users.id,
        username: users.username,
        passwordHash: users.passwordHash,
      })
      .from(users)
      .where(eq(users.username, input.username))
      .limit(1);

    if (
      !record ||
      !(await argon2.verify(record.passwordHash, input.password))
    ) {
      throw this.invalidCredentials();
    }

    return this.issueSession({ id: record.id, username: record.username });
  }

  async refresh(refreshToken: string | undefined): Promise<IssuedSession> {
    if (!refreshToken) throw this.invalidSession();

    const now = new Date();
    const tokenHash = this.hashRefreshToken(refreshToken);
    const rotated = await this.database.transaction(async (transaction) => {
      const [session] = await transaction
        .update(authSessions)
        .set({ revokedAt: now })
        .where(
          and(
            eq(authSessions.refreshTokenHash, tokenHash),
            isNull(authSessions.revokedAt),
            gt(authSessions.expiresAt, now),
          ),
        )
        .returning({ userId: authSessions.userId });

      if (!session) throw this.invalidSession();

      const [user] = await transaction
        .select({ id: users.id, username: users.username })
        .from(users)
        .where(eq(users.id, session.userId))
        .limit(1);

      if (!user) throw this.invalidSession();

      const next = this.newRefreshToken();
      await transaction.insert(authSessions).values({
        userId: user.id,
        refreshTokenHash: this.hashRefreshToken(next.token),
        expiresAt: next.expiresAt,
      });

      return { user, ...next };
    });

    return {
      body: await this.createResponse(rotated.user),
      refreshToken: rotated.token,
      refreshExpiresAt: rotated.expiresAt,
    };
  }

  async logout(refreshToken: string | undefined): Promise<void> {
    if (!refreshToken) return;

    await this.database
      .update(authSessions)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(
            authSessions.refreshTokenHash,
            this.hashRefreshToken(refreshToken),
          ),
          isNull(authSessions.revokedAt),
        ),
      );
  }

  private async issueSession(user: PublicUser): Promise<IssuedSession> {
    const refresh = this.newRefreshToken();

    await this.database.insert(authSessions).values({
      userId: user.id,
      refreshTokenHash: this.hashRefreshToken(refresh.token),
      expiresAt: refresh.expiresAt,
    });

    return {
      body: await this.createResponse(user),
      refreshToken: refresh.token,
      refreshExpiresAt: refresh.expiresAt,
    };
  }

  private async createResponse(
    user: PublicUser,
  ): Promise<AuthenticatedSession> {
    return {
      accessToken: await this.jwt.signAsync({
        sub: user.id,
        username: user.username,
      }),
      user,
    };
  }

  private newRefreshToken(): { token: string; expiresAt: Date } {
    const days = this.config.get('REFRESH_SESSION_TTL_DAYS', { infer: true });
    return {
      token: randomBytes(REFRESH_TOKEN_BYTES).toString('base64url'),
      expiresAt: new Date(Date.now() + days * 24 * 60 * 60 * 1000),
    };
  }

  private hashRefreshToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private invalidCredentials(): UnauthorizedException {
    return new UnauthorizedException({
      code: 'AUTHENTICATION_REQUIRED',
      message: 'Username or password is incorrect',
    });
  }

  private invalidSession(): UnauthorizedException {
    return new UnauthorizedException({
      code: 'AUTHENTICATION_REQUIRED',
      message: 'Refresh session is missing, expired, or already used',
    });
  }

  private isUniqueViolation(error: unknown): boolean {
    let current = error;

    for (let depth = 0; depth < 3; depth += 1) {
      if (typeof current !== 'object' || current === null) return false;
      if ('code' in current && current.code === '23505') return true;
      current = 'cause' in current ? current.cause : undefined;
    }

    return false;
  }
}
