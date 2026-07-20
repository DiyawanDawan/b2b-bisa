import logger from '../../src/config/logger.js';

/** Zone code dari nama GIS province (bukan keyword hardcode). */
const zoneFromProvinceName = (name) =>
  name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_|_$/g, '');

export async function seedBisaExpress(prisma) {
  logger.info('🌱 [24] Seeding BISA Express coverage, rates, hubs, courier...');

  await prisma.shippingCourier.upsert({
    where: { code: 'bisa_express' },
    update: {
      label: 'BISA Express',
      isActive: true,
      sortOrder: 0,
    },
    create: {
      code: 'bisa_express',
      label: 'BISA Express',
      isActive: true,
      sortOrder: 0,
    },
  });

  // Aturan layanan vs berat — UnitStatus (KG/TON), admin ubah lewat /service-rules
  const serviceRuleSeeds = [
    {
      serviceType: 'VIP_EXPRESS',
      label: 'VIP Express',
      minWeight: 0,
      maxWeight: 999_999,
      weightUnit: 'KG',
      alwaysAvailable: true,
      sortOrder: 5,
      note: 'Selalu tersedia · ontime · tarif premium',
    },
    {
      serviceType: 'SAME_DAY',
      label: 'Same Day',
      minWeight: 0,
      maxWeight: 20,
      weightUnit: 'KG',
      alwaysAvailable: false,
      sortOrder: 10,
      note: 'Maks 20 KG · intra-zona',
    },
    {
      serviceType: 'EXPRESS',
      label: 'Express',
      minWeight: 0,
      maxWeight: 50,
      weightUnit: 'KG',
      alwaysAvailable: false,
      sortOrder: 20,
      note: 'Maks 50 KG · 1-2 hari',
    },
    {
      serviceType: 'REGULER',
      label: 'Reguler',
      minWeight: 0,
      maxWeight: 50,
      weightUnit: 'KG',
      alwaysAvailable: false,
      sortOrder: 30,
      note: 'Maks 50 KG · 2-5 hari',
    },
    {
      serviceType: 'CARGO',
      label: 'Cargo',
      minWeight: 0.05,
      maxWeight: 999_999,
      weightUnit: 'TON',
      alwaysAvailable: false,
      sortOrder: 40,
      note: 'Wajib untuk ≥ 0.05 TON',
    },
  ];
  for (const rule of serviceRuleSeeds) {
    await prisma.bisaExpressServiceRule.upsert({
      where: { serviceType: rule.serviceType },
      update: {
        label: rule.label,
        minWeight: rule.minWeight,
        maxWeight: rule.maxWeight,
        weightUnit: rule.weightUnit,
        alwaysAvailable: rule.alwaysAvailable,
        sortOrder: rule.sortOrder,
        note: rule.note,
        isActive: true,
      },
      create: rule,
    });
  }
  logger.info(`[24] Service rules: ${serviceRuleSeeds.length} layanan`);

  // Coverage 100% dari GIS provinces — tidak tulis keyword manual
  await prisma.bisaExpressCoverage.deleteMany({});
  const provinces = await prisma.province.findMany({
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });

  const zoneByProvinceId = new Map();
  for (const p of provinces) {
    const zone = zoneFromProvinceName(p.name);
    zoneByProvinceId.set(p.id, zone);
    await prisma.bisaExpressCoverage.create({
      data: {
        provinceId: p.id,
        regencyId: null,
        zone,
        isPickup: true,
        isDelivery: true,
        isActive: true,
      },
    });
  }
  logger.info(`[24] Coverage GIS: ${provinces.length} provinsi → zone otomatis`);

  // Override opsional: kab/kota khusus → JABODETABEK bila ada di GIS regencies
  const jabodetabekTargets = [
    { provinceName: 'Jawa Barat', regencyContains: 'Bekasi' },
    { provinceName: 'Jawa Barat', regencyContains: 'Bogor' },
    { provinceName: 'Jawa Barat', regencyContains: 'Depok' },
    { provinceName: 'Banten', regencyContains: 'Tangerang' },
  ];
  for (const t of jabodetabekTargets) {
    const province = provinces.find((p) => p.name === t.provinceName);
    if (!province) continue;
    const regency = await prisma.regency.findFirst({
      where: {
        provinceId: province.id,
        name: { contains: t.regencyContains },
      },
      select: { id: true },
    });
    if (!regency) continue;
    await prisma.bisaExpressCoverage.create({
      data: {
        provinceId: province.id,
        regencyId: regency.id,
        zone: 'JABODETABEK',
        isPickup: true,
        isDelivery: true,
        isActive: true,
      },
    });
  }

  const zones = [...new Set(zoneByProvinceId.values())];
  if (provinces.some((p) => p.name === 'DKI Jakarta') && !zones.includes('JABODETABEK')) {
    zones.push('JABODETABEK');
  }

  const rateSeeds = [];
  for (const zone of zones) {
    rateSeeds.push(
      {
        originZone: zone,
        destinationZone: zone,
        serviceType: 'REGULER',
        minWeight: 0,
        maxWeight: 50,
        baseCost: 15000,
        perUnitCost: 2500,
        weightUnit: 'KG',
        etdDays: 1,
      },
      {
        originZone: zone,
        destinationZone: zone,
        serviceType: 'EXPRESS',
        minWeight: 0,
        maxWeight: 50,
        baseCost: 28000,
        perUnitCost: 4000,
        weightUnit: 'KG',
        etdDays: 1,
      },
      {
        originZone: zone,
        destinationZone: zone,
        serviceType: 'CARGO',
        minWeight: 0.05,
        maxWeight: 999_999,
        baseCost: 50000,
        perUnitCost: 1_500_000,
        weightUnit: 'TON',
        etdDays: 2,
      },
      {
        originZone: zone,
        destinationZone: zone,
        serviceType: 'VIP_EXPRESS',
        minWeight: 0,
        maxWeight: 999_999,
        baseCost: 120000,
        perUnitCost: 8000,
        weightUnit: 'KG',
        etdDays: 0,
      },
    );
    if (zone === 'JABODETABEK' || zone === 'DKI_JAKARTA') {
      rateSeeds.push({
        originZone: zone,
        destinationZone: zone,
        serviceType: 'SAME_DAY',
        minWeight: 0,
        maxWeight: 20,
        baseCost: 15000,
        perUnitCost: 3000,
        weightUnit: 'KG',
        etdDays: 0,
      });
    }
  }

  const crossPairs = [
    ['JAWA_BARAT', 'JAWA_TIMUR'],
    ['JAWA_TENGAH', 'JAWA_TIMUR'],
    ['DKI_JAKARTA', 'JAWA_BARAT'],
  ];
  for (const [a, b] of crossPairs) {
    if (!zones.includes(a) || !zones.includes(b)) continue;
    rateSeeds.push(
      {
        originZone: a,
        destinationZone: b,
        serviceType: 'REGULER',
        minWeight: 0,
        maxWeight: 50,
        baseCost: 25000,
        perUnitCost: 3500,
        weightUnit: 'KG',
        etdDays: 3,
      },
      {
        originZone: a,
        destinationZone: b,
        serviceType: 'CARGO',
        minWeight: 0.05,
        maxWeight: 999_999,
        baseCost: 70000,
        perUnitCost: 3_000_000,
        weightUnit: 'TON',
        etdDays: 5,
      },
      {
        originZone: a,
        destinationZone: b,
        serviceType: 'VIP_EXPRESS',
        minWeight: 0,
        maxWeight: 999_999,
        baseCost: 200000,
        perUnitCost: 10000,
        weightUnit: 'KG',
        etdDays: 1,
      },
    );
  }

  for (const r of rateSeeds) {
    await prisma.bisaExpressRate.upsert({
      where: {
        originZone_destinationZone_serviceType_minWeight_weightUnit: {
          originZone: r.originZone,
          destinationZone: r.destinationZone,
          serviceType: r.serviceType,
          minWeight: r.minWeight,
          weightUnit: r.weightUnit,
        },
      },
      update: {
        maxWeight: r.maxWeight,
        baseCost: r.baseCost,
        perUnitCost: r.perUnitCost,
        etdDays: r.etdDays,
        isActive: true,
      },
      create: r,
    });
  }

  await prisma.bisaExpressRate.updateMany({
    where: {
      serviceType: 'CARGO',
      weightUnit: 'KG',
    },
    data: { isActive: false },
  });

  const country = await prisma.country.findFirst({
    where: { OR: [{ code: 'ID' }, { name: 'Indonesia' }] },
  });

  if (country) {
    // Hub pakai provinsi GIS pertama yang ada (atau Jawa Timur bila ada)
    const hubProvince =
      provinces.find((p) => p.name === 'Jawa Timur') ||
      provinces.find((p) => p.name === 'Bali') ||
      provinces[0];

    let hubAddress = await prisma.address.findFirst({
      where: { fullAddress: { contains: 'Hub BISA Express' } },
    });
    if (!hubAddress) {
      hubAddress = await prisma.address.create({
        data: {
          countryId: country.id,
          provinceId: hubProvince?.id ?? null,
          fullAddress: 'Hub BISA Express — Gudang Sortir Utama',
          zipCode: '00000',
          phoneNumber: '081234567890',
          latitude: -7.25,
          longitude: 112.75,
        },
      });
    }

    await prisma.bisaExpressHub.upsert({
      where: { code: 'HUB-MAIN-01' },
      update: {
        name: 'Hub Utama BISA Express',
        isActive: true,
        addressId: hubAddress.id,
        coverageProvinces: provinces.map((p) => p.name),
        contactName: 'Ops BISA Express',
        contactPhone: '081234567890',
        operatingHours: '08:00-20:00',
        maxDailyCapacity: 200,
      },
      create: {
        code: 'HUB-MAIN-01',
        name: 'Hub Utama BISA Express',
        type: 'MAIN_HUB',
        addressId: hubAddress.id,
        coverageProvinces: provinces.map((p) => p.name),
        contactName: 'Ops BISA Express',
        contactPhone: '081234567890',
        operatingHours: '08:00-20:00',
        maxDailyCapacity: 200,
        isActive: true,
      },
    });
  } else {
    logger.warn('[24] Country Indonesia tidak ditemukan — hub dilewati.');
  }

  logger.info('✅ [24] BISA Express seeded (coverage dari GIS).');
}
