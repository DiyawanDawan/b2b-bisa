import logger from '../../src/config/logger.js';
import { sealAddress } from '../../src/utils/piiField.util.ts';

/** Upsert a category by (parentId, name). Returns the row id. */
async function upsertCategory(prisma, data) {
  const existing = await prisma.category.findFirst({
    where: {
      name: data.name,
      parentId: data.parentId ?? null,
    },
  });
  if (existing) {
    return prisma.category.update({
      where: { id: existing.id },
      data: {
        description: data.description ?? existing.description,
        categoryType: data.categoryType,
        productMode: data.productMode ?? null,
        biomassaType: data.biomassaType ?? null,
        level: data.level,
        parentId: data.parentId ?? null,
        isActive: true,
      },
    });
  }
  return prisma.category.create({ data });
}

const BIOMASS_L2 = [
  { name: 'Biochar', biomassaType: 'BIOCHAR', description: 'Produk hasil pirolisis biochar' },
  { name: 'Sekam Padi', biomassaType: 'SEKAM_PADI', description: 'Limbah sekam padi' },
  { name: 'Tongkol Jagung', biomassaType: 'TONGKOL_JAGUNG', description: 'Limbah tongkol jagung' },
  {
    name: 'Tempurung Kelapa',
    biomassaType: 'TEMPURUNG_KELAPA',
    description: 'Limbah tempurung kelapa',
  },
  { name: 'Wood Chip', biomassaType: 'WOOD_CHIP', description: 'Serpihan / serbuk kayu' },
  { name: 'Lainnya', biomassaType: 'OTHER', description: 'Limbah biomassa lainnya' },
];

const BIOMASS_L3 = {
  BIOCHAR: [
    { name: 'Biochar dari Sekam Padi', description: 'Arang aktif hasil pirolisis sekam padi' },
    { name: 'Biochar dari Tongkol Jagung', description: 'Arang aktif dari tongkol jagung' },
    { name: 'Biochar dari Tempurung Kelapa', description: 'Arang aktif dari tempurung kelapa' },
    { name: 'Biochar dari Wood Chip', description: 'Arang aktif dari serbuk/wood chip' },
    { name: 'Biochar Campuran', description: 'Biochar dari campuran bahan baku biomassa' },
    { name: 'Pupuk Kompos Biochar', description: 'Pupuk organik turunan proses pirolisis' },
    { name: 'Asap Cair Pirolisis', description: 'Cairan kondensasi hasil pirolisis' },
  ],
  SEKAM_PADI: [
    { name: 'Sekam Padi Kering', description: 'Limbah sekam padi kadar air rendah' },
    { name: 'Sekam Padi Basah', description: 'Sekam padi segar / basah' },
    { name: 'Sekam Padi Grade Ekspor', description: 'Sekam padi bersih siap industri' },
  ],
  TONGKOL_JAGUNG: [
    { name: 'Tongkol Jagung Kering', description: 'Limbah tongkol jagung kering' },
    { name: 'Tongkol Jagung Basah', description: 'Tongkol jagung basah / segar' },
  ],
  TEMPURUNG_KELAPA: [
    { name: 'Tempurung Kelapa Utuh', description: 'Tempurung kelapa utuh kering' },
    { name: 'Tempurung Kelapa Cincang', description: 'Tempurung kelapa cincang siap pirolisis' },
  ],
  WOOD_CHIP: [
    { name: 'Wood Chip Kering', description: 'Serpihan kayu kering industri' },
    { name: 'Serbuk Kayu', description: 'Serbuk kayu halus untuk pirolisis' },
  ],
  OTHER: [{ name: 'Limbah Biomassa Lainnya', description: 'Limbah biomassa campuran / lainnya' }],
};

const ORGANIC_L2 = [
  {
    name: 'Pangan Pokok',
    description: 'Beras dan biji-bijian',
    children: [
      { name: 'Beras Organik', description: 'Beras organik bebas kimia premium' },
      { name: 'Biji-bijian', description: 'Kacang, jagung, dan biji organik' },
    ],
  },
  {
    name: 'Sayur & Buah',
    description: 'Hasil kebun segar',
    children: [
      { name: 'Sayur Segar', description: 'Sayuran segar hidroponik dan organik' },
      { name: 'Buah Organik', description: 'Buah segar organik nusantara' },
    ],
  },
  {
    name: 'Umbi & Rempah',
    description: 'Umbi, akar, dan rempah',
    children: [
      { name: 'Umbi & Akar', description: 'Kentang, ubi, dan umbi organik' },
      { name: 'Rempah Organik', description: 'Jahe, kunyit, dan rempah organik' },
    ],
  },
];

async function seedProductCategoryTree(prisma) {
  const biomassRoot = await upsertCategory(prisma, {
    name: 'Biomassa',
    description: 'Material biomassa & turunan pirolisis',
    categoryType: 'PRODUK',
    productMode: 'BIOMASS_MATERIAL',
    level: 1,
    parentId: null,
  });

  for (const l2 of BIOMASS_L2) {
    const mid = await upsertCategory(prisma, {
      name: l2.name,
      description: l2.description,
      categoryType: 'PRODUK',
      productMode: 'BIOMASS_MATERIAL',
      biomassaType: l2.biomassaType,
      level: 2,
      parentId: biomassRoot.id,
    });
    for (const leaf of BIOMASS_L3[l2.biomassaType] || []) {
      await upsertCategory(prisma, {
        name: leaf.name,
        description: leaf.description,
        categoryType: 'PRODUK',
        productMode: 'BIOMASS_MATERIAL',
        biomassaType: l2.biomassaType,
        level: 3,
        parentId: mid.id,
      });
    }
  }

  const organicRoot = await upsertCategory(prisma, {
    name: 'Hasil Tani',
    description: 'Produk pertanian organik',
    categoryType: 'PRODUK',
    productMode: 'ORGANIC_PRODUCE',
    level: 1,
    parentId: null,
  });

  for (const l2 of ORGANIC_L2) {
    const mid = await upsertCategory(prisma, {
      name: l2.name,
      description: l2.description,
      categoryType: 'PRODUK',
      productMode: 'ORGANIC_PRODUCE',
      level: 2,
      parentId: organicRoot.id,
    });
    for (const leaf of l2.children) {
      await upsertCategory(prisma, {
        name: leaf.name,
        description: leaf.description,
        categoryType: 'PRODUK',
        productMode: 'ORGANIC_PRODUCE',
        level: 3,
        parentId: mid.id,
      });
    }
  }

  // Re-parent any legacy flat PRODUK rows still at level 1 without children into tree leaves if name matches.
  const legacy = await prisma.category.findMany({
    where: {
      categoryType: 'PRODUK',
      level: 1,
      parentId: null,
      NOT: { id: { in: [biomassRoot.id, organicRoot.id] } },
    },
    include: { _count: { select: { children: true, products: true } } },
  });

  for (const row of legacy) {
    if (row._count.children > 0) continue;
    const twin = await prisma.category.findFirst({
      where: {
        name: row.name,
        level: 3,
        id: { not: row.id },
      },
    });
    if (twin && row._count.products > 0) {
      await prisma.product.updateMany({
        where: { categoryId: row.id },
        data: { categoryId: twin.id },
      });
    }
    if (twin) {
      await prisma.category.update({
        where: { id: row.id },
        data: { isActive: false },
      });
    }
  }
}

export async function seedTaxonomies(prisma) {
  logger.info('🌱 [01] Seeding Taxonomies & Geographies (FULL COVERAGE)...');

  await seedProductCategoryTree(prisma);

  const contentCategories = [
    {
      name: 'Berita Karbon',
      description: 'Update terbaru bursa karbon',
      categoryType: 'ARTICLE',
      level: 1,
    },
    {
      name: 'Regulasi Pemerintah',
      description: 'Hukum terkait emisi',
      categoryType: 'ARTICLE',
      level: 1,
    },
    {
      name: 'Inovasi Pertanian',
      description: 'Teknologi tani terbaru',
      categoryType: 'ARTICLE',
      level: 1,
    },
    {
      name: 'Teknologi Pirolisis',
      description: 'Diskusi seputar alat pembakar',
      categoryType: 'FORUM',
      level: 1,
    },
    { name: 'Supply Chain', description: 'Diskusi logistik', categoryType: 'FORUM', level: 1 },
    { name: 'Tanya Jawab Petani', description: 'QnA umum', categoryType: 'FORUM', level: 1 },
  ];

  for (const cat of contentCategories) {
    await upsertCategory(prisma, { ...cat, parentId: null });
  }

  // GEOGRAPHY (Deep Scope)
  const country = await prisma.country.upsert({
    where: { code: 'ID' },
    update: {},
    create: { name: 'Indonesia', code: 'ID', continent: 'Asia' },
  });

  const province = await prisma.province.upsert({
    where: { code_countryId: { code: 'XI', countryId: country.id } },
    update: {},
    create: { name: 'Jawa Timur', code: 'XI', countryId: country.id },
  });

  const regency = await prisma.regency.upsert({
    where: { code_provinceId: { code: 'XI-01', provinceId: province.id } },
    update: {},
    create: { name: 'Kabupaten Mojokerto', code: 'XI-01', provinceId: province.id },
  });

  const district = await prisma.district.upsert({
    where: { code_regencyId: { code: 'XI-01-A', regencyId: regency.id } },
    update: {},
    create: { name: 'Pacet', code: 'XI-01-A', regencyId: regency.id },
  });

  const village = await prisma.village.upsert({
    where: { code_districtId: { code: 'XI-01-A-1', districtId: district.id } },
    update: {},
    create: { name: 'Desa Pacet Makmur', code: 'XI-01-A-1', districtId: district.id, type: 'DESA' },
  });

  // ADDRESS & SHIPPING CENTER
  let address = await prisma.address.findFirst({ where: { zipCode: '61374' } });
  if (!address) {
    address = await prisma.address.create({
      data: {
        countryId: country.id,
        provinceId: province.id,
        regencyId: regency.id,
        districtId: district.id,
        villageId: village.id,
        fullAddress: sealAddress('Jl. Raya Pacet No 123, Kawasan Industri Biomassa'),
        zipCode: '61374',
        latitude: -7.6713,
        longitude: 112.5381,
      },
    });
  }

  const shippingExists = await prisma.shippingCenter.findUnique({
    where: { addressId: address.id },
  });
  if (!shippingExists) {
    await prisma.shippingCenter.create({ data: { addressId: address.id } });
  }

  logger.info('✅ [01] Taxonomies & Full Geo seeded.');
}
