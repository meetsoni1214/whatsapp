import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type {
  LoginInput,
  PublicUser,
  RegisterInput,
} from '@event-chat/contracts';
import { UsernameAlreadyExistsError } from './auth.errors';
import { AuthRepository } from './auth.repository';
import { AuthTokenService } from './auth-token.service';
import type { IssuedSession, RefreshToken } from './auth.types';
import { PasswordHasher } from './password-hasher';

@Injectable()
export class AuthService {
  constructor(
    private readonly repository: AuthRepository,
    private readonly passwords: PasswordHasher,
    private readonly tokens: AuthTokenService,
  ) {}

  async register(input: RegisterInput): Promise<IssuedSession> {
    const passwordHash = await this.passwords.hash(input.password);
    const refreshToken = this.tokens.createRefreshToken();

    let user: PublicUser;
    try {
      user = await this.repository.createUserWithSession(
        { username: input.username, passwordHash },
        refreshToken,
      );
    } catch (error) {
      if (error instanceof UsernameAlreadyExistsError) {
        throw new ConflictException({
          code: 'CONFLICT',
          message: 'That username is already registered',
        });
      }

      throw error;
    }

    return this.createIssuedSession(user, refreshToken);
  }

  async login(input: LoginInput): Promise<IssuedSession> {
    const user = await this.repository.findUserWithPassword(input.username);

    if (
      !user ||
      !(await this.passwords.verify(user.passwordHash, input.password))
    ) {
      throw this.invalidCredentials();
    }

    const refreshToken = this.tokens.createRefreshToken();
    await this.repository.createSession(user.id, refreshToken);

    return this.createIssuedSession(user, refreshToken);
  }

  async refresh(refreshToken: string | undefined): Promise<IssuedSession> {
    if (!refreshToken) throw this.invalidSession();

    const nextRefreshToken = this.tokens.createRefreshToken();
    const user = await this.repository.rotateSession(
      this.tokens.hashRefreshToken(refreshToken),
      new Date(),
      nextRefreshToken,
    );

    if (!user) throw this.invalidSession();
    return this.createIssuedSession(user, nextRefreshToken);
  }

  async logout(refreshToken: string | undefined): Promise<void> {
    if (!refreshToken) return;

    await this.repository.revokeSession(
      this.tokens.hashRefreshToken(refreshToken),
      new Date(),
    );
  }

  private async createIssuedSession(
    user: PublicUser,
    refreshToken: RefreshToken,
  ): Promise<IssuedSession> {
    return {
      body: {
        accessToken: await this.tokens.issueAccessToken(user),
        user,
      },
      refreshToken: refreshToken.value,
      refreshExpiresAt: refreshToken.expiresAt,
    };
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
}
