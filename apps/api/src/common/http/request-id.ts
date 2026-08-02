import { randomUUID } from 'node:crypto';
import { requestIdSchema } from '@event-chat/contracts';
import type { NextFunction, Request, Response } from 'express';

export const REQUEST_ID_HEADER = 'x-request-id';

export interface RequestWithId extends Request {
  requestId: string;
}

export function requestIdMiddleware(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  const suppliedRequestId = request.headers[REQUEST_ID_HEADER];
  const parsedRequestId = requestIdSchema.safeParse(suppliedRequestId);
  const requestId = parsedRequestId.success
    ? parsedRequestId.data
    : randomUUID();

  (request as RequestWithId).requestId = requestId;
  response.setHeader(REQUEST_ID_HEADER, requestId);
  next();
}
