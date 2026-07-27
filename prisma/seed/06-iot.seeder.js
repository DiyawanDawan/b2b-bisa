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
  logger.info('🌱 [06] Seeding IoT Devices, Telemetry, Plans & Durations...');

  // Seed Initial Subscription Plans & Durations if empty
  const planCount = await prisma.iotSubscriptionPlan.count();
  if (planCount === 0) {
    const initialPlans = [
      {
        code: 'rental',
        title: 'Sewa Perangkat IoT + Software PRO',
        monthlyRate: 150000,
        hardwarePrice: 0,
        unit: '/ bulan',
        tag: 'Rekomendasi',
        description:
          'Termasuk perangkat IoT fisik disewakan & akses penuh aplikasi PRO. Tanpa deposit.',
        icon: 'cpu',
        sortOrder: 1,
        featuresJson: [
          { key: 'ownership', label: 'Kepemilikan Alat IoT', text: 'Pinjam / Sewa', ok: null },
          { key: 'device_cost', label: 'Biaya Perangkat', text: 'Rp 0 (termasuk sewa)', ok: null },
          { key: 'software_cost', label: 'Biaya Software/Bln', text: 'Rp 150.000', ok: null },
          { key: 'pro_access', label: 'Akses Fitur PRO', text: null, ok: true },
          { key: 'multi_discount', label: 'Diskon Multi-Bulan', text: null, ok: true },
          { key: 'temp_monitor', label: 'Monitoring Suhu Real-time', text: null, ok: true },
          { key: 'auto_alert', label: 'Alert Otomatis', text: null, ok: true },
          { key: 'no_deposit', label: 'Tanpa Deposit', text: null, ok: true },
          { key: 'return_cancel', label: 'Alat Kembali Jika Berhenti', text: null, ok: true },
          { key: 'long_invest', label: 'Investasi Jangka Panjang', text: null, ok: false },
        ],
      },
      {
        code: 'buy_hardware',
        title: 'Beli Alat Fisik + Langganan Software',
        monthlyRate: 99000,
        hardwarePrice: 3000000,
        unit: ' (1x Bayar) + Rp 99.000/bln',
        tag: 'Hak Milik',
        description:
          'Perangkat IoT jadi hak milik pribadi + biaya langganan bulanan software lebih hemat.',
        icon: 'shoppingBag',
        sortOrder: 2,
        featuresJson: [
          { key: 'ownership', label: 'Kepemilikan Alat IoT', text: 'Hak Milik Pribadi', ok: null },
          { key: 'device_cost', label: 'Biaya Perangkat', text: 'Rp 3.000.000 (1x)', ok: null },
          { key: 'software_cost', label: 'Biaya Software/Bln', text: 'Rp 99.000', ok: null },
          { key: 'pro_access', label: 'Akses Fitur PRO', text: null, ok: true },
          { key: 'multi_discount', label: 'Diskon Multi-Bulan', text: null, ok: true },
          { key: 'temp_monitor', label: 'Monitoring Suhu Real-time', text: null, ok: true },
          { key: 'auto_alert', label: 'Alert Otomatis', text: null, ok: true },
          { key: 'no_deposit', label: 'Tanpa Deposit', text: null, ok: false },
          { key: 'return_cancel', label: 'Alat Kembali Jika Berhenti', text: null, ok: false },
          { key: 'long_invest', label: 'Investasi Jangka Panjang', text: null, ok: true },
        ],
      },
      {
        code: 'software_only',
        title: 'Langganan Software PRO Saja',
        monthlyRate: 99000,
        hardwarePrice: 0,
        unit: '/ bulan',
        tag: 'Software Only',
        description: 'Khusus bagi mitra/pengguna yang sudah memiliki alat IoT fisik terpasang.',
        icon: 'sparkles',
        sortOrder: 3,
        featuresJson: [
          { key: 'ownership', label: 'Kepemilikan Alat IoT', text: '—', ok: false },
          { key: 'device_cost', label: 'Biaya Perangkat', text: 'Sudah punya alat', ok: null },
          { key: 'software_cost', label: 'Biaya Software/Bln', text: 'Rp 99.000', ok: null },
          { key: 'pro_access', label: 'Akses Fitur PRO', text: null, ok: true },
          { key: 'multi_discount', label: 'Diskon Multi-Bulan', text: null, ok: true },
          { key: 'temp_monitor', label: 'Monitoring Suhu Real-time', text: null, ok: true },
          { key: 'auto_alert', label: 'Alert Otomatis', text: null, ok: true },
          { key: 'no_deposit', label: 'Tanpa Deposit', text: null, ok: false },
          { key: 'return_cancel', label: 'Alat Kembali Jika Berhenti', text: null, ok: false },
          { key: 'long_invest', label: 'Investasi Jangka Panjang', text: null, ok: false },
        ],
      },
    ];

    for (const p of initialPlans) {
      await prisma.iotSubscriptionPlan.create({ data: p });
    }
  }

  const durationCount = await prisma.iotSubscriptionDuration.count();
  if (durationCount === 0) {
    const initialDurations = [
      {
        months: 1,
        label: '1 Bulan',
        discountType: 'PERCENTAGE',
        discountValue: 0,
        discountRate: 0,
        discountLabel: null,
        sortOrder: 1,
      },
      {
        months: 3,
        label: '3 Bulan',
        discountType: 'PERCENTAGE',
        discountValue: 5,
        discountRate: 0.05,
        discountLabel: 'Hemat 5%',
        sortOrder: 2,
      },
      {
        months: 6,
        label: '6 Bulan',
        discountType: 'PERCENTAGE',
        discountValue: 10,
        discountRate: 0.1,
        discountLabel: 'Hemat 10%',
        sortOrder: 3,
      },
      {
        months: 12,
        label: '12 Bulan',
        discountType: 'PERCENTAGE',
        discountValue: 15,
        discountRate: 0.15,
        discountLabel: 'Hemat 15%',
        sortOrder: 4,
      },
    ];

    for (const d of initialDurations) {
      await prisma.iotSubscriptionDuration.create({ data: d });
    }
  }

  const existingIoT = await prisma.iotDevice.count();
  if (existingIoT > 0) {
    logger.info('   ↳ IoT Devices already seeded, skipping device creation...');
    return;
  }

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
