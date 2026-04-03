import logger from '#config/logger';

export async function seedProducts(prisma, supplier) {
  logger.info('🌱 Seeding Products...');

  const categoryBiochar = await prisma.category.findFirst({ where: { name: 'Produk Biochar' } });
  const categoryBiomassa = await prisma.category.findFirst({ where: { name: 'Limbah Biomassa' } });

  const products = [
    {
      userId: supplier.id,
      categoryId: categoryBiochar?.id,
      name: 'Biochar Karbon Aktif Grade A',
      biomassaType: 'BIOCHAR',
      grade: 'A',
      description:
        'Biochar kualitas ekspor dengan kadar karbon murni di atas 85%. Cocok untuk aktivasi tanah dan filter industri.',
      pricePerKg: 15000,
      stock: 50.5,
      unit: 'TON',
      minOrder: 1,
      isCertified: true,
      technicalSpec: {
        create: {
          carbonContent: 88.5,
          moisture: 5.2,
          phLevel: 7.4,
          productionCapacity: 100,
          grossWeightPerSak: 50,
        },
      },
    },
    {
      userId: supplier.id,
      categoryId: categoryBiomassa?.id,
      name: 'Sekam Padi Curah Super Kering',
      biomassaType: 'SEKAM_PADI',
      description:
        'Limbah penggilingan padi organik dari panen raya Jawa Timur. Kekeringan maksimal.',
      pricePerKg: 1500,
      stock: 200,
      unit: 'TON',
      minOrder: 5,
      isCertified: false,
    },
  ];

  for (const p of products) {
    const existing = await prisma.product.findFirst({
      where: { name: p.name, userId: supplier.id },
    });
    if (!existing) {
      await prisma.product.create({ data: p });
    }
  }

  logger.log('✅ Products seeded successfully.');
}
