import { z } from 'zod';
import { ProductCertificateStatus } from '#prisma';

const optionalDate = z.preprocess(
  (value) => (value === '' || value == null ? undefined : value),
  z.coerce.date().optional(),
);

export const productIdParamSchema = z.object({
  productId: z.string().uuid(),
});

export const certificateParamSchema = z.object({
  productId: z.string().uuid(),
  certificateId: z.string().uuid(),
});

export const certificateIdParamSchema = z.object({
  certificateId: z.string().uuid(),
});

export const supplierIdParamSchema = z.object({
  id: z.string().uuid(),
});

export const listPublicSupplierCertificatesSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const submitStoreCertificateSchema = submitCertificateSchema;

export const submitCertificateSchema = z
  .object({
    title: z.string().trim().min(2).max(120),
    certificateType: z.string().trim().min(2).max(80),
    issuerName: z.string().trim().max(120).optional(),
    certificateNumber: z.string().trim().max(120).optional(),
    issuedAt: optionalDate,
    expiresAt: optionalDate,
    storageKey: z.string().trim().min(1),
  })
  .refine((data) => !data.issuedAt || !data.expiresAt || data.expiresAt > data.issuedAt, {
    path: ['expiresAt'],
    message: 'Tanggal kedaluwarsa harus setelah tanggal terbit.',
  });

export const listCertificateQueueSchema = z.object({
  status: z.nativeEnum(ProductCertificateStatus).optional(),
  search: z.string().trim().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const reviewCertificateSchema = z
  .object({
    status: z.enum([ProductCertificateStatus.APPROVED, ProductCertificateStatus.REJECTED]),
    rejectionReason: z.string().trim().max(1000).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.status === ProductCertificateStatus.REJECTED && !data.rejectionReason) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['rejectionReason'],
        message: 'Alasan penolakan wajib diisi.',
      });
    }
  });
