import { z } from 'zod';
import {
  SupportTicketCategory,
  SupportTicketPriority,
  SupportTicketSource,
  SupportTicketStatus,
} from '#prisma';

const ticketIdParams = z.object({
  id: z.string().uuid('ID tiket tidak valid.'),
});

const transcriptMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().trim().min(1).max(2000),
});

export const createTicketSchema = z.object({
  subject: z.string().trim().min(5, 'Subjek minimal 5 karakter.').max(160),
  category: z.nativeEnum(SupportTicketCategory).optional().default(SupportTicketCategory.OTHER),
  source: z.nativeEnum(SupportTicketSource).optional().default(SupportTicketSource.HELP_CENTER),
  initialMessage: z.string().trim().min(1).max(4000).optional(),
  // Buang entri kosong agar handoff dari chat AI tidak gagal validasi.
  aiTranscript: z
    .preprocess((val) => {
      if (!Array.isArray(val)) return val;
      return val.filter(
        (item) =>
          item &&
          typeof item === 'object' &&
          typeof (item as { content?: unknown }).content === 'string' &&
          String((item as { content: string }).content).trim().length > 0,
      );
    }, z.array(transcriptMessageSchema).max(30))
    .optional(),
});

export const listTicketsQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(50).optional().default(20),
  status: z.nativeEnum(SupportTicketStatus).optional(),
});

export const ticketIdParamSchema = ticketIdParams;

export const createMessageSchema = z.object({
  content: z.string().trim().min(1, 'Pesan tidak boleh kosong.').max(4000),
});

export const adminListTicketsQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(20),
  status: z.nativeEnum(SupportTicketStatus).optional(),
  category: z.nativeEnum(SupportTicketCategory).optional(),
  priority: z.nativeEnum(SupportTicketPriority).optional(),
  assignedAdminId: z.string().uuid().optional(),
  search: z.string().trim().max(100).optional(),
});

export const updateTicketSchema = z
  .object({
    status: z.nativeEnum(SupportTicketStatus).optional(),
    priority: z.nativeEnum(SupportTicketPriority).optional(),
    assignedAdminId: z.string().uuid().nullable().optional(),
  })
  .refine(
    (value) =>
      value.status !== undefined ||
      value.priority !== undefined ||
      value.assignedAdminId !== undefined,
    'Minimal satu perubahan wajib dikirim.',
  );

export const resolveTicketSchema = z.object({
  resolutionMessage: z.string().trim().min(1).max(4000).optional(),
});
