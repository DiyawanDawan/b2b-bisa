/**
 * Backfill plaintext sensitive fields → AES-256-GCM ciphertext.
 *
 * Usage (backup DB first):
 *   npx tsx scripts/migrate-encrypt-sensitive-data.ts
 *   npx tsx scripts/migrate-encrypt-sensitive-data.ts --dry-run
 *   npx tsx scripts/migrate-encrypt-sensitive-data.ts --batch-size=200
 *   npx tsx scripts/migrate-encrypt-sensitive-data.ts --from-id=<cuid>
 *   npx tsx scripts/migrate-encrypt-sensitive-data.ts --only=addresses,npwp
 *
 * Idempotent / resumable: skips `v{n}:...` ciphertext; `--from-id` resumes after a row id
 * (per table, ordered by id asc). Safe to re-run.
 */
import { Prisma } from '#prisma';
import prisma from '../src/config/prisma';
import { encryptField, encryptJsonValue, isEncryptedPayload } from '../src/utils/encryption.util';
import { sealAccountNumber } from '../src/utils/payoutAccount.util';

type CliOptions = {
  dryRun: boolean;
  batchSize: number;
  fromId?: string;
  only?: Set<string>;
};

type TableStats = {
  scanned: number;
  updated: number;
  skippedEncrypted: number;
  skippedEmpty: number;
};

const ALL_TABLES = [
  'payoutAccounts',
  'providerActions',
  'npwp',
  'platformBankAccounts',
  'addresses',
  'verifications',
  'shippingSnapshots',
  'shipments',
] as const;

type TableName = (typeof ALL_TABLES)[number];

const parseArgs = (argv: string[]): CliOptions => {
  const opts: CliOptions = { dryRun: false, batchSize: 100 };
  for (const arg of argv) {
    if (arg === '--dry-run') opts.dryRun = true;
    else if (arg.startsWith('--batch-size=')) {
      const n = Number(arg.slice('--batch-size='.length));
      if (!Number.isFinite(n) || n < 1) throw new Error(`Invalid --batch-size: ${arg}`);
      opts.batchSize = Math.floor(n);
    } else if (arg.startsWith('--from-id=')) {
      opts.fromId = arg.slice('--from-id='.length) || undefined;
    } else if (arg.startsWith('--only=')) {
      const names = arg
        .slice('--only='.length)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      for (const name of names) {
        if (!ALL_TABLES.includes(name as TableName)) {
          throw new Error(`Unknown table "${name}". Allowed: ${ALL_TABLES.join(', ')}`);
        }
      }
      opts.only = new Set(names);
    } else if (arg === '--help' || arg === '-h') {
      console.log(`Usage: npx tsx scripts/migrate-encrypt-sensitive-data.ts [options]

Options:
  --dry-run              Count rows that would be updated; no writes
  --batch-size=N         Cursor page size (default 100)
  --from-id=ID           Resume after this id (per table, id asc)
  --only=a,b             Limit to tables: ${ALL_TABLES.join(', ')}
  -h, --help             Show this help
`);
      process.exit(0);
    } else if (arg.startsWith('-')) {
      throw new Error(`Unknown flag: ${arg}`);
    }
  }
  return opts;
};

const emptyStats = (): TableStats => ({
  scanned: 0,
  updated: 0,
  skippedEncrypted: 0,
  skippedEmpty: 0,
});

const shouldRun = (opts: CliOptions, name: TableName): boolean => !opts.only || opts.only.has(name);

const logStats = (label: string, stats: TableStats, dryRun: boolean) => {
  const verb = dryRun ? 'wouldUpdate' : 'updated';
  console.log(
    `[migrate] ${label}: scanned=${stats.scanned} ${verb}=${stats.updated} skippedEncrypted=${stats.skippedEncrypted} skippedEmpty=${stats.skippedEmpty}`,
  );
};

async function* cursorPages<T extends { id: string }>(
  fetchPage: (afterId: string | undefined, take: number) => Promise<T[]>,
  batchSize: number,
  startAfter?: string,
): AsyncGenerator<T[]> {
  let afterId = startAfter;
  for (;;) {
    const page = await fetchPage(afterId, batchSize);
    if (page.length === 0) break;
    yield page;
    afterId = page[page.length - 1].id;
    if (page.length < batchSize) break;
  }
}

const migratePayoutAccounts = async (opts: CliOptions): Promise<TableStats> => {
  const stats = emptyStats();
  for await (const page of cursorPages(
    (afterId, take) =>
      prisma.userPayoutAccount.findMany({
        take,
        ...(afterId ? { cursor: { id: afterId }, skip: 1 } : {}),
        orderBy: { id: 'asc' },
        select: { id: true, userId: true, bankId: true, accountNumber: true, accountName: true },
      }),
    opts.batchSize,
    opts.fromId,
  )) {
    for (const row of page) {
      stats.scanned += 1;
      const numberEncrypted = isEncryptedPayload(row.accountNumber);
      const nameEmpty = !row.accountName;
      const nameEncrypted = !!row.accountName && isEncryptedPayload(row.accountName);
      if (numberEncrypted) stats.skippedEncrypted += 1;
      if (nameEmpty) stats.skippedEmpty += 1;
      else if (nameEncrypted) stats.skippedEncrypted += 1;

      const nextNumber = !numberEncrypted
        ? sealAccountNumber(row.accountNumber, { userId: row.userId, bankId: row.bankId })
        : null;
      const nextName =
        row.accountName && !nameEncrypted ? encryptField(row.accountName.trim()) : null;
      if (!nextNumber && !nextName) continue;
      if (!opts.dryRun) {
        await prisma.userPayoutAccount.update({
          where: { id: row.id },
          data: {
            ...(nextNumber ? { accountNumber: nextNumber } : {}),
            ...(nextName ? { accountName: nextName } : {}),
          },
        });
      }
      stats.updated += 1;
    }
  }
  return stats;
};

const migrateProviderActions = async (opts: CliOptions): Promise<TableStats> => {
  const stats = emptyStats();
  for await (const page of cursorPages(
    (afterId, take) =>
      prisma.transaction.findMany({
        where: { NOT: { providerActions: { equals: Prisma.DbNull } } },
        take,
        ...(afterId ? { cursor: { id: afterId }, skip: 1 } : {}),
        orderBy: { id: 'asc' },
        select: { id: true, providerActions: true },
      }),
    opts.batchSize,
    opts.fromId,
  )) {
    for (const row of page) {
      stats.scanned += 1;
      const stored = row.providerActions;
      if (stored == null) {
        stats.skippedEmpty += 1;
        continue;
      }
      if (typeof stored === 'string' && isEncryptedPayload(stored)) {
        stats.skippedEncrypted += 1;
        continue;
      }
      if (!opts.dryRun) {
        await prisma.transaction.update({
          where: { id: row.id },
          data: { providerActions: encryptJsonValue(stored) },
        });
      }
      stats.updated += 1;
    }
  }
  return stats;
};

const migrateNpwp = async (opts: CliOptions): Promise<TableStats> => {
  const stats = emptyStats();
  for await (const page of cursorPages(
    (afterId, take) =>
      prisma.userProfile.findMany({
        where: { npwp: { not: null } },
        take,
        ...(afterId ? { cursor: { id: afterId }, skip: 1 } : {}),
        orderBy: { id: 'asc' },
        select: { id: true, npwp: true },
      }),
    opts.batchSize,
    opts.fromId,
  )) {
    for (const row of page) {
      stats.scanned += 1;
      if (!row.npwp) {
        stats.skippedEmpty += 1;
        continue;
      }
      if (isEncryptedPayload(row.npwp)) {
        stats.skippedEncrypted += 1;
        continue;
      }
      if (!opts.dryRun) {
        await prisma.userProfile.update({
          where: { id: row.id },
          data: { npwp: encryptField(row.npwp) },
        });
      }
      stats.updated += 1;
    }
  }
  return stats;
};

const migratePlatformBankAccounts = async (opts: CliOptions): Promise<TableStats> => {
  const stats = emptyStats();
  for await (const page of cursorPages(
    (afterId, take) =>
      prisma.platformBankAccount.findMany({
        take,
        ...(afterId ? { cursor: { id: afterId }, skip: 1 } : {}),
        orderBy: { id: 'asc' },
        select: { id: true, accountNumber: true },
      }),
    opts.batchSize,
    opts.fromId,
  )) {
    for (const row of page) {
      stats.scanned += 1;
      if (!row.accountNumber) {
        stats.skippedEmpty += 1;
        continue;
      }
      if (isEncryptedPayload(row.accountNumber)) {
        stats.skippedEncrypted += 1;
        continue;
      }
      if (!opts.dryRun) {
        await prisma.platformBankAccount.update({
          where: { id: row.id },
          data: { accountNumber: encryptField(row.accountNumber) },
        });
      }
      stats.updated += 1;
    }
  }
  return stats;
};

const migrateAddresses = async (opts: CliOptions): Promise<TableStats> => {
  const stats = emptyStats();
  for await (const page of cursorPages(
    (afterId, take) =>
      prisma.address.findMany({
        take,
        ...(afterId ? { cursor: { id: afterId }, skip: 1 } : {}),
        orderBy: { id: 'asc' },
        select: { id: true, fullAddress: true, phoneNumber: true },
      }),
    opts.batchSize,
    opts.fromId,
  )) {
    for (const row of page) {
      stats.scanned += 1;
      const nextFull =
        row.fullAddress && !isEncryptedPayload(row.fullAddress)
          ? encryptField(row.fullAddress)
          : null;
      const nextPhone =
        row.phoneNumber && !isEncryptedPayload(row.phoneNumber)
          ? encryptField(row.phoneNumber)
          : null;
      if (row.fullAddress && isEncryptedPayload(row.fullAddress)) stats.skippedEncrypted += 1;
      if (!row.fullAddress) stats.skippedEmpty += 1;
      if (row.phoneNumber && isEncryptedPayload(row.phoneNumber)) stats.skippedEncrypted += 1;
      if (!row.phoneNumber) stats.skippedEmpty += 1;
      if (!nextFull && !nextPhone) continue;
      if (!opts.dryRun) {
        await prisma.address.update({
          where: { id: row.id },
          data: {
            ...(nextFull ? { fullAddress: nextFull } : {}),
            ...(nextPhone ? { phoneNumber: nextPhone } : {}),
          },
        });
      }
      stats.updated += 1;
    }
  }
  return stats;
};

const migrateVerifications = async (opts: CliOptions): Promise<TableStats> => {
  const stats = emptyStats();
  for await (const page of cursorPages(
    (afterId, take) =>
      prisma.userVerification.findMany({
        take,
        ...(afterId ? { cursor: { id: afterId }, skip: 1 } : {}),
        orderBy: { id: 'asc' },
        select: { id: true, taxId: true, businessAddress: true },
      }),
    opts.batchSize,
    opts.fromId,
  )) {
    for (const row of page) {
      stats.scanned += 1;
      const nextTax = row.taxId && !isEncryptedPayload(row.taxId) ? encryptField(row.taxId) : null;
      const nextBiz =
        row.businessAddress && !isEncryptedPayload(row.businessAddress)
          ? encryptField(row.businessAddress)
          : null;
      if (row.taxId && isEncryptedPayload(row.taxId)) stats.skippedEncrypted += 1;
      if (!row.taxId) stats.skippedEmpty += 1;
      if (row.businessAddress && isEncryptedPayload(row.businessAddress)) {
        stats.skippedEncrypted += 1;
      }
      if (!row.businessAddress) stats.skippedEmpty += 1;
      if (!nextTax && !nextBiz) continue;
      if (!opts.dryRun) {
        await prisma.userVerification.update({
          where: { id: row.id },
          data: {
            ...(nextTax ? { taxId: nextTax } : {}),
            ...(nextBiz ? { businessAddress: nextBiz } : {}),
          },
        });
      }
      stats.updated += 1;
    }
  }
  return stats;
};

const migrateShippingSnapshots = async (opts: CliOptions): Promise<TableStats> => {
  const stats = emptyStats();
  for await (const page of cursorPages(
    (afterId, take) =>
      prisma.order.findMany({
        where: { NOT: { shippingAddressSnapshot: { equals: Prisma.DbNull } } },
        take,
        ...(afterId ? { cursor: { id: afterId }, skip: 1 } : {}),
        orderBy: { id: 'asc' },
        select: { id: true, shippingAddressSnapshot: true },
      }),
    opts.batchSize,
    opts.fromId,
  )) {
    for (const row of page) {
      stats.scanned += 1;
      const stored = row.shippingAddressSnapshot;
      if (stored == null) {
        stats.skippedEmpty += 1;
        continue;
      }
      if (typeof stored === 'string' && isEncryptedPayload(stored)) {
        stats.skippedEncrypted += 1;
        continue;
      }
      if (!opts.dryRun) {
        await prisma.order.update({
          where: { id: row.id },
          data: { shippingAddressSnapshot: encryptJsonValue(stored) },
        });
      }
      stats.updated += 1;
    }
  }
  return stats;
};

const migrateBisaExpressShipments = async (opts: CliOptions): Promise<TableStats> => {
  const stats = emptyStats();
  const fields = [
    'pickupAddress',
    'pickupContact',
    'pickupPhone',
    'deliveryAddress',
    'deliveryContact',
    'deliveryPhone',
    'podReceivedBy',
  ] as const;

  for await (const page of cursorPages(
    (afterId, take) =>
      prisma.bisaExpressShipment.findMany({
        take,
        ...(afterId ? { cursor: { id: afterId }, skip: 1 } : {}),
        orderBy: { id: 'asc' },
        select: {
          id: true,
          pickupAddress: true,
          pickupContact: true,
          pickupPhone: true,
          deliveryAddress: true,
          deliveryContact: true,
          deliveryPhone: true,
          podReceivedBy: true,
        },
      }),
    opts.batchSize,
    opts.fromId,
  )) {
    for (const row of page) {
      stats.scanned += 1;
      const next: Record<string, string> = {};
      for (const key of fields) {
        const value = row[key];
        if (!value) {
          stats.skippedEmpty += 1;
          continue;
        }
        if (isEncryptedPayload(value)) {
          stats.skippedEncrypted += 1;
          continue;
        }
        next[key] = encryptField(value);
      }
      if (Object.keys(next).length === 0) continue;
      if (!opts.dryRun) {
        await prisma.bisaExpressShipment.update({
          where: { id: row.id },
          data: next,
        });
      }
      stats.updated += 1;
    }
  }
  return stats;
};

const main = async () => {
  const opts = parseArgs(process.argv.slice(2));
  console.log(
    `[migrate] mode=${opts.dryRun ? 'dry-run' : 'write'} batchSize=${opts.batchSize}` +
      (opts.fromId ? ` fromId=${opts.fromId}` : '') +
      (opts.only ? ` only=${[...opts.only].join(',')}` : ''),
  );
  console.log('[migrate] Reminder: take a DB backup before write mode.');

  const totals = emptyStats();
  const merge = (s: TableStats) => {
    totals.scanned += s.scanned;
    totals.updated += s.updated;
    totals.skippedEncrypted += s.skippedEncrypted;
    totals.skippedEmpty += s.skippedEmpty;
  };

  const runners: Array<[TableName, (o: CliOptions) => Promise<TableStats>]> = [
    ['payoutAccounts', migratePayoutAccounts],
    ['providerActions', migrateProviderActions],
    ['npwp', migrateNpwp],
    ['platformBankAccounts', migratePlatformBankAccounts],
    ['addresses', migrateAddresses],
    ['verifications', migrateVerifications],
    ['shippingSnapshots', migrateShippingSnapshots],
    ['shipments', migrateBisaExpressShipments],
  ];

  for (const [name, run] of runners) {
    if (!shouldRun(opts, name)) continue;
    const stats = await run(opts);
    logStats(name, stats, opts.dryRun);
    merge(stats);
  }

  logStats('TOTAL', totals, opts.dryRun);
  if (opts.dryRun) {
    console.log('[migrate] dry-run complete — re-run without --dry-run to apply.');
  } else {
    console.log('[migrate] write complete — run verify-encryption.ts --db to confirm residuals.');
  }
};

main()
  .catch((err) => {
    console.error('[migrate] failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
