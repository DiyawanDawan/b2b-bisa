/**
 * Re-encrypt ciphertext from older key versions → active version (ENCRYPTION_KEY_V2 → v2).
 *
 * Prerequisites:
 *   - ENCRYPTION_KEY (v1) still set
 *   - ENCRYPTION_KEY_V2 set (becomes active write key / target version)
 *   - All plaintext already backfilled (run migrate-encrypt first)
 *
 * Usage:
 *   npx tsx scripts/rotate-encryption-keys.ts --dry-run
 *   npx tsx scripts/rotate-encryption-keys.ts
 *   npx tsx scripts/rotate-encryption-keys.ts --batch-size=200 --from-id=<cuid>
 *   npx tsx scripts/rotate-encryption-keys.ts --only=addresses,shipments
 *   npx tsx scripts/rotate-encryption-keys.ts --from-version=1 --to-version=2
 *
 * Idempotent: skips rows already on target version. Safe to re-run.
 * Do NOT remove ENCRYPTION_KEY until verify reports zero residual from-version rows.
 */
import { Prisma } from '#prisma';
import prisma from '../src/config/prisma';
import { ENCRYPTION_KEY_V2, getActiveEncryptionVersion } from '../src/utils/env.util';
import {
  getPayloadVersion,
  isEncryptedPayload,
  needsReencryption,
  reencryptField,
  reencryptFieldDeterministic,
  reencryptJsonValue,
} from '../src/utils/encryption.util';
import { payoutAccountContextKey } from '../src/utils/payoutAccount.util';

type CliOptions = {
  dryRun: boolean;
  batchSize: number;
  fromId?: string;
  only?: Set<string>;
  fromVersion: string;
  toVersion: string;
};

type TableStats = {
  scanned: number;
  rotated: number;
  skippedCurrent: number;
  skippedPlaintext: number;
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
  const active = getActiveEncryptionVersion();
  const opts: CliOptions = {
    dryRun: false,
    batchSize: 100,
    fromVersion: '1',
    toVersion: active,
  };
  for (const arg of argv) {
    if (arg === '--dry-run') opts.dryRun = true;
    else if (arg.startsWith('--batch-size=')) {
      const n = Number(arg.slice('--batch-size='.length));
      if (!Number.isFinite(n) || n < 1) throw new Error(`Invalid --batch-size: ${arg}`);
      opts.batchSize = Math.floor(n);
    } else if (arg.startsWith('--from-id=')) {
      opts.fromId = arg.slice('--from-id='.length) || undefined;
    } else if (arg.startsWith('--from-version=')) {
      opts.fromVersion = arg.slice('--from-version='.length);
    } else if (arg.startsWith('--to-version=')) {
      opts.toVersion = arg.slice('--to-version='.length);
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
      console.log(`Usage: npx tsx scripts/rotate-encryption-keys.ts [options]

Options:
  --dry-run              Count rows that would rotate; no writes
  --batch-size=N         Cursor page size (default 100)
  --from-id=ID           Resume after this id (per table, id asc)
  --from-version=N       Source ciphertext version (default 1)
  --to-version=N         Target version (default: active / ENCRYPTION_KEY_V2 → 2)
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
  rotated: 0,
  skippedCurrent: 0,
  skippedPlaintext: 0,
  skippedEmpty: 0,
});

const shouldRun = (opts: CliOptions, name: TableName): boolean => !opts.only || opts.only.has(name);

const logStats = (label: string, stats: TableStats, dryRun: boolean) => {
  const verb = dryRun ? 'wouldRotate' : 'rotated';
  console.log(
    `[rotate] ${label}: scanned=${stats.scanned} ${verb}=${stats.rotated} skippedCurrent=${stats.skippedCurrent} skippedPlaintext=${stats.skippedPlaintext} skippedEmpty=${stats.skippedEmpty}`,
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

const classifyString = (
  value: string | null | undefined,
  opts: CliOptions,
  stats: TableStats,
): 'empty' | 'plain' | 'current' | 'rotate' => {
  if (!value) {
    stats.skippedEmpty += 1;
    return 'empty';
  }
  if (!isEncryptedPayload(value)) {
    stats.skippedPlaintext += 1;
    return 'plain';
  }
  const version = getPayloadVersion(value);
  if (version === opts.toVersion) {
    stats.skippedCurrent += 1;
    return 'current';
  }
  if (version !== opts.fromVersion) {
    // Unexpected version — leave untouched; count as current-ish skip
    stats.skippedCurrent += 1;
    return 'current';
  }
  return 'rotate';
};

const rotatePayoutAccounts = async (opts: CliOptions): Promise<TableStats> => {
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
      const next: { accountNumber?: string; accountName?: string } = {};
      if (classifyString(row.accountNumber, opts, stats) === 'rotate') {
        next.accountNumber = reencryptFieldDeterministic(
          row.accountNumber,
          payoutAccountContextKey({ userId: row.userId, bankId: row.bankId }),
          opts.toVersion,
        );
      }
      if (classifyString(row.accountName, opts, stats) === 'rotate') {
        next.accountName = reencryptField(row.accountName!, opts.toVersion);
      }
      if (Object.keys(next).length === 0) continue;
      if (!opts.dryRun) {
        await prisma.userPayoutAccount.update({ where: { id: row.id }, data: next });
      }
      stats.rotated += 1;
    }
  }
  return stats;
};

const rotateProviderActions = async (opts: CliOptions): Promise<TableStats> => {
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
      if (typeof stored !== 'string' || !isEncryptedPayload(stored)) {
        stats.skippedPlaintext += 1;
        continue;
      }
      if (!needsReencryption(stored, opts.toVersion)) {
        stats.skippedCurrent += 1;
        continue;
      }
      if (getPayloadVersion(stored) !== opts.fromVersion) {
        stats.skippedCurrent += 1;
        continue;
      }
      if (!opts.dryRun) {
        await prisma.transaction.update({
          where: { id: row.id },
          data: { providerActions: reencryptJsonValue(stored, opts.toVersion) },
        });
      }
      stats.rotated += 1;
    }
  }
  return stats;
};

const rotateNpwp = async (opts: CliOptions): Promise<TableStats> => {
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
      if (classifyString(row.npwp, opts, stats) !== 'rotate') continue;
      if (!opts.dryRun) {
        await prisma.userProfile.update({
          where: { id: row.id },
          data: { npwp: reencryptField(row.npwp!, opts.toVersion) },
        });
      }
      stats.rotated += 1;
    }
  }
  return stats;
};

const rotatePlatformBankAccounts = async (opts: CliOptions): Promise<TableStats> => {
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
      if (classifyString(row.accountNumber, opts, stats) !== 'rotate') continue;
      if (!opts.dryRun) {
        await prisma.platformBankAccount.update({
          where: { id: row.id },
          data: { accountNumber: reencryptField(row.accountNumber, opts.toVersion) },
        });
      }
      stats.rotated += 1;
    }
  }
  return stats;
};

const rotateAddresses = async (opts: CliOptions): Promise<TableStats> => {
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
      const next: { fullAddress?: string; phoneNumber?: string } = {};
      if (classifyString(row.fullAddress, opts, stats) === 'rotate') {
        next.fullAddress = reencryptField(row.fullAddress!, opts.toVersion);
      }
      if (classifyString(row.phoneNumber, opts, stats) === 'rotate') {
        next.phoneNumber = reencryptField(row.phoneNumber!, opts.toVersion);
      }
      if (Object.keys(next).length === 0) continue;
      if (!opts.dryRun) {
        await prisma.address.update({ where: { id: row.id }, data: next });
      }
      stats.rotated += 1;
    }
  }
  return stats;
};

const rotateVerifications = async (opts: CliOptions): Promise<TableStats> => {
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
      const next: { taxId?: string; businessAddress?: string } = {};
      if (classifyString(row.taxId, opts, stats) === 'rotate') {
        next.taxId = reencryptField(row.taxId!, opts.toVersion);
      }
      if (classifyString(row.businessAddress, opts, stats) === 'rotate') {
        next.businessAddress = reencryptField(row.businessAddress!, opts.toVersion);
      }
      if (Object.keys(next).length === 0) continue;
      if (!opts.dryRun) {
        await prisma.userVerification.update({ where: { id: row.id }, data: next });
      }
      stats.rotated += 1;
    }
  }
  return stats;
};

const rotateShippingSnapshots = async (opts: CliOptions): Promise<TableStats> => {
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
      if (typeof stored !== 'string' || !isEncryptedPayload(stored)) {
        stats.skippedPlaintext += 1;
        continue;
      }
      if (!needsReencryption(stored, opts.toVersion)) {
        stats.skippedCurrent += 1;
        continue;
      }
      if (getPayloadVersion(stored) !== opts.fromVersion) {
        stats.skippedCurrent += 1;
        continue;
      }
      if (!opts.dryRun) {
        await prisma.order.update({
          where: { id: row.id },
          data: { shippingAddressSnapshot: reencryptJsonValue(stored, opts.toVersion) },
        });
      }
      stats.rotated += 1;
    }
  }
  return stats;
};

const rotateShipments = async (opts: CliOptions): Promise<TableStats> => {
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
        if (classifyString(row[key], opts, stats) === 'rotate') {
          next[key] = reencryptField(row[key]!, opts.toVersion);
        }
      }
      if (Object.keys(next).length === 0) continue;
      if (!opts.dryRun) {
        await prisma.bisaExpressShipment.update({ where: { id: row.id }, data: next });
      }
      stats.rotated += 1;
    }
  }
  return stats;
};

const main = async () => {
  const opts = parseArgs(process.argv.slice(2));

  if (opts.toVersion === '2' && !ENCRYPTION_KEY_V2) {
    throw new Error(
      'ENCRYPTION_KEY_V2 must be set before rotating to v2. Set the new key, keep ENCRYPTION_KEY for decrypt.',
    );
  }
  if (opts.fromVersion === opts.toVersion) {
    throw new Error(`from-version and to-version are the same (${opts.fromVersion}).`);
  }

  console.log(
    `[rotate] mode=${opts.dryRun ? 'dry-run' : 'write'} batchSize=${opts.batchSize}` +
      ` ${opts.fromVersion}→${opts.toVersion}` +
      (opts.fromId ? ` fromId=${opts.fromId}` : '') +
      (opts.only ? ` only=${[...opts.only].join(',')}` : ''),
  );
  console.log('[rotate] Reminder: backup DB; keep ENCRYPTION_KEY until residuals are zero.');

  const totals = emptyStats();
  const merge = (s: TableStats) => {
    totals.scanned += s.scanned;
    totals.rotated += s.rotated;
    totals.skippedCurrent += s.skippedCurrent;
    totals.skippedPlaintext += s.skippedPlaintext;
    totals.skippedEmpty += s.skippedEmpty;
  };

  const runners: Array<[TableName, (o: CliOptions) => Promise<TableStats>]> = [
    ['payoutAccounts', rotatePayoutAccounts],
    ['providerActions', rotateProviderActions],
    ['npwp', rotateNpwp],
    ['platformBankAccounts', rotatePlatformBankAccounts],
    ['addresses', rotateAddresses],
    ['verifications', rotateVerifications],
    ['shippingSnapshots', rotateShippingSnapshots],
    ['shipments', rotateShipments],
  ];

  for (const [name, run] of runners) {
    if (!shouldRun(opts, name)) continue;
    const stats = await run(opts);
    logStats(name, stats, opts.dryRun);
    merge(stats);
  }

  logStats('TOTAL', totals, opts.dryRun);
  if (totals.skippedPlaintext > 0) {
    console.warn(
      `[rotate] WARN: ${totals.skippedPlaintext} plaintext field(s) found — finish migrate-encrypt backfill first.`,
    );
  }
  if (opts.dryRun) {
    console.log('[rotate] dry-run complete — re-run without --dry-run to apply.');
  } else {
    console.log(
      '[rotate] write complete — run verify-encryption.ts --db --expect-version=' + opts.toVersion,
    );
  }
};

main()
  .catch((err) => {
    console.error('[rotate] failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
