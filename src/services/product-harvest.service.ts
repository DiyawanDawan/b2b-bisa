import prisma from '#config/prisma';
import AppError from '#utils/appError';
import {
  HarvestLotStatus,
  Prisma,
  ProductAvailabilityType,
  ProductMode,
  ProductStatus,
} from '#prisma';

const lotSelect = {
  id: true,
  productId: true,
  seasonLabel: true,
  expectedHarvestDate: true,
  expectedQuantityTon: true,
  reservedQuantityTon: true,
  actualHarvestDate: true,
  actualQuantityTon: true,
  status: true,
  notes: true,
  stockedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

const ensureOrganicProductOwner = async (productId: string, userId: string) => {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true, userId: true, productMode: true, stock: true },
  });
  if (!product) throw new AppError('Produk tidak ditemukan.', 404);
  if (product.userId !== userId) throw new AppError('Anda tidak memiliki akses.', 403);
  if (product.productMode !== ProductMode.ORGANIC_PRODUCE) {
    throw new AppError('Jadwal panen hanya untuk produk hasil tani.', 400);
  }
  return product;
};

const refreshProductAvailability = async (
  productId: string,
  tx: Prisma.TransactionClient = prisma,
) => {
  const [product, nextLot] = await Promise.all([
    tx.product.findUnique({ where: { id: productId }, select: { stock: true } }),
    tx.productHarvestLot.findFirst({
      where: {
        productId,
        status: HarvestLotStatus.SCHEDULED,
        expectedHarvestDate: { gte: startOfToday() },
      },
      orderBy: { expectedHarvestDate: 'asc' },
      select: { expectedHarvestDate: true, expectedQuantityTon: true },
    }),
  ]);

  if (!product) return;
  const stockReady = Number(product.stock) > 0;
  const hasPreHarvest = !!nextLot;
  const availabilityType = stockReady
    ? hasPreHarvest
      ? ProductAvailabilityType.MIXED
      : ProductAvailabilityType.READY
    : hasPreHarvest
      ? ProductAvailabilityType.PRE_HARVEST
      : ProductAvailabilityType.READY;

  await tx.product.update({
    where: { id: productId },
    data: {
      availabilityType,
      nextHarvestDate: nextLot?.expectedHarvestDate ?? null,
      nextHarvestQtyTon: nextLot?.expectedQuantityTon ?? null,
      ...(stockReady ? { status: ProductStatus.ACTIVE } : {}),
    },
  });
};

export const createHarvestLot = async (
  productId: string,
  userId: string,
  data: {
    seasonLabel?: string;
    expectedHarvestDate: Date;
    expectedQuantityTon: number;
    notes?: string;
  },
) => {
  await ensureOrganicProductOwner(productId, userId);
  if (data.expectedHarvestDate < startOfToday()) {
    throw new AppError('Tanggal panen harus hari ini atau setelahnya.', 400);
  }
  if (data.expectedQuantityTon <= 0) throw new AppError('Estimasi ton harus lebih dari 0.', 400);

  const lot = await prisma.$transaction(async (tx) => {
    const created = await tx.productHarvestLot.create({
      data: {
        productId,
        seasonLabel: data.seasonLabel,
        expectedHarvestDate: data.expectedHarvestDate,
        expectedQuantityTon: new Prisma.Decimal(data.expectedQuantityTon),
        notes: data.notes,
      },
      select: lotSelect,
    });
    await refreshProductAvailability(productId, tx);
    return created;
  });
  return lot;
};

export const listHarvestLotsByProduct = async (productId: string) =>
  prisma.productHarvestLot.findMany({
    where: { productId },
    orderBy: [{ expectedHarvestDate: 'asc' }, { createdAt: 'desc' }],
    select: lotSelect,
  });

export const updateHarvestLot = async (
  lotId: string,
  userId: string,
  data: {
    seasonLabel?: string;
    expectedHarvestDate?: Date;
    expectedQuantityTon?: number;
    notes?: string;
  },
) => {
  const lot = await prisma.productHarvestLot.findUnique({
    where: { id: lotId },
    select: {
      id: true,
      productId: true,
      status: true,
      product: { select: { userId: true, productMode: true } },
    },
  });
  if (!lot) throw new AppError('Batch panen tidak ditemukan.', 404);
  if (lot.product.userId !== userId) throw new AppError('Anda tidak memiliki akses.', 403);
  if (lot.product.productMode !== ProductMode.ORGANIC_PRODUCE)
    throw new AppError('Mode produk tidak valid.', 400);
  if (lot.status !== HarvestLotStatus.SCHEDULED) {
    throw new AppError('Batch hanya bisa diedit saat status SCHEDULED.', 400);
  }

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.productHarvestLot.update({
      where: { id: lotId },
      data: {
        ...(data.seasonLabel !== undefined ? { seasonLabel: data.seasonLabel } : {}),
        ...(data.expectedHarvestDate !== undefined
          ? { expectedHarvestDate: data.expectedHarvestDate }
          : {}),
        ...(data.expectedQuantityTon !== undefined
          ? { expectedQuantityTon: new Prisma.Decimal(data.expectedQuantityTon) }
          : {}),
        ...(data.notes !== undefined ? { notes: data.notes } : {}),
      },
      select: lotSelect,
    });
    await refreshProductAvailability(lot.productId, tx);
    return row;
  });
  return updated;
};

export const confirmHarvestLot = async (
  lotId: string,
  userId: string,
  data: { actualHarvestDate?: Date; actualQuantityTon: number },
) => {
  const lot = await prisma.productHarvestLot.findUnique({
    where: { id: lotId },
    select: { id: true, productId: true, status: true, product: { select: { userId: true } } },
  });
  if (!lot) throw new AppError('Batch panen tidak ditemukan.', 404);
  if (lot.product.userId !== userId) throw new AppError('Anda tidak memiliki akses.', 403);
  if (![HarvestLotStatus.SCHEDULED, HarvestLotStatus.HARVESTING].includes(lot.status)) {
    throw new AppError('Batch tidak dalam status panen aktif.', 400);
  }

  const actualDate = data.actualHarvestDate ?? new Date();
  const updated = await prisma.productHarvestLot.update({
    where: { id: lotId },
    data: {
      actualHarvestDate: actualDate,
      actualQuantityTon: new Prisma.Decimal(data.actualQuantityTon),
      status: HarvestLotStatus.HARVESTED,
    },
    select: lotSelect,
  });
  return updated;
};

export const stockInHarvestLot = async (lotId: string, userId: string) => {
  const lot = await prisma.productHarvestLot.findUnique({
    where: { id: lotId },
    select: {
      id: true,
      productId: true,
      status: true,
      actualQuantityTon: true,
      product: { select: { userId: true, unit: true } },
    },
  });
  if (!lot) throw new AppError('Batch panen tidak ditemukan.', 404);
  if (lot.product.userId !== userId) throw new AppError('Anda tidak memiliki akses.', 403);
  if (lot.status !== HarvestLotStatus.HARVESTED)
    throw new AppError('Batch belum dikonfirmasi panen.', 400);
  if (!lot.actualQuantityTon || Number(lot.actualQuantityTon) <= 0) {
    throw new AppError('Jumlah panen aktual belum valid.', 400);
  }

  const result = await prisma.$transaction(async (tx) => {
    const qtyTon = Number(lot.actualQuantityTon);
    const stockIncrement = lot.product.unit === 'KG' ? qtyTon * 1000 : qtyTon;
    await tx.product.update({
      where: { id: lot.productId },
      data: { stock: { increment: stockIncrement } },
    });
    const updatedLot = await tx.productHarvestLot.update({
      where: { id: lotId },
      data: { status: HarvestLotStatus.STOCKED, stockedAt: new Date() },
      select: lotSelect,
    });
    await refreshProductAvailability(lot.productId, tx);
    return updatedLot;
  });
  return result;
};

export const cancelHarvestLot = async (lotId: string, userId: string, notes?: string) => {
  const lot = await prisma.productHarvestLot.findUnique({
    where: { id: lotId },
    select: { id: true, productId: true, status: true, product: { select: { userId: true } } },
  });
  if (!lot) throw new AppError('Batch panen tidak ditemukan.', 404);
  if (lot.product.userId !== userId) throw new AppError('Anda tidak memiliki akses.', 403);
  if (lot.status === HarvestLotStatus.STOCKED) {
    throw new AppError('Batch yang sudah masuk stok tidak dapat dibatalkan.', 400);
  }

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.productHarvestLot.update({
      where: { id: lotId },
      data: { status: HarvestLotStatus.CANCELLED, notes },
      select: lotSelect,
    });
    await refreshProductAvailability(lot.productId, tx);
    return row;
  });
  return updated;
};
