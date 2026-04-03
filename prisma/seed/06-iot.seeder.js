import logger from '../../src/config/logger.js';
import { faker } from '@faker-js/faker/locale/id_ID';

export async function seedIoT(prisma, users) {
  logger.info('🌱 [06] Seeding Full IoT Telemetry & AI (10+ Data)...');

  await prisma.iotDevice.deleteMany({});
  await prisma.aIPrediction.deleteMany({});

  if (!users.allSuppliers || users.allSuppliers.length === 0) return;

  // 1 IoT Device per Supplier
  for (const supplier of users.allSuppliers) {
    const deviceIdStr = `BISA-IOT-${faker.string.numeric(5)}`;

    const device = await prisma.iotDevice.upsert({
      where: { deviceId: deviceIdStr },
      update: {},
      create: {
        userId: supplier.id,
        deviceId: deviceIdStr,
        name: `Mesin ${faker.commerce.productMaterial()} ${faker.location.city()}`,
        status: faker.helpers.arrayElement(['ACTIVE', 'INACTIVE', 'MAINTENANCE']),
        lat: faker.location.latitude(),
        lng: faker.location.longitude(),
      },
    });

    // Generate 5-10 Readings per device
    const readingCount = faker.number.int({ min: 5, max: 10 });
    for (let i = 0; i < readingCount; i++) {
      const isAlert = i === 2; // Simulate an overheating event
      await prisma.iotReading.create({
        data: {
          deviceId: device.id,
          temperature: isAlert
            ? faker.number.float({ min: 500, max: 800, fractionDigits: 1 })
            : faker.number.float({ min: 300, max: 480, fractionDigits: 1 }),
          humidity: faker.number.float({ min: 5, max: 20, fractionDigits: 1 }),
          co2Level: faker.number.float({ min: 350, max: 700, fractionDigits: 1 }),
        },
      });

      if (isAlert) {
        await prisma.iotAlert.create({
          data: {
            deviceId: device.id,
            alertType: faker.helpers.arrayElement(['OVERHEATING', 'SENSOR_FAILURE']),
            message: 'Suhu tungku melewati batas wajar (>500C). Segera kurangi suplai oksigen.',
            temperature: faker.number.float({ min: 500, max: 800, fractionDigits: 1 }),
          },
        });
      }
    }

    // Generate 1-2 AI Predictions per supplier
    for (let j = 0; j < 2; j++) {
      await prisma.aIPrediction.create({
        data: {
          userId: supplier.id,
          biomassaType: faker.helpers.arrayElement([
            'SEKAM_PADI',
            'TONGKOL_JAGUNG',
            'TEMPURUNG_KELAPA',
          ]),
          suhuPirolisis: faker.number.float({ min: 400, max: 600, fractionDigits: 1 }),
          waktuPembakaran: faker.number.int({ min: 120, max: 300 }),
          beratInput: faker.number.float({ min: 500, max: 2000, fractionDigits: 1 }),
          predictedGrade: faker.helpers.arrayElement(['A', 'B', 'C']),
          predictedYield: faker.number.float({ min: 20, max: 40, fractionDigits: 1 }),
          cOrganik: faker.number.float({ min: 70, max: 95, fractionDigits: 1 }),
          dosis: faker.number.float({ min: 2, max: 10, fractionDigits: 1 }),
          rawOutput: JSON.stringify({
            confidence_score: faker.number.float({ min: 0.8, max: 0.99, fractionDigits: 2 }),
          }),
        },
      });
    }
  }

  console.log('✅ [06] 10+ IoT Devices & AI Predictions seeded.');
}
