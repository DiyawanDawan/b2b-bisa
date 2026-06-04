import { z } from 'zod';
import { ALLOWED_PLATFORM_SETTING_KEYS } from '#constants/platformSettings.definitions';

export const upsertPlatformSettingsSchema = z.object({
  settings: z
    .record(z.string(), z.string().max(2000))
    .refine((obj) => Object.keys(obj).length > 0, 'Minimal satu pengaturan.')
    .refine(
      (obj) => Object.keys(obj).every((k) => ALLOWED_PLATFORM_SETTING_KEYS.has(k)),
      'Terdapat key pengaturan yang tidak diizinkan.',
    ),
});
