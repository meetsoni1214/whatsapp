import { z } from 'zod';

export const entityIdSchema = z.uuid();
export const requestIdSchema = z.uuid();
export const eventIdSchema = z.uuid();
export const timestampSchema = z.iso.datetime();

export const apiErrorCodeSchema = z.enum([
  'AUTHENTICATION_REQUIRED',
  'FORBIDDEN',
  'NOT_FOUND',
  'VALIDATION_FAILED',
  'CONFLICT',
  'INTERNAL_ERROR',
]);

export const apiErrorSchema = z.object({
  code: apiErrorCodeSchema,
  message: z.string().min(1),
  requestId: requestIdSchema,
  details: z.record(z.string(), z.unknown()).optional(),
});

export const healthResponseSchema = z.object({
  service: z.literal('event-chat-api'),
  status: z.literal('ok'),
  timestamp: timestampSchema,
});

export const cursorPageSchema = <TItem extends z.ZodType>(
  itemSchema: TItem,
) =>
  z.object({
    data: z.array(itemSchema),
    nextCursor: z.string().min(1).nullable(),
  });

export type ApiErrorCode = z.infer<typeof apiErrorCodeSchema>;
export type ApiError = z.infer<typeof apiErrorSchema>;
export type HealthResponse = z.infer<typeof healthResponseSchema>;
export type CursorPage<T> = {
  data: T[];
  nextCursor: string | null;
};
