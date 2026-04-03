import logger from '../../src/config/logger.js';

/**
 * Seed Regions (Country, Province, Regency)
 * Deep enough for Phase 2 Geolocation features
 */
export async function seedRegions(prisma) {
  logger.info('🌱 [02b] Seeding Extended Regions (Indonesia)...');

  // 1. Create Country: Indonesia
  const indonesia = await prisma.country.upsert({
    where: { code: 'ID' },
    update: {},
    create: {
      name: 'Indonesia',
      code: 'ID',
      continent: 'Asia',
    },
  });

  // 2. Create Provinces
  const provinces = [
    { name: 'Jawa Tengah', code: '33' },
    { name: 'Jawa Barat', code: '32' },
    { name: 'DI Yogyakarta', code: '34' },
    { name: 'DKI Jakarta', code: '31' },
    { name: 'Sumatera Utara', code: '12' },
    { name: 'Banten', code: '36' },
  ];

  for (const prov of provinces) {
    const province = await prisma.province.upsert({
      where: {
        name_countryId: {
          name: prov.name,
          countryId: indonesia.id,
        },
      },
      update: {},
      create: {
        name: prov.name,
        code: prov.code,
        countryId: indonesia.id,
      },
    });

    // 3. Create Sample Regencies for key area: Jawa Tengah
    if (prov.name === 'Jawa Tengah') {
      const regencies = [
        { name: 'Semarang', code: '3374' },
        { name: 'Surakarta', code: '3372' },
        { name: 'Cilacap', code: '3301' },
        { name: 'Kudus', code: '3319' },
        { name: 'Magelang', code: '3308' },
      ];

      for (const reg of regencies) {
        await prisma.regency.upsert({
          where: {
            name_provinceId: {
              name: reg.name,
              provinceId: province.id,
            },
          },
          update: {},
          create: {
            name: reg.name,
            code: reg.code,
            provinceId: province.id,
          },
        });
      }
    }
  }

  logger.info('✅ [02b] Extended Regions seeded successfully');
}
