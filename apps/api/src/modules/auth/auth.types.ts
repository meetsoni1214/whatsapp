import type { PublicUser } from '@event-chat/contracts';
import type { Request } from 'express';

export interface AccessTokenPayload {
  sub: string;
  username: string;
}

export interface AuthenticatedRequest extends Request {
  user: PublicUser;
}
