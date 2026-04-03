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
