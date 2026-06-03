import logger from '../../src/config/logger.js';

/**
 * Seed Regions (Country, Province, Regency, District, Village)
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
        const regency = await prisma.regency.upsert({
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

        // 4. Create Sample Districts for Semarang
        if (reg.name === 'Semarang') {
          const districts = [
            { name: 'Semarang Tengah', code: '337401' },
            { name: 'Semarang Utara', code: '337402' },
            { name: 'Semarang Timur', code: '337403' },
            { name: 'Semarang Selatan', code: '337404' },
            { name: 'Semarang Barat', code: '337405' },
          ];

          for (const dist of districts) {
            const district = await prisma.district.upsert({
              where: {
                name_regencyId: {
                  name: dist.name,
                  regencyId: regency.id,
                },
              },
              update: {},
              create: {
                name: dist.name,
                code: dist.code,
                regencyId: regency.id,
              },
            });

            // 5. Create Sample Villages for Semarang Tengah
            if (dist.name === 'Semarang Tengah') {
              const villages = [
                { name: 'Pendrikan Kidul', code: '33740101', type: 'KELURAHAN' },
                { name: 'Pendrikan Lor', code: '33740102', type: 'KELURAHAN' },
                { name: 'Sekayu', code: '33740103', type: 'KELURAHAN' },
                { name: 'Kembangsari', code: '33740104', type: 'KELURAHAN' },
                { name: 'Gabahan', code: '33740105', type: 'KELURAHAN' },
              ];

              for (const vil of villages) {
                await prisma.village.upsert({
                  where: {
                    name_districtId: {
                      name: vil.name,
                      districtId: district.id,
                    },
                  },
                  update: {},
                  create: {
                    name: vil.name,
                    code: vil.code,
                    type: vil.type,
                    districtId: district.id,
                  },
                });
              }
            }
          }
        }
      }
    }
  }

  logger.info('✅ [02b] Extended Regions seeded successfully');
}
