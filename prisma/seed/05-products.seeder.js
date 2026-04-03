import logger from '../../src/config/logger.js';
import { faker } from '@faker-js/faker/locale/id_ID';

export async function seedProducts(prisma, users) {
  logger.info('🌱 [05] Seeding Products (Hardened Geography)...');

  // CLEANUP
  await prisma.product.deleteMany({});

  const catBiochar = await prisma.category.findFirst({ where: { name: 'Produk Biochar' } });
  const catBiomass = await prisma.category.findFirst({ where: { name: 'Limbah Biomassa' } });

  // Get geography as default fallback
  const firstProvince = await prisma.province.findFirst();
  const firstRegency = await prisma.regency.findFirst();

  if (!users.allSuppliers || users.allSuppliers.length === 0) {
    logger.warn('⚠️ No suppliers found, skipping product seeding.');
    return;
  }

  for (const supplier of users.allSuppliers) {
    for (let i = 0; i < 2; i++) {
      const isBiochar = i % 2 === 0;
      const productName = `${faker.commerce.productAdjective()} ${isBiochar ? 'Biochar Aktif' : 'Biomassa Organik'} ${faker.location.city()}`;

      await prisma.product.create({
        data: {
          userId: supplier.id,
          categoryId: isBiochar ? catBiochar?.id : catBiomass?.id,
          name: productName,
          biomassaType: isBiochar ? 'BIOCHAR' : 'SEKAM_PADI',
          grade: isBiochar ? faker.helpers.arrayElement(['A', 'B', 'C']) : null,
          description: faker.commerce.productDescription(),
          pricePerUnit: faker.number.float({ min: 1000, max: 20000, fractionDigits: 2 }),
          stock: faker.number.float({ min: 10, max: 1000, fractionDigits: 2 }),
          unit: 'TON',
          minOrder: faker.number.float({ min: 1, max: 10, fractionDigits: 2 }),

          // Geographic Relations (String fields, not IDs)
          province: supplier.province || firstProvince?.name,
          regency: supplier.regency || firstRegency?.name,

          thumbnailUrl: faker.image.urlLoremFlickr({
            category: isBiochar ? 'industrial' : 'nature',
            width: 640,
            height: 480,
          }),
          isCertified: faker.datatype.boolean(),
          isIotMonitored: isBiochar,
          images: {
            create: [
              {
                url: faker.image.urlLoremFlickr({
                  category: isBiochar ? 'industrial' : 'nature',
                  width: 640,
                  height: 480,
                }),
                isPrimary: true,
                order: 0,
              },
              {
                url: faker.image.urlLoremFlickr({ category: 'business', width: 640, height: 480 }),
                isPrimary: false,
                order: 1,
              },
            ],
          },
          technicalSpec: isBiochar
            ? {
                create: {
                  carbonPurity: faker.number.float({ min: 60, max: 95, fractionDigits: 2 }),
                  moistureContent: faker.number.float({ min: 2, max: 15, fractionDigits: 2 }),
                  phLevel: faker.number.float({ min: 6, max: 8, fractionDigits: 2 }),
                  productionCapacity: faker.number.float({ min: 50, max: 500, fractionDigits: 2 }),
                  surfaceArea: faker.number.float({ min: 100, max: 400, fractionDigits: 2 }),
                  density: `${faker.number.int({ min: 80, max: 120 })} kg/m3`,
                  carbonOffsetPerTon: faker.number.float({ min: 0.5, max: 2.5, fractionDigits: 2 }),
                  grossWeightPerSak: faker.number.float({
                    min: 50.5,
                    max: 51.5,
                    fractionDigits: 2,
                  }),
                  netWeightPerSak: 50.0,
                  bagDimension: '115x75 cm',
                  heavyMetals: JSON.stringify({ As: 0.1, Hg: 0.01 }),
                },
              }
            : undefined,
        },
      });
    }
  }

  logger.info('✅ [05] Fully Syncronized Products seeded.');
}
