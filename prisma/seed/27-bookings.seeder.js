import logger from '../../src/config/logger.js';
import { faker } from '@faker-js/faker/locale/id_ID';

export async function seedBookings(prisma, users) {
  logger.info('🌱 [27] Seeding bookings (pre-harvest)...');

  await prisma.booking.deleteMany({ where: { bookingNumber: { startsWith: 'BKG-SEED-' } } });

  const buyer = users?.hendra ?? users?.allBuyers?.[0];
  const supplier = users?.siti ?? users?.allSuppliers?.[0];
  if (!buyer || !supplier) {
    logger.warn('⚠️ [27] Buyer/supplier tidak ditemukan — lewati bookings.');
    return 0;
  }

  const organicProducts = await prisma.product.findMany({
    where: {
      productMode: 'ORGANIC_PRODUCE',
      userId: supplier.id,
      OR: [{ name: { contains: 'Demo' } }, { availabilityType: { in: ['PRE_HARVEST', 'MIXED'] } }],
    },
    take: 5,
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      minOrder: true,
      pricePerUnit: true,
      unit: true,
    },
  });

  if (organicProducts.length === 0) {
    logger.warn('⚠️ [27] Tidak ada produk organik untuk booking.');
    return 0;
  }

  const lots = await prisma.productHarvestLot.findMany({
    where: {
      productId: { in: organicProducts.map((p) => p.id) },
      status: 'SCHEDULED',
      expectedHarvestDate: { gte: new Date() },
    },
    orderBy: { expectedHarvestDate: 'asc' },
    take: 10,
  });

  const lotByProduct = new Map();
  for (const lot of lots) {
    if (!lotByProduct.has(lot.productId)) lotByProduct.set(lot.productId, lot);
  }

  const statuses = [
    'PENDING_PAYMENT',
    'CONFIRMED',
    'CONFIRMED',
    'FULFILLED',
    'EXPIRED',
    'CANCELLED',
  ];

  let created = 0;
  for (let i = 0; i < Math.min(statuses.length, organicProducts.length + 2); i++) {
    const product = organicProducts[i % organicProducts.length];
    const lot = lotByProduct.get(product.id);
    const qty = Math.max(Number(product.minOrder ?? 5), 10);
    const price = Number(product.pricePerUnit);
    const status = statuses[i];
    const expiresAt = new Date(Date.now() + (status === 'EXPIRED' ? -86400000 : 86400000));

    let orderId = null;
    if (status === 'FULFILLED') {
      const existingOrder = await prisma.order.findFirst({
        where: { buyerId: buyer.id, sellerId: supplier.id, status: 'COMPLETED' },
        select: { id: true },
      });
      orderId = existingOrder?.id ?? null;
    }

    await prisma.booking.create({
      data: {
        bookingNumber: `BKG-SEED-${String(i + 1).padStart(2, '0')}`,
        buyerId: buyer.id,
        supplierId: supplier.id,
        productId: product.id,
        harvestLotId: lot?.id ?? null,
        productMode: 'ORGANIC_PRODUCE',
        quantity: qty,
        unit: product.unit ?? 'KG',
        priceSnapshot: price,
        subtotalSnapshot: price * qty,
        status,
        expiresAt,
        expectedDeliveryDate:
          lot?.expectedHarvestDate ??
          faker.date.soon({ days: faker.number.int({ min: 14, max: 45 }) }),
        notes:
          status === 'CANCELLED'
            ? 'Dibatalkan buyer — jadwal tidak cocok.'
            : 'Booking demo seed pre-harvest.',
        orderId,
        confirmedAt: ['CONFIRMED', 'FULFILLED'].includes(status) ? new Date() : null,
        cancelledById: status === 'CANCELLED' ? buyer.id : null,
        cancelReason: status === 'CANCELLED' ? 'Perubahan kebutuhan gudang' : null,
      },
    });
    created++;
  }

  logger.info(`✅ [27] ${created} booking demo seeded.`);
  return created;
}
