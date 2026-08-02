import { z } from 'zod';
import { entityIdSchema } from './common';

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3)
  .max(32)
  .regex(/^[a-z0-9_]+$/, {
    message: 'Username can only contain lowercase letters, numbers, and underscores',
  });

export const passwordSchema = z.string().min(8).max(128);

export const registerInputSchema = z.object({
  username: usernameSchema,
  password: passwordSchema,
});

export const loginInputSchema = z.object({
  username: usernameSchema,
  password: z.string().min(1).max(128),
});

export const publicUserSchema = z.object({
  id: entityIdSchema,
  username: usernameSchema,
});

export const authenticatedSessionSchema = z.object({
  accessToken: z.string().min(1),
  user: publicUserSchema,
});

export type RegisterInput = z.infer<typeof registerInputSchema>;
export type LoginInput = z.infer<typeof loginInputSchema>;
export type PublicUser = z.infer<typeof publicUserSchema>;
export type AuthenticatedSession = z.infer<typeof authenticatedSessionSchema>;
