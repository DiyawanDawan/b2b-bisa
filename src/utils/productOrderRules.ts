import { Prisma } from '#prisma';
import prisma from '#config/prisma';
import AppError from '#utils/appError';

export type DirectCheckoutProductRow = {
  id: string;
  userId: string;
  name: string;
  stock: Prisma.Decimal;
  minOrder: Prisma.Decimal;
  pricePerUnit: Prisma.Decimal;
  samplePricePerUnit: Prisma.Decimal | null;
  sampleMaxQty: Prisma.Decimal;
  allowsSample: boolean;
  status: string;
};

export const directCheckoutProductSelect = {
  id: true,
  userId: true,
  name: true,
  stock: true,
  minOrder: true,
  pricePerUnit: true,
  samplePricePerUnit: true,
  sampleMaxQty: true,
  allowsSample: true,
  status: true,
} as const;

export function resolveCheckoutUnitPrice(
  product: DirectCheckoutProductRow,
  orderType: 'STANDARD' | 'SAMPLE',
): Prisma.Decimal {
  if (orderType === 'SAMPLE') {
    return product.samplePricePerUnit ?? product.pricePerUnit;
  }
  return product.pricePerUnit;
}

export function assertDirectCheckoutItem(
  buyerId: string,
  item: { productId: string; quantity: number },
  product: DirectCheckoutProductRow,
  orderType: 'STANDARD' | 'SAMPLE',
): void {
  if (product.userId === buyerId) {
    throw new AppError(`Anda tidak bisa membeli produk milik sendiri (${product.name}).`, 400);
  }
  if (product.status !== 'ACTIVE') {
    throw new AppError(`Produk ${product.name} tidak aktif.`, 400);
  }
  if (product.stock.lt(item.quantity)) {
    throw new AppError(
      `Stok ${product.name} tidak mencukupi. Tersisa ${product.stock.toString()}.`,
      400,
    );
  }

  if (orderType === 'SAMPLE') {
    if (!product.allowsSample) {
      throw new AppError(`Produk ${product.name} tidak menerima sample order.`, 400);
    }
    if (item.quantity > Number(product.sampleMaxQty)) {
      throw new AppError(
        `Sample order ${product.name} maksimal ${product.sampleMaxQty.toString()} unit.`,
        400,
      );
    }
    return;
  }

  if (item.quantity < Number(product.minOrder)) {
    throw new AppError(
      `Jumlah ${product.name} di bawah minimum order (${product.minOrder.toString()}).`,
      400,
    );
  }
}

export function assertSampleCheckoutShape(
  items: Array<{ productId: string; quantity: number }>,
  orderType: 'STANDARD' | 'SAMPLE',
): void {
  if (orderType !== 'SAMPLE') return;
  if (items.length !== 1) {
    throw new AppError('Sample order hanya untuk satu produk per checkout.', 400);
  }
}

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
