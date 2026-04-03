import logger from '../../src/config/logger.js';

export async function seedTaxonomies(prisma) {
  logger.info('🌱 [01] Seeding Taxonomies & Geographies (FULL COVERAGE)...');

  // CATEGORIES
  const categories = [
    {
      name: 'Limbah Biomassa',
      description: 'Bahan baku dari sektor pertanian',
      categoryType: 'PRODUK',
    },
    { name: 'Produk Biochar', description: 'Karbon padat siap pakai', categoryType: 'PRODUK' },
    { name: 'Pupuk Kompos', description: 'Pupuk organik turunan', categoryType: 'PRODUK' },
    { name: 'Asap Cair', description: 'Cairan kondensasi pirolisis', categoryType: 'PRODUK' },
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
    await prisma.category.upsert({ where: { name: cat.name }, update: {}, create: cat });
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
