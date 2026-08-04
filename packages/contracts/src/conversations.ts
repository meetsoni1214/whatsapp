import { z } from 'zod';
import { publicUserSchema } from './auth';
import {
  cursorPageSchema,
  entityIdSchema,
  timestampSchema,
} from './common';

export const createDirectConversationInputSchema = z.object({
  participantId: entityIdSchema,
});

export const directConversationSchema = z.object({
  id: entityIdSchema,
  type: z.literal('direct'),
  participant: publicUserSchema,
  createdAt: timestampSchema,
  lastMessageAt: timestampSchema.nullable(),
});

export const directConversationsSchema = z.array(directConversationSchema);

export const conversationParamsSchema = z.object({
  conversationId: entityIdSchema,
});

export const messageSchema = z.object({
  id: entityIdSchema,
  conversationId: entityIdSchema,
  senderId: entityIdSchema,
  clientMessageId: entityIdSchema,
  content: z.string().min(1).max(4096),
  createdAt: timestampSchema,
});

export const messageHistoryQuerySchema = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().positive().max(100).default(50),
});

export const messagePageSchema = cursorPageSchema(messageSchema);

export type CreateDirectConversationInput = z.infer<
  typeof createDirectConversationInputSchema
>;
export type DirectConversation = z.infer<typeof directConversationSchema>;
export type ConversationParams = z.infer<typeof conversationParamsSchema>;
export type Message = z.infer<typeof messageSchema>;
export type MessageHistoryQuery = z.infer<typeof messageHistoryQuerySchema>;
export type MessagePage = z.infer<typeof messagePageSchema>;
