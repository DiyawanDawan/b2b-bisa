import logger from '../../src/config/logger.js';
import { faker } from '@faker-js/faker/locale/id_ID';
import {
  countRegionalSeedR2Paths,
  getOrResolveBiomassMedia,
  getOrResolveOrganicMedia,
} from './utils/seedProductMedia.util.ts';
import { hasStockPhotoApiKey } from './utils/stockPhotoApi.util.ts';

function shelfLifeForCrop(cropType) {
  const c = (cropType ?? '').toLowerCase();
  if (c.includes('beras') || c.includes('biji')) {
    return faker.number.int({ min: 180, max: 365 });
  }
  if (c.includes('sayur') || c.includes('kentang')) {
    return faker.number.int({ min: 3, max: 14 });
  }
  if (c.includes('buah') || c.includes('jagung')) {
    return faker.number.int({ min: 7, max: 30 });
  }
  return faker.number.int({ min: 5, max: 30 });
}

function pickAvailabilityType() {
  const roll = faker.number.int({ min: 1, max: 100 });
  if (roll <= 25) return 'PRE_HARVEST';
  if (roll <= 45) return 'MIXED';
  return 'READY';
}

function organicStockForAvailability(availabilityType) {
  if (availabilityType === 'PRE_HARVEST') return 0;
  if (availabilityType === 'MIXED') {
    return faker.number.float({ min: 20, max: 500, fractionDigits: 2 });
  }
  return faker.number.float({ min: 50, max: 2000, fractionDigits: 2 });
}

function buildOrganicSpecs(cropType, fertilizerType, isChemicalFree, shelfLifeDays, landAreaHa) {
  return [
    { label: 'Jenis Hasil Tani', value: cropType, sortOrder: 0 },
    { label: 'Pupuk / Nutrisi', value: fertilizerType, sortOrder: 1 },
    {
      label: 'Bebas Bahan Kimia',
      value: isChemicalFree ? 'Ya (100% Organik)' : 'Tidak',
      sortOrder: 2,
    },
    { label: 'Ketahanan (hari)', value: String(shelfLifeDays), sortOrder: 3 },
    { label: 'Luas Lahan (ha)', value: String(landAreaHa), sortOrder: 4 },
    { label: 'Metode Irigasi', value: 'Tetes / Saluran', sortOrder: 5 },
    {
      label: 'Musim Tanam',
      value: faker.helpers.arrayElement(['Musim Hujan', 'Musim Kemarau', 'Sepanjang Tahun']),
      sortOrder: 6,
    },
    { label: 'Sertifikasi', value: 'Organik Lokal / Pertanian Regeneratif', sortOrder: 7 },
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

async function createOrganicProduct(
  prisma,
  {
    supplier,
    firstProvince,
    firstRegency,
    selectedProduce,
    productName,
    fertilizerType,
    organicMedia,
    availabilityType,
    stock,
    shelfLifeDays,
    landAreaHa,
    nextHarvestDate,
    nextHarvestQtyTon,
  },
) {
  return prisma.product.create({
    data: {
      userId: supplier.id,
      categoryId: selectedProduce.categoryId,
      name: productName,
      biomassaType: 'OTHER',
      productMode: 'ORGANIC_PRODUCE',
      cropType: selectedProduce.cropType,
      fertilizerType,
      isChemicalFree: true,
      shelfLifeDays,
      landAreaHa,
      availabilityType,
      nextHarvestDate: nextHarvestDate ?? null,
      nextHarvestQtyTon: nextHarvestQtyTon ?? null,
      description: `Produk pertanian pangan pilihan dibudidayakan secara alami menggunakan 100% pupuk organik dan arang hayati (biochar) sebagai pembenah tanah. Bebas pestisida kimia sintetis, sehat untuk dikonsumsi, serta ramah lingkungan.`,
      pricePerUnit: faker.number.float({ min: 15000, max: 75000, fractionDigits: 2 }),
      originalPrice: faker.datatype.boolean()
        ? faker.number.float({ min: 80000, max: 95000, fractionDigits: 2 })
        : null,
      stock,
      unit: 'KG',
      minOrder: faker.number.float({ min: 5, max: 20, fractionDigits: 2 }),
      province: supplier.province || firstProvince?.name,
      regency: supplier.regency || firstRegency?.name,
      thumbnailUrl: organicMedia.thumbnailUrl,
      ...(organicMedia.videoUrl && {
        video: { create: { url: organicMedia.videoUrl } },
      }),
      isCertified: false,
      isIotMonitored: faker.datatype.boolean(),
      images: { create: organicMedia.images },
      specs: {
        create: buildOrganicSpecs(
          selectedProduce.cropType,
          fertilizerType,
          true,
          shelfLifeDays,
          landAreaHa,
        ),
      },
    },
  });
}

export async function seedProducts(prisma, users) {
  logger.info('🌱 [05] Seeding Products (Hardened Geography)...');
  if (hasStockPhotoApiKey()) {
    logger.info('   ↳ Stock photos: Pexels/Pixabay → R2');
  } else {
    logger.warn('   ↳ PEXELS_API_KEY / PIXABAY_API_KEY kosong — fallback loremflickr path.');
  }

  // CLEANUP - Delete in correct order (respect FK constraints)
  await prisma.booking.deleteMany({});
  await prisma.productHarvestLot.deleteMany({});
  await prisma.cartItem.deleteMany({});
  await prisma.productQuestion.deleteMany({});
  await prisma.productLike.deleteMany({});
  await prisma.orderItem.deleteMany({});
  await prisma.negotiation.deleteMany({});
  await prisma.review.deleteMany({});
  await prisma.productImage.deleteMany({});
  await prisma.productVideo.deleteMany({});
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

  /** Satu set gambar R2 per jenis komoditas (bukan per nama produk random). */
  const mediaCache = new Map();

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

        const organicMedia = await getOrResolveOrganicMedia(
          mediaCache,
          faker,
          selectedProduce.cropType,
          selectedProduce.name,
          true,
        );

        const shelfLifeDays = shelfLifeForCrop(selectedProduce.cropType);
        const landAreaHa = faker.number.float({ min: 0.5, max: 25, fractionDigits: 2 });
        const availabilityType = pickAvailabilityType();
        const stock = organicStockForAvailability(availabilityType);
        const nextHarvestDate =
          availabilityType === 'PRE_HARVEST' || availabilityType === 'MIXED'
            ? faker.date.soon({ days: faker.number.int({ min: 14, max: 60 }) })
            : null;
        const nextHarvestQtyTon =
          nextHarvestDate != null
            ? faker.number.float({ min: 2, max: 20, fractionDigits: 2 })
            : null;

        await createOrganicProduct(prisma, {
          supplier,
          firstProvince,
          firstRegency,
          selectedProduce,
          productName,
          fertilizerType,
          organicMedia,
          availabilityType,
          stock,
          shelfLifeDays,
          landAreaHa,
          nextHarvestDate,
          nextHarvestQtyTon,
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

        const biocharGrade = isBiochar ? faker.helpers.arrayElement(['A', 'B', 'C']) : null;

        const biomassTemplateName = isBiochar
          ? `Biochar Grade ${biocharGrade}`
          : selectedType.replace(/_/g, ' ');

        const biomassMedia = await getOrResolveBiomassMedia(
          mediaCache,
          faker,
          selectedType,
          biomassTemplateName,
          biocharGrade,
          true,
        );

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
            grade: biocharGrade,
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
            ...(biomassMedia.videoUrl && {
              video: { create: { url: biomassMedia.videoUrl } },
            }),
            isCertified: false,
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

    // Deterministic demo flagship organics for QA (demo supplier accounts)
    const isDemoSupplier =
      supplier.email === 'siti.aminah@agritech.com' || supplier.email === 'hello@greenearth.co';
    if (isDemoSupplier) {
      const demoFlagships = [
        {
          name: 'Beras Organik Mentik Wangi — Demo Pre-Harvest',
          cropType: 'Beras Organik',
          categoryId: catBeras?.id,
          availabilityType: 'PRE_HARVEST',
          stock: 0,
          shelfLifeDays: 180,
          landAreaHa: 12.5,
          nextHarvestDate: faker.date.soon({ days: 21 }),
          nextHarvestQtyTon: 8,
        },
        {
          name: 'Bayam Merah Organik Pacet — Demo Siap Kirim',
          cropType: 'Sayur Hijau',
          categoryId: catSayur?.id,
          availabilityType: 'READY',
          stock: 350,
          shelfLifeDays: 5,
          landAreaHa: 2.25,
          nextHarvestDate: null,
          nextHarvestQtyTon: null,
        },
        {
          name: 'Jagung Premium Manis — Demo Campuran',
          cropType: 'Jagung Premium',
          categoryId: catBiji?.id,
          availabilityType: 'MIXED',
          stock: 120,
          shelfLifeDays: 14,
          landAreaHa: 6,
          nextHarvestDate: faker.date.soon({ days: 35 }),
          nextHarvestQtyTon: 5,
        },
      ];

      for (const demo of demoFlagships) {
        const organicMedia = await getOrResolveOrganicMedia(
          mediaCache,
          faker,
          demo.cropType,
          demo.name,
          true,
        );
        const fertilizerType = 'Biochar Sekam + Pupuk Kompos';
        await createOrganicProduct(prisma, {
          supplier,
          firstProvince,
          firstRegency,
          selectedProduce: demo,
          productName: demo.name,
          fertilizerType,
          organicMedia,
          availabilityType: demo.availabilityType,
          stock: demo.stock,
          shelfLifeDays: demo.shelfLifeDays,
          landAreaHa: demo.landAreaHa,
          nextHarvestDate: demo.nextHarvestDate,
          nextHarvestQtyTon: demo.nextHarvestQtyTon,
        });
      }
    }
  }

  logger.info(
    `✅ [05] Fully Syncronized Products seeded (${mediaCache.size} set media · ${countRegionalSeedR2Paths()} file R2).`,
  );
}
