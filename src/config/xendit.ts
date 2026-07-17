import dotenv from 'dotenv';
import { Xendit } from 'xendit-node';
import {
  PaymentMethodReusability,
  PaymentRequestCurrency,
  type PaymentRequest as XenditPaymentRequest,
  type PaymentRequestParameters,
  type PaymentMethodParameters,
  type PaymentSimulation,
  type VirtualAccountChannelCode,
  type VirtualAccountChannelProperties,
  type QRCodeChannelCode,
  type QRCodeChannelProperties,
  type EWalletChannelCode,
  type EWalletChannelProperties,
  type OverTheCounterChannelCode,
  type OverTheCounterChannelProperties,
} from '#xendit/payment_request/models';
import {
  CreateRefundReasonEnum as RefundReason,
  type Refund,
  type CreateRefundReasonEnum,
} from '#xendit/refund/models';
import type { CreatePayoutRequest, GetPayouts200ResponseDataInner } from '#xendit/payout/models';
import { PaymentMethod } from '#prisma';
import { mapMethodToXenditType } from '#utils/paymentMethod.util';
import { roundIdrAmount } from '#utils/currency.util';

dotenv.config();

// Prefer XENDIT_PAYMENT_SECRET_KEY (CI/CD + docker-compose.prod),
// fallback ke XENDIT_SECRET_KEY (legacy / single-key setup).
const XENDIT_SECRET_KEY =
  process.env.XENDIT_PAYMENT_SECRET_KEY || process.env.XENDIT_SECRET_KEY;
const XENDIT_WEBHOOK_TOKEN = process.env.XENDIT_WEBHOOK_TOKEN;

// Fail fast in production if credentials are missing
if (!XENDIT_SECRET_KEY) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'FATAL: XENDIT_PAYMENT_SECRET_KEY (or legacy XENDIT_SECRET_KEY) must be set in production. Payment features will not work.',
    );
  }
  console.warn(
    'WARN: XENDIT_PAYMENT_SECRET_KEY / XENDIT_SECRET_KEY not set. Payment features will be disabled in development.',
  );
}

if (!XENDIT_WEBHOOK_TOKEN && process.env.NODE_ENV === 'production') {
  throw new Error(
    'FATAL: XENDIT_WEBHOOK_TOKEN must be set in production environment for webhook security.',
  );
}

// Initialize Xendit Client (may fail if key is missing/invalid)
export const xenditClient = new Xendit({
  secretKey: XENDIT_SECRET_KEY || 'xendit_development_only',
});

// SEC-BE-024: fungsi `verifyWebhookToken` lama (non-constant-time) DIHAPUS untuk
// hindari pemakaian salah di masa depan. Verifikasi aktual ada di
// `payment.service.ts` yang sudah pakai `crypto.timingSafeEqual` dengan
// XENDIT_WEBHOOK_TOKEN.

// ==================== Payment Request API (v3) ====================

export const createPaymentRequest = async (params: {
  reference_id: string;
  amount: number;
  currency?: string;
  channel_code: string;
  method: PaymentMethod;
  channel_properties?: Record<string, unknown>;
  description?: string;
  metadata?: Record<string, unknown>;
}): Promise<XenditPaymentRequest> => {
  const xenditType = mapMethodToXenditType(params.method);

  const paymentMethod: PaymentMethodParameters = {
    type: xenditType,
    reusability: PaymentMethodReusability.OneTimeUse,
    referenceId: params.reference_id,
    description: params.description,
  };

  if (xenditType === 'VIRTUAL_ACCOUNT') {
    paymentMethod.virtualAccount = {
      channelCode: params.channel_code as unknown as VirtualAccountChannelCode,
      channelProperties: params.channel_properties as unknown as VirtualAccountChannelProperties,
    };
  } else if (xenditType === 'QR_CODE') {
    paymentMethod.qrCode = {
      channelCode: params.channel_code as unknown as QRCodeChannelCode,
      channelProperties: params.channel_properties as unknown as QRCodeChannelProperties,
    };
  } else if (xenditType === 'EWALLET') {
    paymentMethod.ewallet = {
      channelCode: params.channel_code as unknown as EWalletChannelCode,
      channelProperties: params.channel_properties as unknown as EWalletChannelProperties,
    };
  } else if (xenditType === 'OVER_THE_COUNTER') {
    paymentMethod.overTheCounter = {
      channelCode: params.channel_code as unknown as OverTheCounterChannelCode,
      channelProperties: params.channel_properties as unknown as OverTheCounterChannelProperties,
    };
  }

  const data: PaymentRequestParameters = {
    referenceId: params.reference_id,
    currency: (params.currency as PaymentRequestCurrency | undefined) || PaymentRequestCurrency.Idr,
    amount: roundIdrAmount(params.amount),
    paymentMethod,
    metadata: params.metadata,
  };

  return await xenditClient.PaymentRequest.createPaymentRequest({
    data,
  });
};

export const getPaymentRequestStatus = async (id: string): Promise<XenditPaymentRequest> => {
  return await xenditClient.PaymentRequest.getPaymentRequestByID({
    paymentRequestId: id,
  });
};

export const simulatePayment = async (id: string, _amount: number): Promise<PaymentSimulation> => {
  return await xenditClient.PaymentRequest.simulatePaymentRequestPayment({
    paymentRequestId: id,
  });
};

export const refundPayment = async (
  id: string,
  amount: number,
  reason: string,
): Promise<Refund> => {
  const normalizedReason = reason.toUpperCase();
  const refundReason = (Object.values(RefundReason) as string[]).includes(normalizedReason)
    ? (normalizedReason as CreateRefundReasonEnum)
    : RefundReason.Others;

  return await xenditClient.Refund.createRefund({
    data: {
      paymentRequestId: id,
      amount,
      reason: refundReason,
    },
  });
};

// ==================== Payout API (v2) ====================

export const createPayout = async (params: {
  reference_id: string;
  channel_code: string;
  account_holder_name: string;
  account_number: string;
  amount: number;
  description?: string;
  currency?: string;
  metadata?: Record<string, unknown>;
}): Promise<GetPayouts200ResponseDataInner> => {
  const data: CreatePayoutRequest = {
    referenceId: params.reference_id,
    channelCode: params.channel_code,
    channelProperties: {
      accountHolderName: params.account_holder_name,
      accountNumber: params.account_number,
    },
    amount: params.amount,
    description: params.description || 'Penarikan dana',
    currency: params.currency || 'IDR',
    metadata: params.metadata,
  };

  return await xenditClient.Payout.createPayout({
    idempotencyKey: params.reference_id,
    data,
  });
};

export const getPayoutById = async (id: string): Promise<GetPayouts200ResponseDataInner> => {
  return await xenditClient.Payout.getPayoutById({
    id,
  });
};

export const cancelPayout = async (id: string): Promise<GetPayouts200ResponseDataInner> => {
  return await xenditClient.Payout.cancelPayout({
    id,
  });
};
