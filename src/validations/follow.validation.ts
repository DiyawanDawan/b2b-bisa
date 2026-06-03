import { z } from 'zod';

export const toggleFollowSchema = z.object({
  userId: z.string().uuid('ID user tidak valid.'),
});
