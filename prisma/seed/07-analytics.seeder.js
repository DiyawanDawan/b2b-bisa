import logger from '../../src/config/logger.js';
import { faker } from '@faker-js/faker/locale/id_ID';

export async function seedAnalytics(prisma) {
  logger.info('🌱 [07] Seeding Waste Data (market trends di 11-market.seeder.js)...');

  await prisma.wasteData.deleteMany({
    where: {
      NOT: { source: { contains: 'BPS' } },
    },
  });

  const biomassaTypes = ['SEKAM_PADI', 'TONGKOL_JAGUNG', 'TEMPURUNG_KELAPA', 'BIOCHAR'];
  for (let i = 0; i < 6; i++) {
    await prisma.wasteData.create({
      data: {
        province: faker.location.state(),
        regency: faker.location.city(),
        biomassaType: faker.helpers.arrayElement(biomassaTypes),
        volumeTon: faker.number.float({ min: 10000, max: 500000, fractionDigits: 1 }),
        year: faker.helpers.arrayElement([2023, 2024, 2025]),
        source: `BPS ${faker.helpers.arrayElement([2023, 2024, 2025])}`,
        lat: faker.location.latitude(),
        lng: faker.location.longitude(),
      },
    });
  }

  console.log('✅ [07] 10+ Analytics seeded.');
}
