import {
  decryptField,
  decryptFieldDeterministic,
  encryptField,
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

/** UserPayoutAccount.accountName — random IV (not unique). */
export const sealAccountName = (
  accountName: string | null | undefined,
): string | null | undefined => {
  if (accountName == null || accountName === '') return accountName;
  return encryptField(accountName.trim());
};

export const revealAccountName = (stored: string | null | undefined): string | null | undefined => {
  if (stored == null || stored === '') return stored;
  if (!isEncryptedPayload(stored)) return stored;
  return decryptField(stored);
};

export const formatPayoutAccountForList = <
  T extends { accountNumber: string; accountName?: string },
>(
  account: T,
  ctx: PayoutAccountContext,
): T & { accountNumber: string; maskedAccountNumber: string } => {
  const plain = revealAccountNumber(account.accountNumber, ctx);
  const masked = maskAccountNumber(plain);
  return {
    ...account,
    accountNumber: masked,
    maskedAccountNumber: masked,
    ...(account.accountName != null && {
      accountName: revealAccountName(account.accountName) as string,
    }),
  };
};

export const formatPayoutAccountForOwnerDetail = <
  T extends { accountNumber: string; accountName?: string },
>(
  account: T,
  ctx: PayoutAccountContext,
): T & { maskedAccountNumber: string } => {
  const plain = revealAccountNumber(account.accountNumber, ctx);
  return {
    ...account,
    accountNumber: plain,
    maskedAccountNumber: maskAccountNumber(plain),
    ...(account.accountName != null && {
      accountName: revealAccountName(account.accountName) as string,
    }),
  };
};

export const formatPayoutAccountForAdmin = <
  T extends { accountNumber: string; accountName?: string },
>(
  account: T,
  ctx: PayoutAccountContext,
  unmask = false,
): T & { maskedAccountNumber: string } => {
  const plain = revealAccountNumber(account.accountNumber, ctx);
  return {
    ...account,
    accountNumber: unmask ? plain : maskAccountNumber(plain),
    maskedAccountNumber: maskAccountNumber(plain),
    ...(account.accountName != null && {
      accountName: revealAccountName(account.accountName) as string,
    }),
  };
};
