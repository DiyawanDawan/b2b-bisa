import logger from '../../src/config/logger.js';
import { faker } from '@faker-js/faker/locale/id_ID';
import {
  biomassImagePaths,
  organicProduceImagePaths,
  productImageLock,
} from '../../src/utils/loremFlickrMedia.util.ts';

function buildOrganicSpecs(cropType, fertilizerType, isChemicalFree) {
  return [
    { label: 'Jenis Hasil Tani', value: cropType, sortOrder: 0 },
    { label: 'Pupuk / Nutrisi', value: fertilizerType, sortOrder: 1 },
    {
      label: 'Bebas Bahan Kimia',
      value: isChemicalFree ? 'Ya (100% Organik)' : 'Tidak',
      sortOrder: 2,
    },
    { label: 'Metode Irigasi', value: 'Tetes / Saluran', sortOrder: 3 },
    {
      label: 'Musim Tanam',
      value: faker.helpers.arrayElement(['Musim Hujan', 'Musim Kemarau', 'Sepanjang Tahun']),
      sortOrder: 4,
    },
    { label: 'Sertifikasi', value: 'Organik Lokal / Pertanian Regeneratif', sortOrder: 5 },
  ];
}
function buildBiomassSpecs(technicalSpec) {
  const rows = [];
  const add = (label, value, sortOrder) => {
    if (value == null || value === '') return;
    rows.push({ label, value: String(value), sortOrder });
  };

  add('Kadar Air', `${technicalSpec.moistureContent}%`, 0);
  add('Kemurnian Karbon', `${technicalSpec.carbonPurity}%`, 1);
  add('Tingkat pH', technicalSpec.phLevel, 2);
  add('Densitas', technicalSpec.density, 3);
  add('Kapasitas Produksi', `${technicalSpec.productionCapacity} /bln`, 4);
  add('Luas Permukaan', `${technicalSpec.surfaceArea} m²/g`, 5);
  add('Offset Karbon per Ton', `${technicalSpec.carbonOffsetPerTon} tCO₂e`, 6);
  add('Berat Kotor per Sak', `${technicalSpec.grossWeightPerSak} kg`, 7);
  add('Berat Bersih per Sak', `${technicalSpec.netWeightPerSak} kg`, 8);
  add('Dimensi Karung', technicalSpec.bagDimension, 9);
  return rows;
}

export async function seedProducts(prisma, users) {
  logger.info('🌱 [05] Seeding Products (Hardened Geography)...');

  // CLEANUP - Delete in correct order (respect FK constraints)
  await prisma.orderItem.deleteMany({});
  await prisma.negotiation.deleteMany({});
  await prisma.review.deleteMany({});
  await prisma.productImage.deleteMany({});
  await prisma.productSpec.deleteMany({});
  await prisma.productTechnicalSpec.deleteMany({});
  await prisma.product.deleteMany({});

  const catBiochar = await prisma.category.findFirst({
    where: { productMode: 'BIOMASS_MATERIAL', biomassaType: 'BIOCHAR' },
  });
  const catBiomass = await prisma.category.findFirst({
    where: { productMode: 'BIOMASS_MATERIAL', biomassaType: 'SEKAM_PADI' },
  });

  async function categoryForBiomassaType(type) {
    const cat = await prisma.category.findFirst({
      where: { productMode: 'BIOMASS_MATERIAL', biomassaType: type },
    });
    return cat?.id ?? catBiomass?.id ?? catBiochar?.id;
  }

  // Get geography as default fallback
  const firstProvince = await prisma.province.findFirst();
  const firstRegency = await prisma.regency.findFirst();

  if (!users.allSuppliers || users.allSuppliers.length === 0) {
    logger.warn('⚠️ No suppliers found, skipping product seeding.');
    return;
  }

  for (const supplier of users.allSuppliers) {
    // Fetch Organic Categories
    const catBeras = await prisma.category.findFirst({ where: { name: 'Beras Organik' } });
    const catSayur = await prisma.category.findFirst({ where: { name: 'Sayur Segar' } });
    const catBiji = await prisma.category.findFirst({ where: { name: 'Biji-bijian' } });
    const catBuah = await prisma.category.findFirst({ where: { name: 'Buah Organik' } });

    // Significantly increased to 40-100 products per supplier
    const productCount = faker.number.int({ min: 40, max: 100 });
    for (let i = 0; i < productCount; i++) {
      // 40% chance of generating organic agricultural products, 60% industrial biomass
      const isOrganic = faker.number.int({ min: 1, max: 100 }) <= 40;

      if (isOrganic) {
        // Organic Agriculture Product
        const organicProduceTypes = [
          {
            name: 'Beras Organik Mentik Wangi',
            cropType: 'Beras Organik',
            categoryId: catBeras?.id,
          },
          {
            name: 'Beras Merah Organik Cianjur',
            cropType: 'Beras Organik',
            categoryId: catBeras?.id,
          },
          {
            name: 'Jagung Premium Manis Lombok',
            cropType: 'Jagung Premium',
            categoryId: catBiji?.id,
          },
          { name: 'Kentang Organik Dieng', cropType: 'Kentang Organik', categoryId: catSayur?.id },
          { name: 'Bayam Merah Organik Pacet', cropType: 'Sayur Hijau', categoryId: catSayur?.id },
          {
            name: 'Kacang Hijau Organik Kulon Progo',
            cropType: 'Biji-bijian',
            categoryId: catBiji?.id,
          },
          {
            name: 'Alpukat Mentega Organik Malang',
            cropType: 'Buah-buahan',
            categoryId: catBuah?.id,
          },
          { name: 'Jeruk Keprok Organik Batu', cropType: 'Buah-buahan', categoryId: catBuah?.id },
        ];

        const selectedProduce = faker.helpers.arrayElement(organicProduceTypes);
        const productName = `${selectedProduce.name} ${faker.helpers.arrayElement(['Super', 'Premium', 'Pilihan'])}`;

        const fertilizerType = faker.helpers.arrayElement([
          'Biochar Sekam + Pupuk Kompos',
          'POC Super Organik',
          'Kompos Kotoran Kambing + Biochar',
        ]);

        const organicMedia = organicProduceImagePaths(
          faker,
          selectedProduce.cropType,
          productImageLock(supplier.id, i),
        );

        await prisma.product.create({
          data: {
            userId: supplier.id,
            categoryId: selectedProduce.categoryId,
            name: productName,
            biomassaType: 'OTHER',
            productMode: 'ORGANIC_PRODUCE',
            cropType: selectedProduce.cropType,
            fertilizerType,
            isChemicalFree: true,
            description: `Produk pertanian pangan pilihan dibudidayakan secara alami menggunakan 100% pupuk organik dan arang hayati (biochar) sebagai pembenah tanah. Bebas pestisida kimia sintetis, sehat untuk dikonsumsi, serta ramah lingkungan.`,
            pricePerUnit: faker.number.float({ min: 15000, max: 75000, fractionDigits: 2 }),
            originalPrice: faker.datatype.boolean()
              ? faker.number.float({ min: 80000, max: 95000, fractionDigits: 2 })
              : null,
            stock: faker.number.float({ min: 50, max: 2000, fractionDigits: 2 }),
            unit: 'KG',
            minOrder: faker.number.float({ min: 5, max: 20, fractionDigits: 2 }),

            // Geographic Relations
            province: supplier.province || firstProvince?.name,
            regency: supplier.regency || firstRegency?.name,

            thumbnailUrl: organicMedia.thumbnailUrl,
            isCertified: true,
            isIotMonitored: faker.datatype.boolean(),
            images: {
              create: organicMedia.images,
            },
            specs: {
              create: buildOrganicSpecs(selectedProduce.cropType, fertilizerType, true),
            },
          },
        });
      } else {
        // Industrial Biomass Product
        const biomassaTypes = [
          'BIOCHAR',
          'SEKAM_PADI',
          'TONGKOL_JAGUNG',
          'TEMPURUNG_KELAPA',
          'WOOD_CHIP',
        ];
        const selectedType = faker.helpers.arrayElement(biomassaTypes);
        const isBiochar = selectedType === 'BIOCHAR';

        const productName = `${faker.commerce.productAdjective()} ${
          isBiochar ? 'Biochar Aktif' : selectedType.replace('_', ' ')
        } ${faker.location.city()}`;

        const biomassMedia = biomassImagePaths(faker, selectedType, productImageLock(supplier.id, i));

        const technicalSpecData = {
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
        };

        await prisma.product.create({
          data: {
            userId: supplier.id,
            categoryId: await categoryForBiomassaType(selectedType),
            name: productName,
            biomassaType: selectedType,
            productMode: 'BIOMASS_MATERIAL',
            grade: isBiochar ? faker.helpers.arrayElement(['A', 'B', 'C']) : null,
            description: faker.commerce.productDescription(),
            pricePerUnit: faker.number.float({ min: 1000, max: 20000, fractionDigits: 2 }),
            originalPrice: faker.datatype.boolean()
              ? faker.number.float({ min: 21000, max: 30000, fractionDigits: 2 })
              : null,
            stock: faker.number.float({ min: 10, max: 1000, fractionDigits: 2 }),
            unit: 'TON',
            minOrder: faker.number.float({ min: 1, max: 10, fractionDigits: 2 }),

            // Geographic Relations
            province: supplier.province || firstProvince?.name,
            regency: supplier.regency || firstRegency?.name,

            thumbnailUrl: biomassMedia.thumbnailUrl,
            isCertified: faker.datatype.boolean() || isBiochar, // Biochar often certified
            isIotMonitored: isBiochar || faker.datatype.boolean(),
            images: {
              create: biomassMedia.images,
            },
            technicalSpec: {
              create: technicalSpecData,
            },
            specs: {
              create: buildBiomassSpecs(technicalSpecData),
            },
          },
        });
      }
    }
  }

  logger.info('✅ [05] Fully Syncronized Products seeded.');
}
