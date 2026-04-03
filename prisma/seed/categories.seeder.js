import logger from '../../src/config/logger.js';

export async function seedCategories(prisma) {
  logger.info('🌱 [01] Seeding Hardened Categories...');

  const categories = [
    {
      name: 'Limbah Biomassa',
      description: 'Bahan baku mentah dari sektor pertanian',
      categoryType: 'PRODUK',
    },
    { name: 'Produk Biochar', description: 'Karbon padat siap pakai', categoryType: 'PRODUK' },
    { name: 'Berita Karbon', description: 'Update terbaru bursa karbon', categoryType: 'ARTICLE' },
    {
      name: 'Regulasi Pemerintah',
      description: 'Undang-undang lingkungan terkini',
      categoryType: 'ARTICLE',
    },
    {
      name: 'Teknologi Pirolisis',
      description: 'Diskusi seputar alat pembakar',
      categoryType: 'FORUM',
    },
  ];

  for (const cat of categories) {
    await prisma.category.upsert({
      where: { name: cat.name },
      update: { categoryType: cat.categoryType },
      create: cat,
    });
  }

  logger.info('✅ [01] Categories synchronized successfully.');
}
