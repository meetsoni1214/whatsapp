import { z } from 'zod';
import {
  apiErrorCodeSchema,
  entityIdSchema,
  eventIdSchema,
  requestIdSchema,
  timestampSchema,
} from './common';
import { publicUserSchema } from './auth';

export const protocolVersion = 1 as const;

export const authenticateFrameSchema = z.object({
  v: z.literal(protocolVersion),
  type: z.literal('auth.authenticate'),
  requestId: requestIdSchema,
  payload: z.object({
    accessToken: z.string().min(1),
  }),
});

export const sendMessageFrameSchema = z.object({
  v: z.literal(protocolVersion),
  type: z.literal('message.send'),
  requestId: requestIdSchema,
  payload: z.object({
    conversationId: entityIdSchema,
    clientMessageId: entityIdSchema,
    content: z.string().trim().min(1).max(4096),
  }),
});

export const updateReceiptFrameSchema = z.object({
  v: z.literal(protocolVersion),
  type: z.literal('receipt.update'),
  requestId: requestIdSchema,
  payload: z.object({
    messageId: entityIdSchema,
    status: z.enum(['delivered', 'read']),
  }),
});

export const setTypingFrameSchema = z.object({
  v: z.literal(protocolVersion),
  type: z.literal('typing.set'),
  requestId: requestIdSchema,
  payload: z.object({
    conversationId: entityIdSchema,
    isTyping: z.boolean(),
  }),
});

export const clientFrameSchema = z.discriminatedUnion('type', [
  authenticateFrameSchema,
  sendMessageFrameSchema,
  updateReceiptFrameSchema,
  setTypingFrameSchema,
]);

const serverEnvelopeShape = {
  v: z.literal(protocolVersion),
  eventId: eventIdSchema,
  requestId: requestIdSchema.optional(),
  occurredAt: timestampSchema,
};

export const authenticatedFrameSchema = z.object({
  ...serverEnvelopeShape,
  type: z.literal('auth.authenticated'),
  payload: z.object({
    user: publicUserSchema,
  }),
});

export const messageAcceptedFrameSchema = z.object({
  ...serverEnvelopeShape,
  type: z.literal('message.accepted'),
  payload: z.object({
    messageId: entityIdSchema,
    clientMessageId: entityIdSchema,
    conversationId: entityIdSchema,
    createdAt: timestampSchema,
  }),
});

export const messageCreatedFrameSchema = z.object({
  ...serverEnvelopeShape,
  type: z.literal('message.created'),
  payload: z.object({
    messageId: entityIdSchema,
    clientMessageId: entityIdSchema,
    conversationId: entityIdSchema,
    senderId: entityIdSchema,
    content: z.string().min(1).max(4096),
    createdAt: timestampSchema,
  }),
});

export const receiptUpdatedFrameSchema = z.object({
  ...serverEnvelopeShape,
  type: z.literal('receipt.updated'),
  payload: z.object({
    messageId: entityIdSchema,
    userId: entityIdSchema,
    status: z.enum(['sent', 'delivered', 'read']),
    updatedAt: timestampSchema,
  }),
});

export const typingUpdatedFrameSchema = z.object({
  ...serverEnvelopeShape,
  type: z.literal('typing.updated'),
  payload: z.object({
    conversationId: entityIdSchema,
    userId: entityIdSchema,
    isTyping: z.boolean(),
  }),
});

export const presenceUpdatedFrameSchema = z.object({
  ...serverEnvelopeShape,
  type: z.literal('presence.updated'),
  payload: z.object({
    userId: entityIdSchema,
    online: z.boolean(),
    lastSeenAt: timestampSchema.nullable(),
  }),
});

export const errorFrameSchema = z.object({
  ...serverEnvelopeShape,
  type: z.literal('error'),
  payload: z.object({
    code: apiErrorCodeSchema,
    message: z.string().min(1),
    details: z.record(z.string(), z.unknown()).optional(),
  }),
});

export const serverFrameSchema = z.discriminatedUnion('type', [
  authenticatedFrameSchema,
  messageAcceptedFrameSchema,
  messageCreatedFrameSchema,
  receiptUpdatedFrameSchema,
  typingUpdatedFrameSchema,
  presenceUpdatedFrameSchema,
  errorFrameSchema,
]);

export type ClientFrame = z.infer<typeof clientFrameSchema>;
export type ServerFrame = z.infer<typeof serverFrameSchema>;
export type ClientMessageType = ClientFrame['type'];
export type ServerMessageType = ServerFrame['type'];
