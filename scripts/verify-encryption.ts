/**
 * Encryption verification: crypto unit checks + optional DB residual scan.
 *
 * Usage:
 *   npx tsx scripts/verify-encryption.ts              # unit checks only
 *   npx tsx scripts/verify-encryption.ts --db         # unit + residual plaintext / version counts
 *   npx tsx scripts/verify-encryption.ts --db-only    # skip unit; scan DB only
 *   npx tsx scripts/verify-encryption.ts --db --expect-version=2
 *   npx tsx scripts/verify-encryption.ts --db --batch-size=500
 *
 * Residual report never prints field values — only counts per table.field.
 */
import { Prisma } from '#prisma';
import {
  decryptField,
  decryptJsonValue,
  encryptField,
  encryptFieldDeterministic,
  encryptJsonValue,
  getPayloadVersion,
  isEncryptedPayload,
  reencryptField,
} from '../src/utils/encryption.util';
import {
  revealAddress,
  revealShipmentContact,
  revealShipmentFields,
  revealShippingAddressSnapshot,
  sealAddress,
  sealShipmentContact,
  sealShippingAddressSnapshot,
} from '../src/utils/piiField.util';
import { revealAccountName, sealAccountName } from '../src/utils/payoutAccount.util';
import { getActiveEncryptionVersion } from '../src/utils/env.util';

type CliOptions = {
  db: boolean;
  unit: boolean;
  batchSize: number;
  expectVersion?: string;
};

type FieldResidual = {
  table: string;
  field: string;
  nonNull: number;
  encrypted: number;
  plaintext: number;
  byVersion: Record<string, number>;
};

const parseArgs = (argv: string[]): CliOptions => {
  const opts: CliOptions = { db: false, unit: true, batchSize: 200 };
  for (const arg of argv) {
    if (arg === '--db') opts.db = true;
    else if (arg === '--db-only') {
      opts.db = true;
      opts.unit = false;
    } else if (arg === '--unit-only') {
      opts.db = false;
      opts.unit = true;
    } else if (arg.startsWith('--batch-size=')) {
      const n = Number(arg.slice('--batch-size='.length));
      if (!Number.isFinite(n) || n < 1) throw new Error(`Invalid --batch-size: ${arg}`);
      opts.batchSize = Math.floor(n);
    } else if (arg.startsWith('--expect-version=')) {
      opts.expectVersion = arg.slice('--expect-version='.length);
      opts.db = true;
    } else if (arg === '--help' || arg === '-h') {
      console.log(`Usage: npx tsx scripts/verify-encryption.ts [options]

Options:
  --db                   Also scan DB for residual plaintext / version mix
  --db-only              DB scan only (skip unit crypto checks)
  --unit-only            Unit crypto checks only (default)
  --batch-size=N         DB cursor page size (default 200)
  --expect-version=N     Fail if any encrypted row is not on version N (implies --db)
  -h, --help             Show this help
`);
      process.exit(0);
    } else if (arg.startsWith('-')) {
      throw new Error(`Unknown flag: ${arg}`);
    }
  }
  return opts;
};

const assert = (cond: boolean, msg: string) => {
  if (!cond) throw new Error(msg);
};

const runUnitChecks = () => {
  const plain = '1234567890';
  const sealed = encryptField(plain);
  assert(isEncryptedPayload(sealed), 'encrypted payload prefix');
  assert(decryptField(sealed) === plain, 'round-trip');
  assert(getPayloadVersion(sealed) === getActiveEncryptionVersion(), 'active version prefix');

  const ctx = 'user:bank';
  const detA = encryptFieldDeterministic('9876543210', ctx);
  const detB = encryptFieldDeterministic('9876543210', ctx);
  assert(detA === detB, 'deterministic seal');
  assert(decryptField(detA) === '9876543210', 'deterministic reveal');

  const payload = { id: 'pr-1', va: '123' };
  const jsonSealed = encryptJsonValue(payload);
  assert(
    decryptJsonValue(jsonSealed)?.toString() === '[object Object]' ||
      JSON.stringify(decryptJsonValue(jsonSealed)) === JSON.stringify(payload),
    'json round-trip',
  );

  let tamperFailed = false;
  try {
    decryptField(`${sealed.slice(0, -1)}X`);
    tamperFailed = false;
  } catch {
    tamperFailed = true;
  }
  assert(tamperFailed, 'tamper detection');

  const addrPlain = 'Jl. Merdeka No. 1';
  const addrSealed = sealAddress(addrPlain);
  assert(isEncryptedPayload(addrSealed!), 'address sealed');
  assert(revealAddress(addrSealed) === addrPlain, 'address reveal');
  assert(revealAddress(addrPlain) === addrPlain, 'address tolerant plaintext');

  const snap = { recipient: 'A', phone: '081', address: 'Jl. A' };
  const snapSealed = sealShippingAddressSnapshot(snap) as string;
  assert(typeof snapSealed === 'string' && isEncryptedPayload(snapSealed), 'snapshot sealed');
  assert(
    JSON.stringify(revealShippingAddressSnapshot(snapSealed)) === JSON.stringify(snap),
    'snapshot reveal',
  );
  assert(sealShippingAddressSnapshot(snapSealed) === snapSealed, 'snapshot no double-encrypt');
  assert(
    JSON.stringify(revealShippingAddressSnapshot(snap)) === JSON.stringify(snap),
    'snapshot tolerant legacy object',
  );

  const contactPlain = 'Budi Santoso';
  const contactSealed = sealShipmentContact(contactPlain);
  assert(isEncryptedPayload(contactSealed!), 'shipment contact sealed');
  assert(revealShipmentContact(contactSealed) === contactPlain, 'shipment contact reveal');
  assert(revealShipmentContact(contactPlain) === contactPlain, 'shipment contact tolerant');

  const shipmentPlain = {
    pickupAddress: 'Jl. Pickup 1',
    pickupContact: 'Seller',
    pickupPhone: '081111',
    deliveryAddress: 'Jl. Delivery 2',
    deliveryContact: 'Buyer',
    deliveryPhone: '082222',
    podReceivedBy: 'Penerima',
  };
  const shipmentSealed = {
    pickupAddress: sealAddress(shipmentPlain.pickupAddress) as string,
    pickupContact: sealShipmentContact(shipmentPlain.pickupContact) as string,
    pickupPhone: sealShipmentContact(shipmentPlain.pickupPhone) as string,
    deliveryAddress: sealAddress(shipmentPlain.deliveryAddress) as string,
    deliveryContact: sealShipmentContact(shipmentPlain.deliveryContact) as string,
    deliveryPhone: sealShipmentContact(shipmentPlain.deliveryPhone) as string,
    podReceivedBy: sealShipmentContact(shipmentPlain.podReceivedBy) as string,
  };
  assert(
    JSON.stringify(revealShipmentFields(shipmentSealed)) === JSON.stringify(shipmentPlain),
    'shipment fields reveal',
  );
  assert(
    JSON.stringify(revealShipmentFields(shipmentPlain)) === JSON.stringify(shipmentPlain),
    'shipment fields tolerant',
  );

  const namePlain = 'PT Demo Rekening';
  const nameSealed = sealAccountName(namePlain);
  assert(isEncryptedPayload(nameSealed!), 'accountName sealed');
  assert(revealAccountName(nameSealed) === namePlain, 'accountName reveal');
  assert(revealAccountName(namePlain) === namePlain, 'accountName tolerant');
  assert(sealAccountName(nameSealed) === nameSealed, 'accountName no double-encrypt');

  // Rotation helper: v1 → active (same key in unit env unless V2 set)
  const v1Forced = encryptField('rotate-me', '1');
  assert(getPayloadVersion(v1Forced) === '1', 'forced v1');
  const rotated = reencryptField(v1Forced, getActiveEncryptionVersion());
  assert(decryptField(rotated) === 'rotate-me', 'reencrypt round-trip');
  assert(reencryptField(rotated) === rotated, 'reencrypt idempotent on target');

  console.log('verify-encryption: unit OK');
};

const bumpResidual = (
  residual: FieldResidual,
  value: string | null | undefined,
  jsonMode = false,
) => {
  if (value == null || value === '') return;
  residual.nonNull += 1;
  if (jsonMode) {
    if (typeof value === 'string' && isEncryptedPayload(value)) {
      residual.encrypted += 1;
      const ver = getPayloadVersion(value) ?? '?';
      residual.byVersion[ver] = (residual.byVersion[ver] ?? 0) + 1;
    } else {
      // object or non-encrypted string → residual plaintext
      residual.plaintext += 1;
    }
    return;
  }
  if (isEncryptedPayload(value)) {
    residual.encrypted += 1;
    const ver = getPayloadVersion(value) ?? '?';
    residual.byVersion[ver] = (residual.byVersion[ver] ?? 0) + 1;
  } else {
    residual.plaintext += 1;
  }
};

const makeResidual = (table: string, field: string): FieldResidual => ({
  table,
  field,
  nonNull: 0,
  encrypted: 0,
  plaintext: 0,
  byVersion: {},
});

async function* cursorPages<T extends { id: string }>(
  fetchPage: (afterId: string | undefined, take: number) => Promise<T[]>,
  batchSize: number,
): AsyncGenerator<T[]> {
  let afterId: string | undefined;
  for (;;) {
    const page = await fetchPage(afterId, batchSize);
    if (page.length === 0) break;
    yield page;
    afterId = page[page.length - 1].id;
    if (page.length < batchSize) break;
  }
}

const runDbResidualScan = async (opts: CliOptions) => {
  const { default: prisma } = await import('../src/config/prisma');
  const residuals: FieldResidual[] = [];

  try {
    const payoutNumber = makeResidual('UserPayoutAccount', 'accountNumber');
    const payoutName = makeResidual('UserPayoutAccount', 'accountName');
    for await (const page of cursorPages(
      (afterId, take) =>
        prisma.userPayoutAccount.findMany({
          take,
          ...(afterId ? { cursor: { id: afterId }, skip: 1 } : {}),
          orderBy: { id: 'asc' },
          select: { id: true, accountNumber: true, accountName: true },
        }),
      opts.batchSize,
    )) {
      for (const row of page) {
        bumpResidual(payoutNumber, row.accountNumber);
        bumpResidual(payoutName, row.accountName);
      }
    }
    residuals.push(payoutNumber, payoutName);

    const providerActions = makeResidual('Transaction', 'providerActions');
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
    )) {
      for (const row of page) {
        const stored = row.providerActions;
        if (stored == null) continue;
        if (typeof stored === 'string') bumpResidual(providerActions, stored, true);
        else {
          providerActions.nonNull += 1;
          providerActions.plaintext += 1;
        }
      }
    }
    residuals.push(providerActions);

    const npwp = makeResidual('UserProfile', 'npwp');
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
    )) {
      for (const row of page) bumpResidual(npwp, row.npwp);
    }
    residuals.push(npwp);

    const platformAcct = makeResidual('PlatformBankAccount', 'accountNumber');
    for await (const page of cursorPages(
      (afterId, take) =>
        prisma.platformBankAccount.findMany({
          take,
          ...(afterId ? { cursor: { id: afterId }, skip: 1 } : {}),
          orderBy: { id: 'asc' },
          select: { id: true, accountNumber: true },
        }),
      opts.batchSize,
    )) {
      for (const row of page) bumpResidual(platformAcct, row.accountNumber);
    }
    residuals.push(platformAcct);

    const fullAddress = makeResidual('Address', 'fullAddress');
    const phoneNumber = makeResidual('Address', 'phoneNumber');
    for await (const page of cursorPages(
      (afterId, take) =>
        prisma.address.findMany({
          take,
          ...(afterId ? { cursor: { id: afterId }, skip: 1 } : {}),
          orderBy: { id: 'asc' },
          select: { id: true, fullAddress: true, phoneNumber: true },
        }),
      opts.batchSize,
    )) {
      for (const row of page) {
        bumpResidual(fullAddress, row.fullAddress);
        bumpResidual(phoneNumber, row.phoneNumber);
      }
    }
    residuals.push(fullAddress, phoneNumber);

    const taxId = makeResidual('UserVerification', 'taxId');
    const businessAddress = makeResidual('UserVerification', 'businessAddress');
    for await (const page of cursorPages(
      (afterId, take) =>
        prisma.userVerification.findMany({
          take,
          ...(afterId ? { cursor: { id: afterId }, skip: 1 } : {}),
          orderBy: { id: 'asc' },
          select: { id: true, taxId: true, businessAddress: true },
        }),
      opts.batchSize,
    )) {
      for (const row of page) {
        bumpResidual(taxId, row.taxId);
        bumpResidual(businessAddress, row.businessAddress);
      }
    }
    residuals.push(taxId, businessAddress);

    const snapshot = makeResidual('Order', 'shippingAddressSnapshot');
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
    )) {
      for (const row of page) {
        const stored = row.shippingAddressSnapshot;
        if (stored == null) continue;
        if (typeof stored === 'string') bumpResidual(snapshot, stored, true);
        else {
          snapshot.nonNull += 1;
          snapshot.plaintext += 1;
        }
      }
    }
    residuals.push(snapshot);

    const shipmentFields = [
      'pickupAddress',
      'pickupContact',
      'pickupPhone',
      'deliveryAddress',
      'deliveryContact',
      'deliveryPhone',
      'podReceivedBy',
    ] as const;
    const shipmentResiduals = Object.fromEntries(
      shipmentFields.map((f) => [f, makeResidual('BisaExpressShipment', f)]),
    ) as Record<(typeof shipmentFields)[number], FieldResidual>;
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
    )) {
      for (const row of page) {
        for (const f of shipmentFields) bumpResidual(shipmentResiduals[f], row[f]);
      }
    }
    residuals.push(...Object.values(shipmentResiduals));

    console.log('[verify] DB residual counts (values never printed):');
    console.log(
      'table.field'.padEnd(42) +
        'nonNull'.padStart(8) +
        'encrypted'.padStart(10) +
        'plaintext'.padStart(10) +
        '  versions',
    );
    let totalPlain = 0;
    let versionMismatch = 0;
    for (const r of residuals) {
      const versions =
        Object.keys(r.byVersion).length === 0
          ? '-'
          : Object.entries(r.byVersion)
              .map(([v, n]) => `v${v}=${n}`)
              .join(',');
      console.log(
        `${r.table}.${r.field}`.padEnd(42) +
          String(r.nonNull).padStart(8) +
          String(r.encrypted).padStart(10) +
          String(r.plaintext).padStart(10) +
          `  ${versions}`,
      );
      totalPlain += r.plaintext;
      if (opts.expectVersion) {
        for (const [ver, n] of Object.entries(r.byVersion)) {
          if (ver !== opts.expectVersion) versionMismatch += n;
        }
      }
    }

    if (totalPlain === 0) {
      console.log('[verify] residual plaintext: 0 — backfill complete for scanned fields.');
    } else {
      console.warn(
        `[verify] residual plaintext: ${totalPlain} — re-run migrate-encrypt before dropping tolerant readers.`,
      );
      process.exitCode = 1;
    }

    if (opts.expectVersion) {
      if (versionMismatch === 0) {
        console.log(`[verify] all ciphertext on v${opts.expectVersion}.`);
      } else {
        console.warn(
          `[verify] ${versionMismatch} ciphertext value(s) not on v${opts.expectVersion} — finish rotate-encryption-keys.`,
        );
        process.exitCode = 1;
      }
    }
  } finally {
    await prisma.$disconnect();
  }
};

const main = async () => {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.unit) runUnitChecks();
  if (opts.db) await runDbResidualScan(opts);
  if (!opts.unit && !opts.db) {
    console.log('Nothing to do. Pass --unit-only or --db.');
  }
};

main().catch((err) => {
  console.error('verify-encryption: FAILED', err);
  process.exitCode = 1;
});
