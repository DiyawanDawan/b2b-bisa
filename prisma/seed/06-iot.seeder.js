import logger from '../../src/config/logger.js';
import { faker } from '@faker-js/faker/locale/id_ID';

const IOT_ONLINE_TIMEOUT_MS = 5 * 60 * 1000;

async function seedDeviceTelemetry(prisma, device, { readingCount = 8, withAlert = false }) {
  for (let i = 0; i < readingCount; i++) {
    const isAlertReading = withAlert && i === readingCount - 1;
    const recordedAt = new Date(Date.now() - (readingCount - i) * 3 * 60 * 1000);

    await prisma.iotReading.create({
      data: {
        deviceId: device.id,
        temperature: isAlertReading
          ? faker.number.float({ min: 620, max: 750, fractionDigits: 1 })
          : faker.number.float({ min: 280, max: 460, fractionDigits: 1 }),
        humidity: faker.number.float({ min: 8, max: 22, fractionDigits: 1 }),
        co2Level: faker.number.float({ min: 380, max: 680, fractionDigits: 1 }),
        recordedAt,
      },
    });

    if (isAlertReading) {
      await prisma.iotAlert.create({
        data: {
          deviceId: device.id,
          alertType: 'OVERHEATING',
          message: 'Suhu tungku melewati batas wajar. Segera periksa lokasi produksi.',
          temperature: faker.number.float({ min: 620, max: 750, fractionDigits: 1 }),
          isRead: false,
        },
      });
    }
  }
}

export async function seedIoT(prisma, users) {
  logger.info('🌱 [06] Seeding IoT Devices, Telemetry & AI...');

  await prisma.iotAlert.deleteMany({});
  await prisma.iotReading.deleteMany({});
  await prisma.iotDevice.deleteMany({});
  await prisma.aIPrediction.deleteMany({});

  if (!users?.allSuppliers?.length) {
    logger.warn('⚠️ [06] Tidak ada supplier — IoT dilewati.');
    return;
  }

  const demoDevicePlans = new Map();

  if (users.siti?.id) {
    demoDevicePlans.set(users.siti.id, [
      {
        deviceId: 'BISA-IOT-SITI-001',
        name: 'Tungku Biochar Utama',
        status: 'ACTIVE',
        readingCount: 12,
        withAlert: true,
      },
      {
        deviceId: 'BISA-IOT-SITI-002',
        name: 'Gudang Sayur Organik',
        status: 'ACTIVE',
        readingCount: 6,
        withAlert: false,
      },
      {
        deviceId: 'BISA-IOT-SITI-OLD',
        name: 'Mesin Produksi (Nonaktif)',
        status: 'INACTIVE',
        readingCount: 3,
        withAlert: false,
        oldReadings: true,
      },
    ]);
  }

  if (users.green?.id) {
    demoDevicePlans.set(users.green.id, [
      {
        deviceId: 'BISA-IOT-GREEN-001',
        name: 'Kiln Green Earth A',
        status: 'ACTIVE',
        readingCount: 10,
        withAlert: false,
      },
      {
        deviceId: 'BISA-IOT-GREEN-002',
        name: 'Sensor Gudang Ekspor',
        status: 'MAINTENANCE',
        readingCount: 2,
        withAlert: false,
        oldReadings: true,
      },
    ]);
  }

  let deviceTotal = 0;

  for (const supplier of users.allSuppliers) {
    const plans = demoDevicePlans.get(supplier.id) ?? [
      {
        deviceId: `BISA-IOT-${faker.string.numeric(5)}`,
        name: `Sensor ${faker.commerce.productMaterial()} ${faker.location.city()}`,
        status: faker.helpers.arrayElement(['ACTIVE', 'INACTIVE']),
        readingCount: faker.number.int({ min: 4, max: 8 }),
        withAlert: false,
      },
    ];

    for (const plan of plans) {
      const device = await prisma.iotDevice.create({
        data: {
          userId: supplier.id,
          deviceId: plan.deviceId,
          deviceSecret: faker.string.hexadecimal({ length: 64, prefix: '' }).toLowerCase(),
          name: plan.name,
          status: plan.status,
          thresholdMin: 200,
          thresholdMax: 600,
          lat: faker.location.latitude(),
          lng: faker.location.longitude(),
          ownedAt: faker.date.recent({ days: 30 }),
        },
      });
      deviceTotal++;

      if (plan.status === 'ACTIVE' || plan.readingCount > 0) {
        if (plan.oldReadings) {
          for (let i = 0; i < plan.readingCount; i++) {
            await prisma.iotReading.create({
              data: {
                deviceId: device.id,
                temperature: faker.number.float({ min: 250, max: 400, fractionDigits: 1 }),
                humidity: faker.number.float({ min: 10, max: 25, fractionDigits: 1 }),
                co2Level: faker.number.float({ min: 350, max: 500, fractionDigits: 1 }),
                recordedAt: new Date(Date.now() - IOT_ONLINE_TIMEOUT_MS - i * 3600000),
              },
            });
          }
        } else {
          await seedDeviceTelemetry(prisma, device, {
            readingCount: plan.readingCount,
            withAlert: plan.withAlert,
          });
        }
      }
    }

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

  logger.info(`✅ [06] ${deviceTotal} perangkat IoT + prediksi AI untuk supplier.`);
}
