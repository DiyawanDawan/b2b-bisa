import { z } from 'zod';
import { HarvestLotStatus } from '#prisma';
import {
  paginationQuerySchema,
  queryBoolean,
  idParamSchema,
} from '#validations/admin-query.validation';

export { idParamSchema };

const storeBannerModerationStatusEnum = z.enum(['PENDING', 'APPROVED', 'REJECTED']);

const reasonRequired = (min = 5, max = 500) =>
  z.string().trim().min(min, `Alasan minimal ${min} karakter`).max(max);

/* -------------------------------------------------------------------------- */
/* Harvest lots                                                               */
/* -------------------------------------------------------------------------- */

export const adminListHarvestLotsSchema = paginationQuerySchema.extend({
  status: z.nativeEnum(HarvestLotStatus).optional(),
  productId: z.string().uuid().optional(),
  archived: queryBoolean,
});

export const adminArchiveHarvestLotSchema = z.object({
  reason: reasonRequired(5).optional(),
});

/* -------------------------------------------------------------------------- */
/* Product collections                                                        */
/* -------------------------------------------------------------------------- */

export const adminListCollectionsSchema = paginationQuerySchema.extend({
  isActive: queryBoolean,
});

export const adminCreateCollectionSchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: z
    .string()
    .trim()
    .min(2)
    .max(140)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug harus lowercase kebab-case')
    .optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  thumbnailUrl: z.string().trim().max(2000).nullable().optional(),
  isActive: z.boolean().optional().default(true),
  sortOrder: z.number().int().min(0).max(9999).optional().default(0),
  publishAt: z.coerce.date().nullable().optional(),
  unpublishAt: z.coerce.date().nullable().optional(),
});

export const adminUpdateCollectionSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    slug: z
      .string()
      .trim()
      .min(2)
      .max(140)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug harus lowercase kebab-case')
      .optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    thumbnailUrl: z.string().trim().max(2000).nullable().optional(),
    isActive: z.boolean().optional(),
    sortOrder: z.number().int().min(0).max(9999).optional(),
    publishAt: z.coerce.date().nullable().optional(),
    unpublishAt: z.coerce.date().nullable().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Minimal satu field harus diperbarui',
  });

export const adminAssignCollectionProductsSchema = z.object({
  productIds: z.array(z.string().uuid()).min(1).max(200),
  /** Replace all assignments when true; otherwise merge/append. */
  replace: z.boolean().optional().default(false),
});

export const adminReorderCollectionSchema = z.object({
  items: z
    .array(
      z.object({
        productId: z.string().uuid(),
        order: z.number().int().min(0).max(9999),
      }),
    )
    .min(1)
    .max(200),
});

/* -------------------------------------------------------------------------- */
/* Store banners                                                              */
/* -------------------------------------------------------------------------- */

export const adminListStoreBannersSchema = paginationQuerySchema.extend({
  moderationStatus: storeBannerModerationStatusEnum.optional(),
  isActive: queryBoolean,
  userId: z.string().uuid().optional(),
});

export const adminModerateStoreBannerSchema = z
  .object({
    action: z.enum(['APPROVE', 'REJECT']),
    reason: z.string().trim().max(500).optional(),
    startsAt: z.coerce.date().nullable().optional(),
    endsAt: z.coerce.date().nullable().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.action === 'REJECT' && (!data.reason || data.reason.trim().length < 5)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Alasan penolakan minimal 5 karakter',
        path: ['reason'],
      });
    }
  });

export const adminUpdateStoreBannerScheduleSchema = z
  .object({
    startsAt: z.coerce.date().nullable().optional(),
    endsAt: z.coerce.date().nullable().optional(),
    isActive: z.boolean().optional(),
    title: z.string().trim().max(200).nullable().optional(),
    sortOrder: z.number().int().min(0).max(9999).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Minimal satu field harus diperbarui',
  });

export const adminBannerHistoryQuerySchema = paginationQuerySchema;

/* -------------------------------------------------------------------------- */
/* Product Q&A                                                                */
/* -------------------------------------------------------------------------- */

export const adminListProductQuestionsSchema = paginationQuerySchema.extend({
  productId: z.string().uuid().optional(),
  answered: queryBoolean,
  isHidden: queryBoolean,
  isFlagged: queryBoolean,
});

export const adminModerateProductQuestionSchema = z.object({
  action: z.enum(['HIDE', 'RESTORE', 'FLAG', 'UNFLAG']),
  note: z.string().trim().max(500).optional(),
});

export const adminAnswerProductQuestionSchema = z.object({
  answer: z.string().trim().min(2).max(5000),
});
