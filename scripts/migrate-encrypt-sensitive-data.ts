/**
 * One-off migration: encrypt plaintext sensitive fields at-rest.
 *
 * Usage (backup DB first):
 *   npx tsx scripts/migrate-encrypt-sensitive-data.ts
 */
import prisma from '../src/config/prisma.ts';
import { encryptField, encryptJsonValue, isEncryptedPayload } from '../src/utils/encryption.util.ts';
import { sealAccountNumber } from '../src/utils/payoutAccount.util.ts';

const migratePayoutAccounts = async () => {
  const rows = await prisma.userPayoutAccount.findMany({
    select: { id: true, userId: true, bankId: true, accountNumber: true },
  });
  let updated = 0;
  for (const row of rows) {
    if (isEncryptedPayload(row.accountNumber)) continue;
    await prisma.userPayoutAccount.update({
      where: { id: row.id },
      data: {
        accountNumber: sealAccountNumber(row.accountNumber, {
          userId: row.userId,
          bankId: row.bankId,
        }),
      },
    });
    updated += 1;
  }
  console.log(`[migrate] payout accounts encrypted: ${updated}/${rows.length}`);
};

const migrateProviderActions = async () => {
  const rows = await prisma.transaction.findMany({
    where: { providerActions: { not: null } },
    select: { id: true, providerActions: true },
  });
  let updated = 0;
  for (const row of rows) {
    const stored = row.providerActions;
    if (typeof stored === 'string' && isEncryptedPayload(stored)) continue;
    await prisma.transaction.update({
      where: { id: row.id },
      data: { providerActions: encryptJsonValue(stored) },
    });
    updated += 1;
  }
  console.log(`[migrate] providerActions encrypted: ${updated}/${rows.length}`);
};

const migrateNpwp = async () => {
  const rows = await prisma.userProfile.findMany({
    where: { npwp: { not: null } },
    select: { id: true, npwp: true },
  });
  let updated = 0;
  for (const row of rows) {
    if (!row.npwp || isEncryptedPayload(row.npwp)) continue;
    await prisma.userProfile.update({
      where: { id: row.id },
      data: { npwp: encryptField(row.npwp) },
    });
    updated += 1;
  }
  console.log(`[migrate] NPWP encrypted: ${updated}/${rows.length}`);
};

const migratePlatformBankAccounts = async () => {
  const rows = await prisma.platformBankAccount.findMany({
    select: { id: true, accountNumber: true },
  });
  let updated = 0;
  for (const row of rows) {
    if (isEncryptedPayload(row.accountNumber)) continue;
    await prisma.platformBankAccount.update({
      where: { id: row.id },
      data: { accountNumber: encryptField(row.accountNumber) },
    });
    updated += 1;
  }
  console.log(`[migrate] platform bank accounts encrypted: ${updated}/${rows.length}`);
};

const main = async () => {
  await migratePayoutAccounts();
  await migrateProviderActions();
  await migrateNpwp();
  await migratePlatformBankAccounts();
};

main()
  .catch((err) => {
    console.error('[migrate] failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
