/**
 * Zod Schema Type Exports
 *
 * This file exports TypeScript types inferred from Zod validation schemas.
 * These types can be shared with the frontend to ensure type safety
 * across the API contract.
 *
 * Usage in Frontend:
 * import type { LoginInput, RegisterInput } from '@/types/api-contract';
 */

import type { z } from 'zod';

// Import all validation schemas
import * as authValidation from '#validations/auth.validation';
import * as productValidation from '#validations/product.validation';
import * as orderValidation from '#validations/order.validation';
import * as negotiationValidation from '#validations/negotiation.validation';
import * as financeValidation from '#validations/finance.validation';
import * as adminValidation from '#validations/admin.validation';
import * as forumValidation from '#validations/forum.validation';
import * as articleValidation from '#validations/article.validation';
import * as reviewValidation from '#validations/review.validation';

// ==========================================
// AUTH TYPES
// ==========================================

export type LoginInput = z.infer<typeof authValidation.loginSchema>;
export type RegisterSupplierInput = z.infer<typeof authValidation.registerSupplierSchema>;
export type RegisterBuyerInput = z.infer<typeof authValidation.registerBuyerSchema>;
export type VerifyRegistrationInput = z.infer<typeof authValidation.verifyRegistrationSchema>;
export type SocialLoginInput = z.infer<typeof authValidation.socialLoginSchema>;
export type RefreshTokenInput = z.infer<typeof authValidation.refreshTokenSchema>;
export type ForgotPasswordInput = z.infer<typeof authValidation.forgotPasswordSchema>;
export type VerifyResetCodeInput = z.infer<typeof authValidation.verifyResetCodeSchema>;
export type ResetPasswordWithTokenInput = z.infer<
  typeof authValidation.resetPasswordWithTokenSchema
>;
export type ResetPasswordInput = z.infer<typeof authValidation.resetPasswordSchema>;
export type UpdateProfileInput = z.infer<typeof authValidation.updateProfileSchema>;
export type RequestPhoneUpdateInput = z.infer<typeof authValidation.requestPhoneUpdateSchema>;
export type VerifyPhoneUpdateInput = z.infer<typeof authValidation.verifyPhoneUpdateSchema>;
export type SubmitVerificationInput = z.infer<typeof authValidation.submitVerificationSchema>;
export type ResendOtpInput = z.infer<typeof authValidation.resendOtpSchema>;
export type CheckEmailInput = z.infer<typeof authValidation.checkEmailSchema>;

// ==========================================
// PRODUCT TYPES
// ==========================================

export type CreateProductInput = z.infer<typeof productValidation.createProductSchema>;
export type UpdateProductInput = z.infer<typeof productValidation.updateProductSchema>;
export type ProductFilterInput = z.infer<typeof productValidation.productFilterSchema>;

// ==========================================
// ORDER TYPES
// ==========================================

export type CreateContractInput = z.infer<typeof orderValidation.createContractSchema>;
export type UpdateTrackingInput = z.infer<typeof orderValidation.updateTrackingSchema>;
export type InitializePaymentInput = z.infer<typeof orderValidation.initializePaymentSchema>;
export type RaiseDisputeInput = z.infer<typeof orderValidation.raiseDisputeSchema>;
export type ListOrdersInput = z.infer<typeof orderValidation.listOrdersSchema>;

// ==========================================
// NEGOTIATION TYPES
// ==========================================

export type CreateNegotiationInput = z.infer<typeof negotiationValidation.createNegotiationSchema>;
export type UpdateNegotiationStatusInput = z.infer<
  typeof negotiationValidation.updateNegotiationStatusSchema
>;
export type ChatMessageInput = z.infer<typeof negotiationValidation.chatMessageSchema>;
export type ListNegotiationsInput = z.infer<typeof negotiationValidation.listNegotiationsSchema>;

// ==========================================
// FINANCE TYPES
// ==========================================

export type WithdrawRequestInput = z.infer<typeof financeValidation.withdrawRequestSchema>;
export type CreatePayoutAccountInput = z.infer<typeof financeValidation.createPayoutAccountSchema>;
export type GetWalletHistoryInput = z.infer<typeof financeValidation.getWalletHistorySchema>;

// ==========================================
// ADMIN TYPES
// ==========================================

export type UpdateUserStatusInput = z.infer<typeof adminValidation.updateUserStatusSchema>;
export type UpdateKYCInput = z.infer<typeof adminValidation.updateKYCSchema>;
export type CertifyProductInput = z.infer<typeof adminValidation.certifyProductSchema>;
export type ModerateProductInput = z.infer<typeof adminValidation.moderateProductSchema>;
export type CategoryInput = z.infer<typeof adminValidation.categorySchema>;
export type FeeInput = z.infer<typeof adminValidation.feeSchema>;
export type UpdateFeeInput = z.infer<typeof adminValidation.updateFeeSchema>;
export type ResolveDisputeInput = z.infer<typeof adminValidation.resolveDisputeSchema>;
export type BroadcastInput = z.infer<typeof adminValidation.broadcastSchema>;
export type ApprovePayoutInput = z.infer<typeof adminValidation.approvePayoutSchema>;

// ==========================================
// FORUM TYPES
// ==========================================

export type CreatePostInput = z.infer<typeof forumValidation.createPostSchema>;
export type CreateCommentInput = z.infer<typeof forumValidation.createCommentSchema>;
export type VoteInput = z.infer<typeof forumValidation.voteSchema>;
export type PaginationInput = z.infer<typeof forumValidation.paginationSchema>;

// ==========================================
// ARTICLE TYPES
// ==========================================

export type CreateArticleInput = z.infer<typeof articleValidation.createArticleSchema>;
export type UpdateArticleInput = z.infer<typeof articleValidation.updateArticleSchema>;
export type GetArticleInput = z.infer<typeof articleValidation.getArticleSchema>;
export type ListArticlesInput = z.infer<typeof articleValidation.listArticlesSchema>;

// ==========================================
// REVIEW TYPES
// ==========================================

export type CreateReviewInput = z.infer<typeof reviewValidation.createReviewSchema>;

// ==========================================
// STANDARD API RESPONSE TYPES
// ==========================================

/**
 * Standard API Response Envelope
 * All endpoints should return this structure
 */
export interface ApiResponse<T = any> {
  meta: {
    success: boolean;
    status: number;
    message: string;
  };
  data: T | null;
  pagination?: PaginationMeta;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/**
 * Error response with field-level validation errors
 */
export interface ApiError {
  meta: {
    success: false;
    status: number;
    message: string;
  };
  data:
    | {
        field?: string;
        message: string;
      }[]
    | null;
}
