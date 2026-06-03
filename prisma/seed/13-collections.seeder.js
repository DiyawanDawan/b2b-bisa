import logger from '../../src/config/logger.js';

export async function seedCollections(prisma) {
  logger.info('🌱 [13] Seeding Product Collections (Bundling & Strategies)...');

  await prisma.productCollectionItem.deleteMany({});
  await prisma.productCollection.deleteMany({});

  const collections = [
    {
      name: 'Harga Termurah',
      description: 'Pilihan produk paling affordable untuk kebutuhan industri skala besar.',
      slug: 'harga-termurah',
    },
    {
      name: 'Rekomendasi Utama',
      description: 'Produk unggulan dengan sertifikasi lengkap dan rating terbaik.',
      slug: 'rekomendasi-utama',
    },
    {
      name: 'Bundling Hemat',
      description: 'Paket kombinasi produk untuk hasil maksimal dengan harga lebih hemat.',
      slug: 'bundling-hemat',
    },
  ];

  for (const collData of collections) {
    const collection = await prisma.productCollection.create({
      data: collData,
    });

    // Link products to collections based on logic
    if (collData.slug === 'harga-termurah') {
      const cheapProducts = await prisma.product.findMany({
        where: { biomassaType: 'SEKAM_PADI' },
        take: 50,
        orderBy: { pricePerUnit: 'asc' },
      });
      for (let i = 0; i < cheapProducts.length; i++) {
        // Update product name for SEO
        await prisma.product.update({
          where: { id: cheapProducts[i].id },
          data: {
            name: `Jual Sekam Padi Mentah ${cheapProducts[i].regency || 'Mojokerto'} - Harga Pabrik Termurah Per Ton`,
          },
        });

        await prisma.productCollectionItem.create({
          data: {
            collectionId: collection.id,
            productId: cheapProducts[i].id,
            order: i,
          },
        });
      }
    } else if (collData.slug === 'rekomendasi-utama') {
      const featuredProducts = await prisma.product.findMany({
        where: { isCertified: true },
        take: 50,
        orderBy: { averageRating: 'desc' },
      });
      for (let i = 0; i < featuredProducts.length; i++) {
        // Update product name for SEO
        await prisma.product.update({
          where: { id: featuredProducts[i].id },
          data: {
            name: `Biochar Aktif Grade A Sertifikasi ISO - Solusi Karbon Industri Purity 90%`,
          },
        });

        await prisma.productCollectionItem.create({
          data: {
            collectionId: collection.id,
            productId: featuredProducts[i].id,
            order: i,
          },
        });
      }
    } else if (collData.slug === 'bundling-hemat') {
      // Find one Biochar and one Sekam Padi
      const biochar = await prisma.product.findFirst({
        where: { biomassaType: 'BIOCHAR' },
      });
      const sekam = await prisma.product.findFirst({
        where: { biomassaType: 'SEKAM_PADI' },
      });

      if (biochar && sekam) {
        // Update name for bundling
        await prisma.product.update({
          where: { id: biochar.id },
          data: {
            name: `Paket Hemat Kesuburan Tanah: Biochar Aktif + Sekam Padi Organik`,
            originalPrice: biochar.pricePerUnit.mul(1.2), // Mock discount
          },
        });

        await prisma.productCollectionItem.create({
          data: { collectionId: collection.id, productId: biochar.id, order: 0 },
        });
        await prisma.productCollectionItem.create({
          data: { collectionId: collection.id, productId: sekam.id, order: 1 },
        });
      }
    }
  }

  logger.info('✅ [13] Product Collections seeded.');
}
