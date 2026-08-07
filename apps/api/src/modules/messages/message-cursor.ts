import { entityIdSchema } from '@event-chat/contracts';
import { z } from 'zod';

const cursorPayloadSchema = z.object({
  createdAt: z.iso.datetime(),
  id: entityIdSchema,
});

export interface MessageCursor {
  createdAt: Date;
  id: string;
}

export function encodeMessageCursor(cursor: MessageCursor): string {
  return Buffer.from(
    JSON.stringify({
      createdAt: cursor.createdAt.toISOString(),
      id: cursor.id,
    }),
  ).toString('base64url');
}

export function decodeMessageCursor(cursor: string): MessageCursor | undefined {
  try {
    const payload = cursorPayloadSchema.parse(
      JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')),
    );

    return { createdAt: new Date(payload.createdAt), id: payload.id };
  } catch {
    return undefined;
  }
}
