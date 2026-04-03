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
