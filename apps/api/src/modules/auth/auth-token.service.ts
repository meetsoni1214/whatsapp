import { createHash, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  entityIdSchema,
  type PublicUser,
  usernameSchema,
} from '@event-chat/contracts';
import { JwtService } from '@nestjs/jwt';
import { z } from 'zod';
import type { Environment } from '../../config/environment';
import { REFRESH_TOKEN_BYTES } from './auth.constants';
import type { RefreshToken } from './auth.types';

const accessTokenPayloadSchema = z.object({
  sub: entityIdSchema,
  username: usernameSchema,
});

@Injectable()
export class AuthTokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Environment, true>,
  ) {}

  issueAccessToken(user: PublicUser): Promise<string> {
    return this.jwt.signAsync({
      sub: user.id,
      username: user.username,
    });
  }

  async verifyAccessToken(token: string): Promise<PublicUser> {
    const payload = accessTokenPayloadSchema.parse(
      await this.jwt.verifyAsync<Record<string, unknown>>(token),
    );

    return {
      id: payload.sub,
      username: payload.username,
    };
  }

  createRefreshToken(): RefreshToken {
    const days = this.config.get('REFRESH_SESSION_TTL_DAYS', { infer: true });
    const value = randomBytes(REFRESH_TOKEN_BYTES).toString('base64url');

    return {
      value,
      tokenHash: this.hashRefreshToken(value),
      expiresAt: new Date(Date.now() + days * 24 * 60 * 60 * 1000),
    };
  }

  hashRefreshToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
