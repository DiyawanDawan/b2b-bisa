/** Mirror product-harvest.service refresh for seed scripts. */

const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

export async function refreshProductAvailability(prisma, productId, tx = prisma) {
  const [product, nextLot] = await Promise.all([
    tx.product.findUnique({ where: { id: productId }, select: { stock: true } }),
    tx.productHarvestLot.findFirst({
      where: {
        productId,
        status: 'SCHEDULED',
        expectedHarvestDate: { gte: startOfToday() },
      },
      orderBy: { expectedHarvestDate: 'asc' },
      select: { expectedHarvestDate: true, expectedQuantityTon: true },
    }),
  ]);

  if (!product) return;

  const stockReady = Number(product.stock) > 0;
  const hasPreHarvest = !!nextLot;
  let availabilityType = 'READY';
  if (stockReady) {
    availabilityType = hasPreHarvest ? 'MIXED' : 'READY';
  } else if (hasPreHarvest) {
    availabilityType = 'PRE_HARVEST';
  }

  await tx.product.update({
    where: { id: productId },
    data: {
      availabilityType,
      nextHarvestDate: nextLot?.expectedHarvestDate ?? null,
      nextHarvestQtyTon: nextLot?.expectedQuantityTon ?? null,
    },
  });
}
