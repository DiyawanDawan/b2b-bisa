import logger from '../../src/config/logger.js';
import { faker } from '@faker-js/faker/locale/id_ID';

export async function seedAnalytics(prisma) {
  logger.info('🌱 [07] Seeding Market Trends & Waste Data (10+ Data)...');

  await prisma.marketTrend.deleteMany({});
  await prisma.wasteData.deleteMany({});

  const categories = ['CARBON', 'BIOMASSA', 'LOGISTICS'];
  const trendTypes = ['UP', 'DOWN', 'STABLE'];

  // 10 Market Trends
  for (let i = 0; i < 10; i++) {
    const history = Array.from({ length: 5 }, () => faker.number.int({ min: 1000, max: 20000 }));
    await prisma.marketTrend.create({
      data: {
        label: `Trend ${faker.commerce.productMaterial()} ${faker.location.city()}`,
        currentValue: `${faker.number.int({ min: 10, max: 50 })}%`,
        trendType: faker.helpers.arrayElement(trendTypes),
        category: faker.helpers.arrayElement(categories),
        historyData: JSON.stringify(history),
      },
    });
  }

  // 10 Waste Data Records
  const biomassaTypes = ['SEKAM_PADI', 'TONGKOL_JAGUNG', 'TEMPURUNG_KELAPA', 'BIOCHAR'];
  for (let i = 0; i < 10; i++) {
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
