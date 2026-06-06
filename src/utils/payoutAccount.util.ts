import {
  decryptFieldDeterministic,
  encryptFieldDeterministic,
  isEncryptedPayload,
} from '#utils/encryption.util';
import { maskAccountNumber } from '#utils/sensitiveData.util';

export type PayoutAccountContext = { userId: string; bankId: string };

export const payoutAccountContextKey = (ctx: PayoutAccountContext): string =>
  `${ctx.userId}:${ctx.bankId}`;

export const sealAccountNumber = (accountNumber: string, ctx: PayoutAccountContext): string =>
  encryptFieldDeterministic(accountNumber.trim(), payoutAccountContextKey(ctx));

export const revealAccountNumber = (stored: string, ctx: PayoutAccountContext): string => {
  if (!stored) return '';
  if (!isEncryptedPayload(stored)) return stored;
  return decryptFieldDeterministic(stored, payoutAccountContextKey(ctx));
};

export const formatPayoutAccountForList = <T extends { accountNumber: string }>(
  account: T,
  ctx: PayoutAccountContext,
): T & { accountNumber: string; maskedAccountNumber: string } => {
  const plain = revealAccountNumber(account.accountNumber, ctx);
  const masked = maskAccountNumber(plain);
  return {
    ...account,
    accountNumber: masked,
    maskedAccountNumber: masked,
  };
};

export const formatPayoutAccountForOwnerDetail = <T extends { accountNumber: string }>(
  account: T,
  ctx: PayoutAccountContext,
): T & { maskedAccountNumber: string } => {
  const plain = revealAccountNumber(account.accountNumber, ctx);
  return {
    ...account,
    accountNumber: plain,
    maskedAccountNumber: maskAccountNumber(plain),
  };
};

export const formatPayoutAccountForAdmin = <T extends { accountNumber: string }>(
  account: T,
  ctx: PayoutAccountContext,
  unmask = false,
): T & { maskedAccountNumber: string } => {
  const plain = revealAccountNumber(account.accountNumber, ctx);
  return {
    ...account,
    accountNumber: unmask ? plain : maskAccountNumber(plain),
    maskedAccountNumber: maskAccountNumber(plain),
  };
};
