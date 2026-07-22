import logger from '../../src/config/logger.js';
import { faker } from '@faker-js/faker/locale/id_ID';
import { refreshProductAvailability } from './utils/refreshProductAvailability.util.js';

const daysFromNow = (days) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(10, 0, 0, 0);
  return d;
};

const daysAgo = (days) => {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(10, 0, 0, 0);
  return d;
};

export async function seedOrganicHarvest(prisma, users) {
  logger.info('🌱 [26] Seeding organic harvest lots & syncing availability...');

  await prisma.booking.deleteMany({});
  await prisma.productHarvestLot.deleteMany({});

  const demoSupplierIds = [users?.siti?.id, users?.green?.id].filter(Boolean);

  const organicProducts = await prisma.product.findMany({
    where: {
      productMode: 'ORGANIC_PRODUCE',
      OR: [
        { name: { contains: 'Demo' } },
        { availabilityType: { in: ['PRE_HARVEST', 'MIXED'] } },
        ...(demoSupplierIds.length > 0 ? [{ userId: { in: demoSupplierIds } }] : []),
      ],
    },
    select: { id: true, name: true, userId: true, availabilityType: true },
    take: 30,
    orderBy: { createdAt: 'desc' },
  });

  if (organicProducts.length === 0) {
    logger.warn('⚠️ [26] Tidak ada produk organik — lewati harvest lots.');
    return { lotCount: 0, productIds: [] };
  }

  const picked = organicProducts.slice(0, Math.min(25, organicProducts.length));
  let lotCount = 0;
  const touchedProductIds = new Set();

  for (let i = 0; i < picked.length; i++) {
    const product = picked[i];
    touchedProductIds.add(product.id);

    const isDemo = product.name.includes('Demo');
    const lots = [];

    lots.push({
      productId: product.id,
      seasonLabel: isDemo ? 'Musim Hujan 2026' : `Panen ${faker.date.month()}`,
      expectedHarvestDate: daysFromNow(isDemo ? 21 : faker.number.int({ min: 14, max: 90 })),
      expectedQuantityTon: faker.number.float({ min: 2, max: 20, fractionDigits: 2 }),
      reservedQuantityTon: 0,
      status: 'SCHEDULED',
      notes: isDemo ? 'Lot demo untuk booking pre-harvest.' : null,
    });

    lots.push({
      productId: product.id,
      seasonLabel: 'Panen dekat (7 hari)',
      expectedHarvestDate: daysFromNow(7),
      expectedQuantityTon: faker.number.float({ min: 1, max: 8, fractionDigits: 2 }),
      reservedQuantityTon: faker.number.float({ min: 0.5, max: 2, fractionDigits: 2 }),
      status: 'SCHEDULED',
    });

    if (i % 3 === 0) {
      lots.push({
        productId: product.id,
        seasonLabel: 'Panen selesai (historis)',
        expectedHarvestDate: daysAgo(30),
        expectedQuantityTon: faker.number.float({ min: 3, max: 12, fractionDigits: 2 }),
        actualHarvestDate: daysAgo(28),
        actualQuantityTon: faker.number.float({ min: 2.5, max: 11, fractionDigits: 2 }),
        status: 'STOCKED',
        stockedAt: daysAgo(27),
      });
    }

    if (i === 0) {
      lots.push({
        productId: product.id,
        seasonLabel: 'Lot dibatalkan',
        expectedHarvestDate: daysFromNow(45),
        expectedQuantityTon: 4,
        status: 'CANCELLED',
        notes: 'Cuaca ekstrem — lot dibatalkan.',
      });
    }

    for (const lot of lots) {
      await prisma.productHarvestLot.create({ data: lot });
      lotCount++;
    }

    await refreshProductAvailability(prisma, product.id);
  }

  logger.info(`✅ [26] ${lotCount} harvest lots untuk ${picked.length} produk organik.`);
  return { lotCount, productIds: [...touchedProductIds] };
}
