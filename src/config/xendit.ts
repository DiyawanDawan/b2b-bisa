import dotenv from 'dotenv';
import { Xendit } from 'xendit-node';
import type {
  PaymentRequest as XenditPaymentRequest,
  PaymentRequestParameters,
  PaymentMethodParameters,
} from 'xendit-node/payment_request/models';
import type { CreatePayoutRequest } from 'xendit-node/payout/models';
import { PaymentMethod } from '#prisma';
import { mapMethodToXenditType } from '#utils/paymentMethod.util';

dotenv.config();

const XENDIT_SECRET_KEY = process.env.XENDIT_SECRET_KEY!;
const XENDIT_WEBHOOK_TOKEN = process.env.XENDIT_WEBHOOK_TOKEN!;

if (!XENDIT_SECRET_KEY) {
  console.error('FATAL: Missing XENDIT_SECRET_KEY in .env file');
  process.exit(1);
}

// Initialize Xendit Client
export const xenditClient = new Xendit({
  secretKey: XENDIT_SECRET_KEY,
});

const API_VERSION = '2024-11-11';

// Verify webhook token from Xendit
export const verifyWebhookToken = (token: string): boolean => {
  return token === XENDIT_WEBHOOK_TOKEN;
};

// ==================== Payment Request API (v3) ====================

export const createPaymentRequest = async (params: {
  reference_id: string;
  amount: number;
  currency?: string;
  channel_code: string;
  method: PaymentMethod;
  channel_properties?: any;
  description?: string;
  metadata?: Record<string, any>;
}): Promise<XenditPaymentRequest> => {
  const xenditType = mapMethodToXenditType(params.method);

  const paymentMethod: PaymentMethodParameters = {
    type: xenditType,
    reusability: 'ONE_TIME_USE' as any,
    referenceId: params.reference_id,
    description: params.description,
  };

  if (xenditType === 'VIRTUAL_ACCOUNT') {
    paymentMethod.virtualAccount = {
      channelCode: params.channel_code as any,
      channelProperties: params.channel_properties,
    };
  } else if (xenditType === 'QR_CODE') {
    paymentMethod.qrCode = {
      channelCode: params.channel_code as any,
      channelProperties: params.channel_properties,
    };
  } else if (xenditType === 'EWALLET') {
    paymentMethod.ewallet = {
      channelCode: params.channel_code as any,
      channelProperties: params.channel_properties,
    };
  } else if (xenditType === 'OVER_THE_COUNTER') {
    paymentMethod.overTheCounter = {
      channelCode: params.channel_code as any,
      channelProperties: params.channel_properties,
    };
  }

  const data: PaymentRequestParameters = {
    referenceId: params.reference_id,
    currency: (params.currency as any) || 'IDR',
    amount: params.amount,
    paymentMethod,
    metadata: params.metadata,
  };

  return await xenditClient.PaymentRequest.createPaymentRequest({
    data,
    apiVersion: API_VERSION,
  } as any);
};

export const getPaymentRequestStatus = async (id: string): Promise<XenditPaymentRequest> => {
  return await xenditClient.PaymentRequest.getPaymentRequestByID({
    paymentRequestId: id,
  });
};

export const simulatePayment = async (id: string, _amount: number): Promise<any> => {
  return await xenditClient.PaymentRequest.simulatePaymentRequestPayment({
    paymentRequestId: id,
  });
};

export const refundPayment = async (id: string, amount: number, reason: string): Promise<any> => {
  return await xenditClient.Refund.createRefund({
    data: {
      paymentRequestId: id,
      amount,
      reason: reason as any,
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
  metadata?: Record<string, any>;
}): Promise<any> => {
  const data: CreatePayoutRequest = {
    referenceId: params.reference_id,
    channelCode: params.channel_code,
    channelProperties: {
      accountHolderName: params.account_holder_name,
      accountNumber: params.account_number,
    },
    amount: params.amount,
    description: params.description || 'Penarikan dana',
    currency: (params.currency as any) || 'IDR',
    metadata: params.metadata,
  };

  return await xenditClient.Payout.createPayout({
    idempotencyKey: params.reference_id,
    data,
  });
};

export const getPayoutById = async (id: string): Promise<any> => {
  return await xenditClient.Payout.getPayoutById({
    id,
  });
};

export const cancelPayout = async (id: string): Promise<any> => {
  return await xenditClient.Payout.cancelPayout({
    id,
  });
};
