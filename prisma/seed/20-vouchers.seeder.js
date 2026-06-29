import logger from '../../src/config/logger.js';

/**
 * FB-24 — Demo voucher codes for cart checkout QA.
 * Upsert by `code` — safe to re-run.
 */
export async function seedVouchers(prisma, users) {
  logger.info('🌱 [20] Seeding Vouchers (FB-24)...');

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 90);

  const supplierId = users?.siti?.id ?? users?.allSuppliers?.[0]?.id ?? null;

  const rows = [
    {
      code: 'BISA10',
      type: 'PERCENT',
      value: 10,
      minOrderAmount: 100_000,
      maxDiscount: 50_000,
      scope: 'PLATFORM',
      supplierId: null,
      usageLimit: 1000,
      usagePerUser: 1,
      description: 'Platform 10%, max Rp 50.000, min order Rp 100.000',
    },
    {
      code: 'HEMAT25K',
      type: 'FIXED',
      value: 25_000,
      minOrderAmount: 200_000,
      maxDiscount: null,
      scope: 'PLATFORM',
      supplierId: null,
      usageLimit: 500,
      usagePerUser: 2,
      description: 'Potongan tetap Rp 25.000, min order Rp 200.000',
    },
    {
      code: 'WELCOME5',
      type: 'PERCENT',
      value: 5,
      minOrderAmount: 50_000,
      maxDiscount: 25_000,
      scope: 'PLATFORM',
      supplierId: null,
      usageLimit: null,
      usagePerUser: 1,
      description: 'Welcome 5%, max Rp 25.000',
    },
  ];

  if (supplierId) {
    rows.push({
      code: 'TOKOABC15',
      type: 'PERCENT',
      value: 15,
      minOrderAmount: 50_000,
      maxDiscount: 100_000,
      scope: 'SUPPLIER',
      supplierId,
      usageLimit: 200,
      usagePerUser: 1,
      description: `Supplier-only 15% (supplier ${supplierId.slice(0, 8)}…)`,
    });
  }

  for (const row of rows) {
    const { description, ...data } = row;
    await prisma.voucher.upsert({
      where: { code: data.code },
      update: {
        type: data.type,
        value: data.value,
        minOrderAmount: data.minOrderAmount,
        maxDiscount: data.maxDiscount,
        scope: data.scope,
        supplierId: data.supplierId,
        usageLimit: data.usageLimit,
        usagePerUser: data.usagePerUser,
        expiresAt,
        isActive: true,
      },
      create: {
        ...data,
        usageCount: 0,
        startsAt: new Date(),
        expiresAt,
        isActive: true,
      },
    });
    logger.info(`   ✓ ${data.code} — ${description}`);
  }

  logger.info(`✅ [20] ${rows.length} voucher demo seeded (expires ${expiresAt.toISOString().slice(0, 10)}).`);
}
