import { PaymentMethod } from '#prisma';
import AppError from '#utils/appError';
import type { PaymentMethodType } from '#xendit/payment_request/models';

/** Batas resmi QRIS DYNAMIC (referensi produk Xendit; seed & create harus selaras). */
export const QRIS_MIN_AMOUNT_IDR = 1500;
export const QRIS_MAX_AMOUNT_IDR = 10_000_000;

/** Default kedaluwarsa QR Payment Request V3 (24 jam). */
export const QRIS_DEFAULT_EXPIRY_MS = 24 * 60 * 60 * 1000;

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

const SUPPORTED_CHECKOUT_GROUPS = new Set<string>(Object.values(PaymentMethod));

/**
 * Tolak channel tanpa group valid (Paylater / null) — jangan pernah default ke BANK_TRANSFER.
 */
export const requirePaymentMethodGroup = (
  group: PaymentMethod | string | null | undefined,
  channelLabel?: string,
): PaymentMethod => {
  if (group == null || String(group).trim() === '') {
    throw new AppError(
      channelLabel
        ? `Metode pembayaran "${channelLabel}" tidak didukung untuk checkout (group kosong).`
        : 'Metode pembayaran tidak didukung untuk checkout (group kosong).',
      400,
    );
  }

  const normalized = String(group).toUpperCase();
  if (!SUPPORTED_CHECKOUT_GROUPS.has(normalized)) {
    throw new AppError(`Unsupported payment method: ${group}`, 400);
  }

  return normalized as PaymentMethod;
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

export type BuildChannelPropertiesInput = {
  methodGroup: PaymentMethod;
  customerName?: string | null;
  /** Nomór HP untuk channel yang membutuhkannya (mis. OVO). */
  mobileNumber?: string | null;
  channelCode?: string;
  /** Base URL untuk return e-wallet (tanpa path). */
  returnBaseUrl?: string;
  /** Override kedaluwarsa QRIS (default: sekarang + 24 jam). */
  qrisExpiresAt?: Date;
};

const defaultReturnBase = () =>
  process.env.CORS_ORIGINS?.split(',')[0]?.trim() || 'http://localhost:3000';

/**
 * Bangun channel_properties Payment Request V3 per group.
 * VA / QRIS / e-wallet punya field berbeda — jangan campur.
 */
export const buildXenditChannelProperties = (
  input: BuildChannelPropertiesInput,
): Record<string, unknown> => {
  const base = (input.returnBaseUrl || defaultReturnBase()).replace(/\/$/, '');
  const upperCode = (input.channelCode || '').toUpperCase();

  if (input.methodGroup === PaymentMethod.BANK_TRANSFER) {
    return {
      customerName: input.customerName?.trim() || 'BISA B2B Buyer',
    };
  }

  if (input.methodGroup === PaymentMethod.QRIS) {
    return {
      expiresAt: input.qrisExpiresAt ?? new Date(Date.now() + QRIS_DEFAULT_EXPIRY_MS),
    };
  }

  if (input.methodGroup === PaymentMethod.E_WALLET) {
    const props: Record<string, unknown> = {
      successReturnUrl: `${base}/payment/success`,
      failureReturnUrl: `${base}/payment/failed`,
    };
    const phone = input.mobileNumber?.trim();
    if (phone && (upperCode === 'OVO' || upperCode === 'SHOPEEPAY')) {
      props.mobileNumber = phone;
    }
    return props;
  }

  return {};
};

/**
 * Enforce min/max channel + floor/ceiling QRIS (1.500–10.000.000).
 */
export const assertPaymentAmountForChannel = (params: {
  amount: number;
  methodGroup: PaymentMethod;
  minAmount?: number | null;
  maxAmount?: number | null;
  currency?: string | null;
}): void => {
  const currency = params.currency || 'IDR';
  let min = params.minAmount != null ? Number(params.minAmount) : null;
  let max = params.maxAmount != null ? Number(params.maxAmount) : null;

  if (params.methodGroup === PaymentMethod.QRIS) {
    min = Math.max(min ?? QRIS_MIN_AMOUNT_IDR, QRIS_MIN_AMOUNT_IDR);
    max = Math.min(max ?? QRIS_MAX_AMOUNT_IDR, QRIS_MAX_AMOUNT_IDR);
  }

  if (min != null && params.amount < min) {
    throw new AppError(`Minimal pembayaran ${min} ${currency}.`, 400);
  }
  if (max != null && params.amount > max) {
    throw new AppError(`Maksimal pembayaran ${max} ${currency}.`, 400);
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

/** Ambil tanggal kedaluwarsa pembayaran dari payload Xendit / response init. */
export const extractPaymentExpiryDate = (raw: unknown): string | null => {
  if (!raw || typeof raw !== 'object') return null;
  const payload = raw as Record<string, unknown>;
  const candidates = [
    payload.expires_at,
    payload.expiresAt,
    payload.expiry_date,
    payload.expiryDate,
    payload.expiration_date,
    payload.expirationDate,
  ];
  for (const value of candidates) {
    if (value == null) continue;
    const text = String(value).trim();
    if (text.length > 0) return text;
  }

  const paymentMethod = pickRecord(payload, 'payment_method', 'paymentMethod');
  if (paymentMethod) {
    for (const key of ['qrCode', 'qr_code', 'virtualAccount', 'virtual_account', 'ewallet']) {
      const methodData = pickRecord(paymentMethod, key);
      const channelProps = pickRecord(methodData, 'channel_properties', 'channelProperties');
      const nested = pickString(channelProps, 'expires_at', 'expiresAt');
      if (nested) return nested;
    }
  }

  return null;
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
