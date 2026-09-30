import { z } from 'zod';
import { userSchema } from '../entities/user.ts';

export const loginRequestSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const currentUserResponseSchema = z.object({ user: userSchema });
export type CurrentUserResponse = z.infer<typeof currentUserResponseSchema>;
