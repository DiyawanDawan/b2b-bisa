import prisma from '../src/config/prisma';

async function main() {
  const collections = await prisma.productCollection.findMany({
    include: {
      products: {
        take: 1,
        orderBy: { order: 'asc' },
        include: { product: { select: { thumbnailUrl: true } } },
      },
    },
  });

  let n = 0;
  for (const c of collections) {
    const thumb = c.products[0]?.product?.thumbnailUrl;
    if (thumb) {
      await prisma.productCollection.update({
        where: { id: c.id },
        data: { thumbnailUrl: thumb },
      });
      n++;
      console.log(`  ${c.name} → ${thumb.slice(0, 60)}...`);
    }
  }
  console.log(`✅ ${n}/${collections.length} koleksi thumbnail diisi.`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
