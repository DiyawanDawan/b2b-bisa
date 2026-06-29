import { Prisma } from '#prisma';
import prisma from '#config/prisma';
import AppError from '#utils/appError';
import { ProductStatus, TransactionStatus, TransactionType, PaymentStatus } from '#prisma';

export const PROMOTE_COST_IDR = 50_000;
export const PROMOTE_DAYS = 7;

export const expireStalePromotions = async () => {
  await prisma.product.updateMany({
    where: {
      isPromoted: true,
      promotedUntil: { lt: new Date() },
    },
    data: { isPromoted: false },
  });
};

const isPromotionActive = (product: {
  isPromoted: boolean;
  promotedUntil: Date | null;
}) => product.isPromoted && !!product.promotedUntil && product.promotedUntil > new Date();

export const promoteProduct = async (
  supplierId: string,
  productId: string,
  days: number = PROMOTE_DAYS,
) => {
  if (days < 1 || days > 30) {
    throw new AppError('Durasi promosi harus antara 1–30 hari.', 400);
  }

  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: {
      id: true,
      userId: true,
      name: true,
      status: true,
      isPromoted: true,
      promotedUntil: true,
    },
  });

  if (!product || product.userId !== supplierId) {
    throw new AppError('Produk tidak ditemukan atau bukan milik Anda.', 404);
  }
  if (product.status !== ProductStatus.ACTIVE) {
    throw new AppError('Hanya produk aktif yang dapat dipromosikan.', 400);
  }

  const costPerDay = new Prisma.Decimal(PROMOTE_COST_IDR).div(PROMOTE_DAYS);
  const totalCost = costPerDay.mul(days);

  const now = new Date();
  const baseUntil =
    isPromotionActive(product) && product.promotedUntil && product.promotedUntil > now
      ? product.promotedUntil
      : now;
  const promotedUntil = new Date(baseUntil.getTime() + days * 24 * 60 * 60 * 1000);

  const updated = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT * FROM wallets WHERE user_id = ${supplierId} FOR UPDATE`;

    const wallet = await tx.wallet.findUnique({ where: { userId: supplierId } });
    if (!wallet || wallet.balance.lt(totalCost)) {
      throw new AppError(
        'Saldo dompet tidak mencukupi untuk promosi. Isi saldo dari penjualan terlebih dahulu.',
        400,
      );
    }

    await tx.wallet.update({
      where: { userId: supplierId },
      data: { balance: { decrement: totalCost } },
    });

    await tx.transaction.create({
      data: {
        userId: supplierId,
        amount: totalCost,
        platformFee: totalCost,
        sellerAmount: new Prisma.Decimal(0),
        status: TransactionStatus.RELEASED,
        paymentStatus: PaymentStatus.SUCCESS,
        type: TransactionType.PROMOTION,
        externalId: `PROMO-${productId.slice(0, 8)}-${Date.now()}`,
        feeBreakdownSnapshot: {
          productId,
          productName: product.name,
          days,
          costPerDay: Number(costPerDay),
        },
        paidAt: now,
      },
    });

    return tx.product.update({
      where: { id: productId },
      data: {
        isPromoted: true,
        promotedUntil,
      },
      select: {
        id: true,
        isPromoted: true,
        promotedUntil: true,
        promoImpressions: true,
        promoClicks: true,
      },
    });
  });

  return {
    ...updated,
    costPaid: Number(totalCost),
    daysAdded: days,
  };
};

export const recordPromoImpression = async (productId: string) => {
  await expireStalePromotions();
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { isPromoted: true, promotedUntil: true, status: true },
  });
  if (!product || product.status !== ProductStatus.ACTIVE || !isPromotionActive(product)) {
    return { recorded: false };
  }

  await prisma.product.update({
    where: { id: productId },
    data: { promoImpressions: { increment: 1 } },
  });
  return { recorded: true };
};

export const recordPromoClick = async (productId: string) => {
  await expireStalePromotions();
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { isPromoted: true, promotedUntil: true, status: true },
  });
  if (!product || product.status !== ProductStatus.ACTIVE || !isPromotionActive(product)) {
    return { recorded: false };
  }

  await prisma.product.update({
    where: { id: productId },
    data: { promoClicks: { increment: 1 } },
  });
  return { recorded: true };
};

export { isPromotionActive };
