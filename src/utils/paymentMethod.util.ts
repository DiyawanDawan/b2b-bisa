import { PaymentMethod } from '#prisma';
import AppError from '#utils/appError';
import type { PaymentMethodType } from 'xendit-node/payment_request/models';

const paymentMethodMap: Record<PaymentMethod, PaymentMethodType> = {
  [PaymentMethod.BANK_TRANSFER]: 'VIRTUAL_ACCOUNT',
  [PaymentMethod.E_WALLET]: 'EWALLET',
  [PaymentMethod.QRIS]: 'QR_CODE',
  [PaymentMethod.CREDIT_CARD]: 'CARD',
  [PaymentMethod.CASH]: 'OVER_THE_COUNTER',
};

const legacyAliasMap: Record<string, PaymentMethod> = {
  VA: PaymentMethod.BANK_TRANSFER,
  EWALLET: PaymentMethod.E_WALLET,
  CARDS: PaymentMethod.CREDIT_CARD,
  OTC: PaymentMethod.CASH,
};

export const mapMethodToXenditType = (method: PaymentMethod | string): PaymentMethodType => {
  const normalized = method.toUpperCase();
  const direct = paymentMethodMap[normalized as PaymentMethod];
  if (direct) return direct;

  const alias = legacyAliasMap[normalized];
  if (alias) return paymentMethodMap[alias];

  throw new AppError(`Unsupported payment method: ${method}`, 400);
};

export const mapMethodToPaymentKey = (xenditType: PaymentMethodType): string => {
  switch (xenditType) {
    case 'VIRTUAL_ACCOUNT':
      return 'virtualAccount';
    case 'EWALLET':
      return 'ewallet';
    case 'CARD':
      return 'card';
    case 'OVER_THE_COUNTER':
      return 'overTheCounter';
    default:
      if (xenditType === 'QR_CODE') {
        return 'qrCode';
      }
      throw new AppError(`Unsupported Xendit payment method type: ${xenditType}`, 400);
  }
};

const pickRecord = (obj: Record<string, unknown> | undefined, ...keys: string[]) => {
  if (!obj) return undefined;
  for (const key of keys) {
    const value = obj[key];
    if (value != null && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
  }
  return undefined;
};

const pickString = (obj: Record<string, unknown> | undefined, ...keys: string[]) => {
  if (!obj) return undefined;
  for (const key of keys) {
    const value = obj[key];
    if (value != null && value !== '') return String(value);
  }
  return undefined;
};

const METHOD_DATA_KEYS: Partial<Record<PaymentMethodType, string[]>> = {
  VIRTUAL_ACCOUNT: ['virtualAccount', 'virtual_account'],
  EWALLET: ['ewallet'],
  QR_CODE: ['qrCode', 'qr_code'],
  OVER_THE_COUNTER: ['overTheCounter', 'over_the_counter'],
  CARD: ['card'],
};

type XenditAction = { action?: string; url?: string; qr_code?: string; qrCode?: string };

/**
 * Normalizes Payment Request payloads from Xendit SDK (camelCase) and mock/legacy
 * storage (snake_case) into the shape expected by the mobile payment UI.
 */
export const extractXenditDirectPaymentData = (
  raw: unknown,
  fallbackChannelCode?: string,
): {
  paymentType: string;
  channelCode: string;
  paymentData: Record<string, unknown>;
} | null => {
  if (!raw || typeof raw !== 'object') return null;

  const payload = raw as Record<string, unknown>;
  const paymentMethod = pickRecord(payload, 'payment_method', 'paymentMethod');
  const paymentType = pickString(paymentMethod, 'type');
  if (!paymentType || !paymentMethod) return null;

  const methodKeys = METHOD_DATA_KEYS[paymentType as PaymentMethodType] ?? [
    mapMethodToPaymentKey(paymentType as PaymentMethodType),
  ];

  let methodData: Record<string, unknown> | undefined;
  for (const key of methodKeys) {
    methodData = pickRecord(paymentMethod, key);
    if (methodData) break;
  }
  methodData ??= {};

  const channelProps = pickRecord(methodData, 'channel_properties', 'channelProperties') ?? {};
  const channelCode =
    pickString(methodData, 'channel_code', 'channelCode') ?? fallbackChannelCode ?? '';

  const actions = (Array.isArray(payload.actions) ? payload.actions : []) as XenditAction[];
  const qrFromAction =
    actions.find((a) => a.action === 'PRESENT_QR' || a.qr_code || a.qrCode)?.qr_code ??
    actions.find((a) => a.qr_code || a.qrCode)?.qrCode;
  const redirectFromAction = actions.find((a) => a.url)?.url;

  const paymentData: Record<string, unknown> = {
    ...channelProps,
    virtual_account_number:
      pickString(channelProps, 'virtual_account_number', 'virtualAccountNumber') ??
      pickString(methodData, 'virtual_account_number', 'virtualAccountNumber') ??
      undefined,
    virtualAccountNumber:
      pickString(channelProps, 'virtualAccountNumber', 'virtual_account_number') ??
      pickString(methodData, 'virtualAccountNumber', 'virtual_account_number') ??
      undefined,
    customer_name: pickString(channelProps, 'customer_name', 'customerName') ?? undefined,
    qr_string: pickString(channelProps, 'qr_string', 'qrString') ?? undefined,
    payment_code: pickString(channelProps, 'payment_code', 'paymentCode') ?? undefined,
    actions: actions.length > 0 ? actions : undefined,
    qrString: qrFromAction ?? pickString(channelProps, 'qr_string', 'qrString'),
    redirectUrl:
      redirectFromAction ??
      pickString(
        channelProps,
        'redirect_url',
        'redirectUrl',
        'success_return_url',
        'successReturnUrl',
      ),
  };

  const hasPayableDetail =
    !!paymentData.virtual_account_number ||
    !!paymentData.virtualAccountNumber ||
    !!paymentData.qrString ||
    !!paymentData.qr_string ||
    !!paymentData.redirectUrl ||
    !!paymentData.payment_code;

  if (!hasPayableDetail && paymentType !== 'CARD') {
    return null;
  }

  return { paymentType, channelCode, paymentData };
};

export const paymentDataHasPayableDetail = (paymentData: Record<string, unknown>): boolean =>
  Boolean(
    paymentData.virtual_account_number ||
    paymentData.virtualAccountNumber ||
    paymentData.qrString ||
    paymentData.qr_string ||
    paymentData.redirectUrl ||
    paymentData.payment_code,
  );
