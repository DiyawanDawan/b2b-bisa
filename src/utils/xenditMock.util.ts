import { PaymentMethod } from '#prisma';
import { decryptJsonValue } from '#utils/encryption.util';
import { mapMethodToPaymentKey, mapMethodToXenditType } from '#utils/paymentMethod.util';
import { isXenditForbiddenError } from '#utils/xenditError.util';
import { isXenditWebhookDevMode } from '#utils/xenditWebhookDev.util';

export type MockPaymentBuildInput = {
  orderId: string;
  orderNumber: string;
  externalId: string;
  amount: number;
  channelCode: string;
  channelName: string;
  methodGroup: PaymentMethod;
  customerName?: string | null;
};

/** Paksa semua inisialisasi bayar memakai mock (tanpa panggil Xendit). */
export const isXenditMockPaymentEnabled = (): boolean =>
  process.env.XENDIT_MOCK_PAYMENT?.trim().toLowerCase() === 'true';

/**
 * Saat Xendit 403 (key tanpa permission), development boleh pakai VA/QR simulasi.
 * Default aktif di non-production. Set `XENDIT_MOCK_ON_FORBIDDEN=false` untuk mematikan.
 */
export const shouldUseXenditMockOnForbidden = (err: unknown): boolean => {
  if (!isXenditForbiddenError(err)) return false;
  if (isXenditWebhookDevMode()) return false;
  const flag = process.env.XENDIT_MOCK_ON_FORBIDDEN?.trim().toLowerCase();
  if (flag === 'true') return true;
  if (flag === 'false') return false;
  return process.env.NODE_ENV !== 'production';
};

export const buildMockPaymentInitResult = (input: MockPaymentBuildInput) => {
  const xenditType = mapMethodToXenditType(input.methodGroup);
  const paymentMethodKey = mapMethodToPaymentKey(xenditType);
  const upperCode = input.channelCode.toUpperCase();
  const mockRequestId = `mock-pr-${input.orderId.replace(/-/g, '').slice(0, 12)}`;

  const digits = input.orderNumber.replace(/\D/g, '').padStart(10, '0').slice(-10);
  const vaNumber = `8808${digits}`;

  const channelProperties: Record<string, unknown> = {};
  const paymentData: Record<string, unknown> = {};

  if (xenditType === 'VIRTUAL_ACCOUNT') {
    channelProperties.virtual_account_number = vaNumber;
    channelProperties.customer_name = input.customerName || 'BISA Buyer';
    paymentData.virtual_account_number = vaNumber;
  } else if (xenditType === 'QR_CODE') {
    const qrPayload = `MOCK-QR-${input.externalId}-${input.amount}`;
    channelProperties.qr_string = qrPayload;
    paymentData.qrString = qrPayload;
    paymentData.qr_string = qrPayload;
  } else if (xenditType === 'EWALLET') {
    const base = process.env.CORS_ORIGINS?.split(',')[0] || 'http://localhost:3000';
    paymentData.redirectUrl = `${base}/payment/success?mock=1`;
  } else {
    channelProperties.payment_code = `MOCK${digits}`;
    paymentData.payment_code = channelProperties.payment_code;
  }

  const providerActions = {
    id: mockRequestId,
    reference_id: input.externalId,
    status: 'PENDING',
    payment_method: {
      type: xenditType,
      [paymentMethodKey]: {
        channel_code: upperCode,
        channel_properties: channelProperties,
      },
    },
    actions: [],
    _mock: true,
  };

  const response: Record<string, unknown> = {
    mode: 'DIRECT',
    paymentRequestId: mockRequestId,
    paymentType: xenditType,
    channelCode: upperCode,
    channelName: input.channelName,
    paymentData: { ...channelProperties, ...paymentData },
    amount: input.amount,
    isMockPayment: true,
    mockMessage:
      'Pembayaran simulasi (development). API key Xendit belum punya izin Invoices/Payment Requests. ' +
      'Aktifkan permission di Dashboard, atau gunakan endpoint mock-confirm untuk menandai lunas.',
  };

  return { providerActions, response };
};

export const isMockProviderActions = (providerActions: unknown): boolean => {
  const decoded = decryptJsonValue(providerActions);
  if (!decoded || typeof decoded !== 'object') return false;
  return (decoded as Record<string, unknown>)._mock === true;
};
