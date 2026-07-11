import { z } from 'zod';
import { BiomassaType } from '#prisma';

export const predictSchema = z.object({
  biomassaType: z.nativeEnum(BiomassaType, { required_error: 'Tipe biomassa diperlukan' }),
  suhuPirolisis: z.number().min(50, 'Suhu minimal 50°C').max(1000, 'Suhu maksimal 1000°C'),
  waktuPembakaran: z
    .number()
    .min(10, 'Waktu minimal 10 menit')
    .max(1440, 'Waktu maksimal 1440 menit (24 jam)'),
  beratInput: z
    .number()
    .min(1, 'Berat input minimal 1 kg')
    .max(100000, 'Berat input tidak realistis'),
});

export const chatbotSchema = z.object({
  question: z
    .string()
    .min(5, 'Pertanyaan minimal 5 karakter')
    .max(500, 'Pertanyaan maksimal 500 karakter'),
});

export const recentPredictionsQuerySchema = z.object({
  query: z.object({
    limit: z.coerce.number().int().min(1).max(50).optional().default(20),
    iotOnly: z.preprocess((v) => v === 'true' || v === true, z.boolean().optional().default(false)),
  }),
});

export const generateProductDescriptionSchema = z.object({
  imageBase64: z
    .string({ required_error: 'imageBase64 wajib diisi' })
    .min(100, 'Data gambar tidak valid')
    // Pastikan tidak ada prefix data URI — cukup data base64 mentah
    .refine((v) => !v.startsWith('data:'), {
      message: 'Kirim hanya konten base64 tanpa prefix "data:image/..."',
    }),
  mimeType: z
    .string()
    .regex(
      /^image\/(jpeg|png|webp|gif)$/,
      'mimeType harus image/jpeg, image/png, image/webp, atau image/gif',
    )
    .optional()
    .default('image/jpeg'),
});
