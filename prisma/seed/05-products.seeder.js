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
  if (c.includes('sayur') || c.includes('kentang') || c.includes('umbi')) {
    return faker.number.int({ min: 3, max: 14 });
  }
  if (c.includes('buah') || c.includes('jagung') || c.includes('rempah')) {
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

/** Weighted status for bulk catalog — mostly ACTIVE so marketplace stays usable. */
function pickBulkProductStatus() {
  const roll = faker.number.int({ min: 1, max: 100 });
  if (roll <= 82) return 'ACTIVE';
  if (roll <= 88) return 'DRAFT';
  if (roll <= 92) return 'INACTIVE';
  if (roll <= 95) return 'OUT_OF_STOCK';
  if (roll <= 98) return 'BLOCKED';
  return 'DELETED';
}

function coherentStockForStatus(status, fallbackStock) {
  if (status === 'OUT_OF_STOCK' || status === 'DELETED') return 0;
  if (status === 'DRAFT' || status === 'INACTIVE' || status === 'BLOCKED') {
    return fallbackStock > 0
      ? fallbackStock
      : faker.number.float({ min: 5, max: 80, fractionDigits: 2 });
  }
  return fallbackStock;
}

function htmlOrganicDescription(cropType, fertilizerType) {
  return [
    `<p><strong>${cropType}</strong> dibudidayakan secara alami dengan ${fertilizerType}. Bebas pestisida kimia sintetis, sehat dikonsumsi, dan ramah lingkungan.</p>`,
    `<h3>Keunggulan</h3>`,
    `<ul><li>100% pupuk organik &amp; biochar sebagai pembenah tanah</li><li>Traceable dari lahan ke gudang</li><li>Cocok untuk rantai pasok B2B</li></ul>`,
    `<p>Deskripsi demo seed — format HTML kompatibel editor Quill.</p>`,
  ].join('');
}

function htmlBiomassDescription(selectedType, grade) {
  const label = selectedType.replace(/_/g, ' ');
  const gradeLine = grade ? `<p>Grade biochar: <strong>${grade}</strong>.</p>` : '';
  return [
    `<p><strong>${label}</strong> siap supply industri dengan spek teknis terukur dan dokumentasi batch.</p>`,
    gradeLine,
    `<h3>Spesifikasi utama</h3>`,
    `<ul><li>Kadar air &amp; densitas konsisten</li><li>Kemasan sak standar industri</li><li>Cocok untuk pirolisis / soil amendment / energi</li></ul>`,
    `<p>Deskripsi demo seed — format HTML kompatibel editor Quill.</p>`,
  ].join('');
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

async function loadL3Leaves(prisma) {
  const biomassLeaves = await prisma.category.findMany({
    where: {
      categoryType: 'PRODUK',
      productMode: 'BIOMASS_MATERIAL',
      level: 3,
      isActive: true,
    },
    select: { id: true, name: true, biomassaType: true },
  });

  const byBiomassType = new Map();
  for (const leaf of biomassLeaves) {
    const key = leaf.biomassaType ?? 'OTHER';
    if (!byBiomassType.has(key)) byBiomassType.set(key, []);
    byBiomassType.get(key).push(leaf);
  }

  const organicNames = [
    'Beras Organik',
    'Biji-bijian',
    'Sayur Segar',
    'Buah Organik',
    'Umbi & Akar',
    'Rempah Organik',
  ];
  const organicByName = {};
  for (const name of organicNames) {
    const leaf = await prisma.category.findFirst({
      where: {
        name,
        categoryType: 'PRODUK',
        productMode: 'ORGANIC_PRODUCE',
        level: 3,
        isActive: true,
      },
      select: { id: true, name: true },
    });
    organicByName[name] = leaf;
  }

  return { byBiomassType, organicByName, biomassLeaves };
}

function pickLeafForBiomass(byBiomassType, type) {
  const leaves = byBiomassType.get(type) ?? byBiomassType.get('OTHER') ?? [];
  if (leaves.length === 0) return null;
  return faker.helpers.arrayElement(leaves);
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
    status = 'ACTIVE',
    isPromoted = false,
    promotedUntil = null,
    allowsSample = true,
    sampleMaxQty = 1,
    samplePricePerUnit = null,
    reservedStock = 0,
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
      description: htmlOrganicDescription(selectedProduce.cropType, fertilizerType),
      pricePerUnit: faker.number.float({ min: 15000, max: 75000, fractionDigits: 2 }),
      originalPrice: faker.datatype.boolean()
        ? faker.number.float({ min: 80000, max: 95000, fractionDigits: 2 })
        : null,
      stock,
      reservedStock,
      unit: 'KG',
      minOrder: faker.number.float({ min: 5, max: 20, fractionDigits: 2 }),
      allowsSample,
      sampleMaxQty,
      samplePricePerUnit,
      status,
      isPromoted,
      promotedUntil,
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

  // IDEMPOTENT: cek apakah produk seed sudah ada, jika iya lewati
  const existingProducts = await prisma.product.count();
  if (existingProducts > 0) {
    logger.info('   ↳ Products already seeded, skipping (data tidak dihapus)...');
    return { productIds: [], images: [], specs: [] };
  }

  const { byBiomassType, organicByName } = await loadL3Leaves(prisma);

  async function categoryForBiomassaType(type) {
    const leaf = pickLeafForBiomass(byBiomassType, type);
    return leaf?.id ?? null;
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
    const catBeras = organicByName['Beras Organik'];
    const catSayur = organicByName['Sayur Segar'];
    const catBiji = organicByName['Biji-bijian'];
    const catBuah = organicByName['Buah Organik'];
    const catUmbi = organicByName['Umbi & Akar'];
    const catRempah = organicByName['Rempah Organik'];

    // Significantly increased to 40-100 products per supplier
    const productCount = faker.number.int({ min: 40, max: 100 });
    for (let i = 0; i < productCount; i++) {
      // 40% chance of generating organic agricultural products, 60% industrial biomass
      const isOrganic = faker.number.int({ min: 1, max: 100 }) <= 40;
      const status = pickBulkProductStatus();

      if (isOrganic) {
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
          {
            name: 'Kentang Organik Dieng',
            cropType: 'Kentang Organik',
            categoryId: catUmbi?.id ?? catSayur?.id,
          },
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
          {
            name: 'Ubi Ungu Organik Wonosobo',
            cropType: 'Umbi & Akar',
            categoryId: catUmbi?.id,
          },
          {
            name: 'Jahe Merah Organik Boyolali',
            cropType: 'Rempah Organik',
            categoryId: catRempah?.id,
          },
          {
            name: 'Kunyit Organik Sukabumi',
            cropType: 'Rempah Organik',
            categoryId: catRempah?.id,
          },
        ].filter((p) => p.categoryId);

        if (organicProduceTypes.length === 0) continue;

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
        let availabilityType = pickAvailabilityType();
        if (status === 'OUT_OF_STOCK') availabilityType = 'READY';
        const rawStock = organicStockForAvailability(availabilityType);
        const stock = coherentStockForStatus(status, rawStock);
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
          status,
          isPromoted: status === 'ACTIVE' && faker.datatype.boolean(0.08),
          promotedUntil:
            status === 'ACTIVE' && faker.datatype.boolean(0.08)
              ? faker.date.soon({ days: 30 })
              : null,
          allowsSample: status === 'ACTIVE',
          sampleMaxQty: 2,
          samplePricePerUnit:
            status === 'ACTIVE'
              ? faker.number.float({ min: 5000, max: 15000, fractionDigits: 2 })
              : null,
        });
      } else {
        const biomassaTypes = [
          'BIOCHAR',
          'SEKAM_PADI',
          'TONGKOL_JAGUNG',
          'TEMPURUNG_KELAPA',
          'WOOD_CHIP',
          'OTHER',
        ];
        const selectedType = faker.helpers.arrayElement(biomassaTypes);
        const isBiochar = selectedType === 'BIOCHAR';
        const leaf = pickLeafForBiomass(byBiomassType, selectedType);

        const productName = `${faker.commerce.productAdjective()} ${
          leaf?.name ?? (isBiochar ? 'Biochar Aktif' : selectedType.replace('_', ' '))
        } ${faker.location.city()}`;

        const biocharGrade = isBiochar ? faker.helpers.arrayElement(['A', 'B', 'C']) : null;

        const biomassTemplateName = isBiochar
          ? `Biochar Grade ${biocharGrade}`
          : selectedType.replace(/_/g, ' ');

        const biomassMedia = await getOrResolveBiomassMedia(
          mediaCache,
          faker,
          selectedType === 'OTHER' ? 'SEKAM_PADI' : selectedType,
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

        const rawStock = faker.number.float({ min: 10, max: 1000, fractionDigits: 2 });
        const stock = coherentStockForStatus(status, rawStock);
        const isPromoted = status === 'ACTIVE' && faker.datatype.boolean(0.1);

        await prisma.product.create({
          data: {
            userId: supplier.id,
            categoryId: leaf?.id ?? (await categoryForBiomassaType(selectedType)),
            name: productName,
            biomassaType: selectedType,
            productMode: 'BIOMASS_MATERIAL',
            grade: biocharGrade,
            description: htmlBiomassDescription(selectedType, biocharGrade),
            pricePerUnit: faker.number.float({ min: 1000, max: 20000, fractionDigits: 2 }),
            originalPrice: faker.datatype.boolean()
              ? faker.number.float({ min: 21000, max: 30000, fractionDigits: 2 })
              : null,
            stock,
            reservedStock:
              status === 'ACTIVE' ? faker.number.float({ min: 0, max: 5, fractionDigits: 2 }) : 0,
            unit: 'TON',
            minOrder: faker.number.float({ min: 1, max: 10, fractionDigits: 2 }),
            allowsSample: status === 'ACTIVE',
            sampleMaxQty: 1,
            samplePricePerUnit:
              status === 'ACTIVE'
                ? faker.number.float({ min: 500, max: 2500, fractionDigits: 2 })
                : null,
            status,
            isPromoted,
            promotedUntil: isPromoted ? faker.date.soon({ days: 45 }) : null,
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
          status: 'ACTIVE',
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
          status: 'ACTIVE',
          isPromoted: true,
          promotedUntil: faker.date.soon({ days: 14 }),
          allowsSample: true,
          sampleMaxQty: 3,
          samplePricePerUnit: 8000,
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
          status: 'ACTIVE',
        },
        {
          name: 'Ubi Ungu — Demo Umbi L3',
          cropType: 'Umbi & Akar',
          categoryId: catUmbi?.id,
          availabilityType: 'READY',
          stock: 200,
          shelfLifeDays: 21,
          landAreaHa: 3,
          nextHarvestDate: null,
          nextHarvestQtyTon: null,
          status: 'ACTIVE',
        },
        {
          name: 'Jahe Merah — Demo Rempah L3',
          cropType: 'Rempah Organik',
          categoryId: catRempah?.id,
          availabilityType: 'READY',
          stock: 80,
          shelfLifeDays: 45,
          landAreaHa: 1.5,
          nextHarvestDate: null,
          nextHarvestQtyTon: null,
          status: 'ACTIVE',
        },
      ];

      const statusDemos = [
        {
          name: '[SEED] Status DRAFT — Beras Organik',
          cropType: 'Beras Organik',
          categoryId: catBeras?.id,
          status: 'DRAFT',
          stock: 40,
          availabilityType: 'READY',
        },
        {
          name: '[SEED] Status INACTIVE — Sayur Segar',
          cropType: 'Sayur Hijau',
          categoryId: catSayur?.id,
          status: 'INACTIVE',
          stock: 25,
          availabilityType: 'READY',
        },
        {
          name: '[SEED] Status BLOCKED — Buah Organik',
          cropType: 'Buah-buahan',
          categoryId: catBuah?.id,
          status: 'BLOCKED',
          stock: 15,
          availabilityType: 'READY',
        },
        {
          name: '[SEED] Status OUT_OF_STOCK — Biji-bijian',
          cropType: 'Biji-bijian',
          categoryId: catBiji?.id,
          status: 'OUT_OF_STOCK',
          stock: 0,
          availabilityType: 'READY',
        },
        {
          name: '[SEED] Status DELETED — Rempah',
          cropType: 'Rempah Organik',
          categoryId: catRempah?.id,
          status: 'DELETED',
          stock: 0,
          availabilityType: 'READY',
        },
      ];

      for (const demo of [...demoFlagships, ...statusDemos]) {
        if (!demo.categoryId) continue;
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
          availabilityType: demo.availabilityType ?? 'READY',
          stock: demo.stock ?? 0,
          shelfLifeDays: demo.shelfLifeDays ?? 30,
          landAreaHa: demo.landAreaHa ?? 2,
          nextHarvestDate: demo.nextHarvestDate ?? null,
          nextHarvestQtyTon: demo.nextHarvestQtyTon ?? null,
          status: demo.status ?? 'ACTIVE',
          isPromoted: demo.isPromoted ?? false,
          promotedUntil: demo.promotedUntil ?? null,
          allowsSample: demo.allowsSample ?? demo.status === 'ACTIVE',
          sampleMaxQty: demo.sampleMaxQty ?? 1,
          samplePricePerUnit: demo.samplePricePerUnit ?? null,
        });
      }

      // Deterministic biomass status + L3 leaf coverage for demo suppliers
      const biomassStatusFixtures = [
        {
          name: '[SEED] Biochar ACTIVE Promoted — L3 Sekam',
          biomassaType: 'BIOCHAR',
          leafName: 'Biochar dari Sekam Padi',
          status: 'ACTIVE',
          stock: 45,
          isPromoted: true,
          grade: 'A',
        },
        {
          name: '[SEED] Sekam Padi DRAFT — L3 Grade Ekspor',
          biomassaType: 'SEKAM_PADI',
          leafName: 'Sekam Padi Grade Ekspor',
          status: 'DRAFT',
          stock: 20,
        },
        {
          name: '[SEED] Wood Chip OUT_OF_STOCK — L3 Kering',
          biomassaType: 'WOOD_CHIP',
          leafName: 'Wood Chip Kering',
          status: 'OUT_OF_STOCK',
          stock: 0,
        },
        {
          name: '[SEED] Limbah OTHER INACTIVE — L3 Lainnya',
          biomassaType: 'OTHER',
          leafName: 'Limbah Biomassa Lainnya',
          status: 'INACTIVE',
          stock: 12,
        },
        {
          name: '[SEED] Tongkol BLOCKED — L3 Kering',
          biomassaType: 'TONGKOL_JAGUNG',
          leafName: 'Tongkol Jagung Kering',
          status: 'BLOCKED',
          stock: 8,
        },
        {
          name: '[SEED] Tempurung DELETED — L3 Cincang',
          biomassaType: 'TEMPURUNG_KELAPA',
          leafName: 'Tempurung Kelapa Cincang',
          status: 'DELETED',
          stock: 0,
        },
      ];

      for (const fix of biomassStatusFixtures) {
        const leaves = byBiomassType.get(fix.biomassaType) ?? [];
        const leaf = leaves.find((l) => l.name === fix.leafName) ?? leaves[0] ?? null;
        if (!leaf) continue;

        const biomassMedia = await getOrResolveBiomassMedia(
          mediaCache,
          faker,
          fix.biomassaType === 'OTHER' ? 'SEKAM_PADI' : fix.biomassaType,
          fix.leafName,
          fix.grade ?? null,
          true,
        );

        const technicalSpecData = {
          carbonPurity: 82.5,
          moistureContent: 8.2,
          phLevel: 7.1,
          productionCapacity: 120,
          surfaceArea: 250,
          density: '95 kg/m3',
          carbonOffsetPerTon: 1.4,
          grossWeightPerSak: 51,
          netWeightPerSak: 50,
          bagDimension: '115x75 cm',
          heavyMetals: JSON.stringify({ As: 0.1, Hg: 0.01 }),
        };

        await prisma.product.create({
          data: {
            userId: supplier.id,
            categoryId: leaf.id,
            name: fix.name,
            biomassaType: fix.biomassaType,
            productMode: 'BIOMASS_MATERIAL',
            grade: fix.grade ?? null,
            description: htmlBiomassDescription(fix.biomassaType, fix.grade ?? null),
            pricePerUnit: 5500,
            stock: fix.stock,
            unit: 'TON',
            minOrder: 1,
            allowsSample: fix.status === 'ACTIVE',
            sampleMaxQty: 1,
            samplePricePerUnit: fix.status === 'ACTIVE' ? 1200 : null,
            status: fix.status,
            isPromoted: fix.isPromoted ?? false,
            promotedUntil: fix.isPromoted ? faker.date.soon({ days: 21 }) : null,
            province: supplier.province || firstProvince?.name,
            regency: supplier.regency || firstRegency?.name,
            thumbnailUrl: biomassMedia.thumbnailUrl,
            isCertified: false,
            isIotMonitored: fix.biomassaType === 'BIOCHAR',
            images: { create: biomassMedia.images },
            technicalSpec: { create: technicalSpecData },
            specs: { create: buildBiomassSpecs(technicalSpecData) },
          },
        });
      }
    }
  }

  logger.info(
    `✅ [05] Fully Syncronized Products seeded (${mediaCache.size} set media · ${countRegionalSeedR2Paths()} file R2).`,
  );
}
