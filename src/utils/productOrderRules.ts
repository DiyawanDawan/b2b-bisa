import prisma from '#config/prisma';
import AppError from '#utils/appError';

export async function assertQuantityMeetsMinOrder(
  productId: string,
  quantity: number,
): Promise<void> {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { minOrder: true, unit: true },
  });

  if (!product) throw new AppError('Produk tidak ditemukan.', 404);

  const minOrder = Number(product.minOrder);
  if (quantity < minOrder) {
    throw new AppError(`Minimal order ${minOrder} ${product.unit}.`, 400);
  }
}
