import { z } from 'zod';
import { RfqStatus, BookingStatus, ReferralRewardStatus, LiveSessionStatus } from '#prisma';
import {
  paginationQuerySchema,
  queryBoolean,
  idParamSchema,
} from '#validations/admin-query.validation';

export { idParamSchema };

const reasonRequired = (min = 10, max = 500) =>
  z
    .string()
    .trim()
    .min(min, `Alasan minimal ${min} karakter`)
    .max(max, `Alasan maksimal ${max} karakter`);

const optionalNote = z.string().trim().max(2000).optional();

/* -------------------------------------------------------------------------- */
/* RFQ management                                                             */
/* -------------------------------------------------------------------------- */
export const adminListRfqsSchema = paginationQuerySchema.extend({
  status: z.nativeEnum(RfqStatus).optional(),
  productMode: z.enum(['BIOMASS_MATERIAL', 'ORGANIC_PRODUCE']).optional(),
  isFlagged: queryBoolean,
  expired: queryBoolean,
});

export const adminRfqStatusSchema = z.object({
  status: z.nativeEnum(RfqStatus, { message: 'Status RFQ tidak valid' }),
  reason: reasonRequired(5),
});

export const adminRfqCancelSchema = z.object({
  reason: reasonRequired(10),
});

export const adminRfqFlagSchema = z.object({
  flagged: z.boolean(),
  reason: z.string().trim().max(500).optional(),
});

/* -------------------------------------------------------------------------- */
/* Booking management                                                         */
/* -------------------------------------------------------------------------- */
export const adminListBookingsSchema = paginationQuerySchema.extend({
  status: z.nativeEnum(BookingStatus).optional(),
  hasDispute: queryBoolean,
});

export const adminBookingStatusSchema = z.object({
  status: z.nativeEnum(BookingStatus, { message: 'Status booking tidak valid' }),
  reason: reasonRequired(5),
});

export const adminBookingCancelSchema = z.object({
  reason: reasonRequired(10),
});

export const adminBookingRescheduleSchema = z
  .object({
    expiresAt: z.string().datetime({ message: 'expiresAt harus ISO datetime' }).optional(),
    expectedDeliveryDate: z
      .string()
      .datetime({ message: 'expectedDeliveryDate harus ISO datetime' })
      .nullable()
      .optional(),
    reason: reasonRequired(5),
  })
  .refine((data) => data.expiresAt !== undefined || data.expectedDeliveryDate !== undefined, {
    message: 'Minimal satu tanggal (expiresAt / expectedDeliveryDate) harus diisi',
  });

/* -------------------------------------------------------------------------- */
/* Review moderation                                                          */
/* -------------------------------------------------------------------------- */
export const adminListReviewsSchema = paginationQuerySchema.extend({
  rating: z.preprocess(
    (v) => (v === undefined || v === null || v === '' ? undefined : Number(v)),
    z.number().int().min(1).max(5).optional(),
  ),
  status: z.enum(['visible', 'hidden', 'flagged']).optional(),
  productId: z.string().uuid().optional(),
});

export const adminReviewHideSchema = z.object({
  reason: reasonRequired(10),
});

export const adminReviewFlagSchema = z.object({
  flagged: z.boolean(),
  reason: z.string().trim().max(500).optional(),
});

/* -------------------------------------------------------------------------- */
/* Referral management                                                        */
/* -------------------------------------------------------------------------- */
export const adminListReferralsSchema = paginationQuerySchema.extend({
  status: z.nativeEnum(ReferralRewardStatus).optional(),
  suspicious: queryBoolean,
});

export const adminReferralDecisionSchema = z.object({
  reason: reasonRequired(5),
});

/* -------------------------------------------------------------------------- */
/* Live commerce                                                              */
/* -------------------------------------------------------------------------- */
export const adminListLiveSessionsSchema = paginationQuerySchema.extend({
  status: z.nativeEnum(LiveSessionStatus).optional(),
  supplierId: z.string().uuid().optional(),
});

export const adminLiveTerminateSchema = z.object({
  reason: reasonRequired(5),
});

export const adminLiveStatusSchema = z.object({
  status: z.nativeEnum(LiveSessionStatus, { message: 'Status live tidak valid' }),
  reason: z.string().trim().max(500).optional(),
});

export const adminLivePinProductsSchema = z.object({
  pinnedProductIds: z.array(z.string().uuid()).max(10),
  reason: optionalNote,
});

export const adminLiveCommentModerateSchema = z.object({
  reason: reasonRequired(5),
});

export const liveCommentParamSchema = z.object({
  id: z.string().uuid('ID tidak valid'),
  commentId: z.string().uuid('Comment ID tidak valid'),
});
