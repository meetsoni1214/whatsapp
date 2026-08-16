import type { AuthenticatedSession, PublicUser } from '@event-chat/contracts';
import type { Request } from 'express';

export interface AuthenticatedRequest extends Request {
  user: PublicUser;
}

export interface IssuedSession {
  body: AuthenticatedSession;
  refreshExpiresAt: Date;
  refreshToken: string;
}

export interface NewRefreshSession {
  expiresAt: Date;
  tokenHash: string;
}

export interface RefreshToken extends NewRefreshSession {
  value: string;
}

export interface VerifiedAccessToken {
  expiresAt: Date;
  user: PublicUser;
}

export interface UserWithPassword extends PublicUser {
  passwordHash: string;
}
