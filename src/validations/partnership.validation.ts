import { z } from 'zod';

export const createPartnershipSchema = z.object({
  supplierId: z.string().uuid('ID supplier tidak valid.'),
  title: z.string().min(5, 'Judul kontrak minimal 5 karakter.').max(200),
  description: z.string().max(2000).optional(),
  productCategory: z.string().max(120).optional(),
  estimatedMonthlyQty: z.number().positive('Estimasi kuantitas harus positif.').optional(),
  priceAgreement: z.string().max(2000).optional(),
  deliveryTerms: z.string().max(2000).optional(),
  paymentTerms: z.string().max(2000).optional(),
  specialTerms: z.string().max(2000).optional(),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  tier: z.enum(['MAIN_PARTNER', 'PREFERRED', 'STANDARD']).optional(),
  originatingNegotiationId: z.string().uuid().optional(),
  originatingOrderId: z.string().uuid().optional(),
});

export const partnershipIdParamSchema = z.object({
  id: z.string().uuid('ID partnership tidak valid.'),
});

export const rejectPartnershipSchema = z.object({
  reason: z.string().min(5, 'Alasan penolakan minimal 5 karakter.').max(500),
});

export const terminatePartnershipSchema = z.object({
  reason: z.string().max(500).optional(),
});

export const checkSupplierParamSchema = z.object({
  supplierId: z.string().uuid('ID supplier tidak valid.'),
});

export const verifyContractParamSchema = z.object({
  contractNumber: z.string().min(8, 'Nomor kontrak tidak valid.'),
});

export const listPartnershipsQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(50).optional(),
  status: z
    .enum([
      'PENDING',
      'AWAITING_SIGNATURE',
      'ACTIVE',
      'REJECTED',
      'TERMINATED',
      'EXPIRED',
      'RENEWAL_PENDING',
    ])
    .optional(),
});

export const renewPartnershipSchema = z.object({
  newEndDate: z.coerce.date(),
  note: z.string().max(500).optional(),
});

export const rejectRenewalSchema = z.object({
  reason: z.string().max(500).optional(),
});
