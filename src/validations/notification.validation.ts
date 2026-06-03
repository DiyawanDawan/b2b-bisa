import { z } from 'zod';
import { DevicePlatform } from '#prisma';

export const registerTokenSchema = z.object({
  body: z.object({
    fcmToken: z.string().min(1, 'Token FCM wajib diisi'),
    platform: z.nativeEnum(DevicePlatform).optional().default(DevicePlatform.WEB),
  }),
});
