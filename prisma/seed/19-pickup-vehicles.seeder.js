import logger from '../../src/config/logger.js';
import process from 'node:process';

const defaultPickupVehicleOptions = [
  {
    code: 'Motor',
    label: 'Motorcycle Pickup',
    minTotalWeight: 0,
    maxPerOrderWeight: 5,
    weightUnit: 'KG',
    notes: 'Untuk paket ringan. Maksimal 5 kg per order.',
  },
  {
    code: 'Mobil',
    label: 'Car Pickup',
    minTotalWeight: 0,
    weightUnit: 'KG',
    notes: 'Untuk pickup multi-order beban menengah.',
  },
  {
    code: 'Truk',
    label: 'Truck Pickup',
    minTotalWeight: 10,
    weightUnit: 'KG',
    notes: 'Direkomendasikan untuk total beban >= 10 kg.',
  },
];

export async function seedPickupVehicles(prisma) {
  logger.info('🌱 [19] Seeding Pickup Vehicle & Couriers tables...');

  const activeVehicleCodes = defaultPickupVehicleOptions.map((it) => it.code);
  await prisma.shippingPickupVehicle.updateMany({
    where: { code: { notIn: activeVehicleCodes } },
    data: { isActive: false },
  });

  for (let i = 0; i < defaultPickupVehicleOptions.length; i += 1) {
    const item = defaultPickupVehicleOptions[i];
    await prisma.shippingPickupVehicle.upsert({
      where: { code: item.code },
      update: {
        label: item.label,
        minTotalWeight: item.minTotalWeight,
        maxPerOrderWeight: item.maxPerOrderWeight ?? null,
        weightUnit: item.weightUnit,
        notes: item.notes,
        isActive: true,
        sortOrder: i,
      },
      create: {
        code: item.code,
        label: item.label,
        minTotalWeight: item.minTotalWeight,
        maxPerOrderWeight: item.maxPerOrderWeight ?? null,
        weightUnit: item.weightUnit,
        notes: item.notes,
        isActive: true,
        sortOrder: i,
      },
    });
  }

  const courierCodes = (
    process.env.RAJAONGKIR_DEFAULT_COURIERS || 'jne:jnt:sicepat:anteraja:tiki:pos'
  )
    .split(':')
    .map((it) => it.trim().toLowerCase())
    .filter((it) => it.length >= 2);

  await prisma.shippingCourier.updateMany({
    where: { code: { notIn: courierCodes } },
    data: { isActive: false },
  });
  for (let i = 0; i < courierCodes.length; i += 1) {
    const code = courierCodes[i];
    await prisma.shippingCourier.upsert({
      where: { code },
      update: {
        label: code.toUpperCase(),
        isActive: true,
        sortOrder: i,
      },
      create: {
        code,
        label: code.toUpperCase(),
        isActive: true,
        sortOrder: i,
      },
    });
  }

  logger.info('✅ [19] Pickup vehicles & active couriers seeded.');
}
