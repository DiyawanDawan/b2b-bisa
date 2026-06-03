import logger from '../../src/config/logger.js';

const BIOMASS_CATEGORIES = [
  // BIOCHAR — sumber bahan baku berbeda
  {
    name: 'Biochar dari Sekam Padi',
    description: 'Arang aktif hasil pirolisis sekam padi',
    categoryType: 'PRODUK',
    productMode: 'BIOMASS_MATERIAL',
    biomassaType: 'BIOCHAR',
  },
  {
    name: 'Biochar dari Tongkol Jagung',
    description: 'Arang aktif dari tongkol jagung',
    categoryType: 'PRODUK',
    productMode: 'BIOMASS_MATERIAL',
    biomassaType: 'BIOCHAR',
  },
  {
    name: 'Biochar dari Tempurung Kelapa',
    description: 'Arang aktif dari tempurung kelapa',
    categoryType: 'PRODUK',
    productMode: 'BIOMASS_MATERIAL',
    biomassaType: 'BIOCHAR',
  },
  {
    name: 'Biochar dari Wood Chip',
    description: 'Arang aktif dari serbuk/wood chip',
    categoryType: 'PRODUK',
    productMode: 'BIOMASS_MATERIAL',
    biomassaType: 'BIOCHAR',
  },
  {
    name: 'Biochar Campuran',
    description: 'Biochar dari campuran bahan baku biomassa',
    categoryType: 'PRODUK',
    productMode: 'BIOMASS_MATERIAL',
    biomassaType: 'BIOCHAR',
  },
  {
    name: 'Pupuk Kompos Biochar',
    description: 'Pupuk organik turunan proses pirolisis',
    categoryType: 'PRODUK',
    productMode: 'BIOMASS_MATERIAL',
    biomassaType: 'BIOCHAR',
  },
  {
    name: 'Asap Cair Pirolisis',
    description: 'Cairan kondensasi hasil pirolisis',
    categoryType: 'PRODUK',
    productMode: 'BIOMASS_MATERIAL',
    biomassaType: 'BIOCHAR',
  },

  // SEKAM PADi — limbah mentah
  {
    name: 'Sekam Padi Kering',
    description: 'Limbah sekam padi kadar air rendah',
    categoryType: 'PRODUK',
    productMode: 'BIOMASS_MATERIAL',
    biomassaType: 'SEKAM_PADI',
  },
  {
    name: 'Sekam Padi Basah',
    description: 'Sekam padi segar / basah',
    categoryType: 'PRODUK',
    productMode: 'BIOMASS_MATERIAL',
    biomassaType: 'SEKAM_PADI',
  },
  {
    name: 'Sekam Padi Grade Ekspor',
    description: 'Sekam padi bersih siap industri',
    categoryType: 'PRODUK',
    productMode: 'BIOMASS_MATERIAL',
    biomassaType: 'SEKAM_PADI',
  },

  // TONGKOL JAGUNG
  {
    name: 'Tongkol Jagung Kering',
    description: 'Limbah tongkol jagung kering',
    categoryType: 'PRODUK',
    productMode: 'BIOMASS_MATERIAL',
    biomassaType: 'TONGKOL_JAGUNG',
  },
  {
    name: 'Tongkol Jagung Basah',
    description: 'Tongkol jagung basah / segar',
    categoryType: 'PRODUK',
    productMode: 'BIOMASS_MATERIAL',
    biomassaType: 'TONGKOL_JAGUNG',
  },

  // TEMPURUNG KELAPA
  {
    name: 'Tempurung Kelapa Utuh',
    description: 'Tempurung kelapa utuh kering',
    categoryType: 'PRODUK',
    productMode: 'BIOMASS_MATERIAL',
    biomassaType: 'TEMPURUNG_KELAPA',
  },
  {
    name: 'Tempurung Kelapa Cincang',
    description: 'Tempurung kelapa cincang siap pirolisis',
    categoryType: 'PRODUK',
    productMode: 'BIOMASS_MATERIAL',
    biomassaType: 'TEMPURUNG_KELAPA',
  },

  // WOOD CHIP
  {
    name: 'Wood Chip Kering',
    description: 'Serpihan kayu kering industri',
    categoryType: 'PRODUK',
    productMode: 'BIOMASS_MATERIAL',
    biomassaType: 'WOOD_CHIP',
  },
  {
    name: 'Serbuk Kayu',
    description: 'Serbuk kayu halus untuk pirolisis',
    categoryType: 'PRODUK',
    productMode: 'BIOMASS_MATERIAL',
    biomassaType: 'WOOD_CHIP',
  },

  // OTHER
  {
    name: 'Limbah Biomassa Lainnya',
    description: 'Limbah biomassa campuran / lainnya',
    categoryType: 'PRODUK',
    productMode: 'BIOMASS_MATERIAL',
    biomassaType: 'OTHER',
  },
];

const ORGANIC_CATEGORIES = [
  {
    name: 'Beras Organik',
    description: 'Beras organik bebas kimia premium',
    categoryType: 'PRODUK',
    productMode: 'ORGANIC_PRODUCE',
  },
  {
    name: 'Sayur Segar',
    description: 'Sayuran segar hidroponik dan organik',
    categoryType: 'PRODUK',
    productMode: 'ORGANIC_PRODUCE',
  },
  {
    name: 'Biji-bijian',
    description: 'Kacang, jagung, dan biji organik',
    categoryType: 'PRODUK',
    productMode: 'ORGANIC_PRODUCE',
  },
  {
    name: 'Buah Organik',
    description: 'Buah segar organik nusantara',
    categoryType: 'PRODUK',
    productMode: 'ORGANIC_PRODUCE',
  },
  {
    name: 'Umbi & Akar',
    description: 'Kentang, ubi, dan umbi organik',
    categoryType: 'PRODUK',
    productMode: 'ORGANIC_PRODUCE',
  },
  {
    name: 'Rempah Organik',
    description: 'Jahe, kunyit, dan rempah organik',
    categoryType: 'PRODUK',
    productMode: 'ORGANIC_PRODUCE',
  },
];

export async function seedTaxonomies(prisma) {
  logger.info('🌱 [01] Seeding Taxonomies & Geographies (FULL COVERAGE)...');

  const categories = [
    ...BIOMASS_CATEGORIES,
    ...ORGANIC_CATEGORIES,

    { name: 'Berita Karbon', description: 'Update terbaru bursa karbon', categoryType: 'ARTICLE' },
    { name: 'Regulasi Pemerintah', description: 'Hukum terkait emisi', categoryType: 'ARTICLE' },
    { name: 'Inovasi Pertanian', description: 'Teknologi tani terbaru', categoryType: 'ARTICLE' },
    {
      name: 'Teknologi Pirolisis',
      description: 'Diskusi seputar alat pembakar',
      categoryType: 'FORUM',
    },
    { name: 'Supply Chain', description: 'Diskusi logistik', categoryType: 'FORUM' },
    { name: 'Tanya Jawab Petani', description: 'QnA umum', categoryType: 'FORUM' },
  ];

  for (const cat of categories) {
    await prisma.category.upsert({
      where: { name: cat.name },
      update: {
        description: cat.description,
        categoryType: cat.categoryType,
        productMode: cat.productMode ?? null,
        biomassaType: cat.biomassaType ?? null,
      },
      create: cat,
    });
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
        fullAddress: 'Jl. Raya Pacet No 123, Kawasan Industri Biomassa',
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
