import crypto from 'crypto';
import prisma from '#config/prisma';
import AppError from '#utils/appError';
import * as storageService from '#services/storage.service';
import { createNotification } from '#services/notification.service';
import { createDirectOrderFromCart } from '#services/order.service';
import { assertBuyerCommerceReady } from '#utils/readiness.util';
import {
  BookingStatus,
  HarvestLotStatus,
  NotificationType,
  Prisma,
  ProductMode,
  ProductStatus,
  UnitStatus,
  UserRole,
} from '#prisma';

const BOOKING_HOLD_HOURS = Number(process.env.BOOKING_HOLD_HOURS ?? 24);

const userSelect = {
  id: true,
  fullName: true,
  avatarUrl: true,
  role: true,
  profile: { select: { companyName: true } },
} as const;

const mapUser = (user: {
  id: string;
  fullName: string;
  avatarUrl: string | null;
  profile?: { companyName: string | null } | null;
}) => ({
  id: user.id,
  fullName: user.fullName,
  avatarUrl: user.avatarUrl ? storageService.getPublicUrl(user.avatarUrl) : null,
  companyName: user.profile?.companyName ?? null,
});

const generateBookingNumber = () => {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const hex = crypto.randomBytes(4).toString('hex').toUpperCase();
  return `BKG-${date}-${hex}`;
};

const toTon = (quantity: Prisma.Decimal | number, unit: UnitStatus): Prisma.Decimal => {
  const qty = new Prisma.Decimal(quantity);
  return unit === UnitStatus.TON ? qty : qty.div(1000);
};

const computeAvailableStock = (stock: Prisma.Decimal, reserved: Prisma.Decimal) =>
  stock.sub(reserved);

const computeAvailableLotTon = (
  expected: Prisma.Decimal,
  reserved: Prisma.Decimal,
): Prisma.Decimal => expected.sub(reserved);

const bookingInclude = {
  buyer: { select: userSelect },
  supplier: { select: userSelect },
  product: {
    select: {
      id: true,
      name: true,
      thumbnailUrl: true,
      productMode: true,
      unit: true,
      stock: true,
      reservedStock: true,
      pricePerUnit: true,
      availabilityType: true,
    },
  },
  harvestLot: {
    select: {
      id: true,
      seasonLabel: true,
      expectedHarvestDate: true,
      expectedQuantityTon: true,
      reservedQuantityTon: true,
      status: true,
    },
  },
  order: { select: { id: true, orderNumber: true, status: true } },
} as const;

const mapBooking = (row: {
  id: string;
  bookingNumber: string;
  buyerId: string;
  supplierId: string;
  productId: string;
  harvestLotId: string | null;
  productMode: ProductMode;
  quantity: Prisma.Decimal;
  unit: UnitStatus;
  priceSnapshot: Prisma.Decimal;
  subtotalSnapshot: Prisma.Decimal;
  status: BookingStatus;
  expiresAt: Date;
  expectedDeliveryDate: Date | null;
  notes: string | null;
  orderId: string | null;
  confirmedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  buyer: Parameters<typeof mapUser>[0];
  supplier: Parameters<typeof mapUser>[0];
  product: {
    id: string;
    name: string;
    thumbnailUrl: string | null;
    productMode: ProductMode;
    unit: UnitStatus;
    stock: Prisma.Decimal;
    reservedStock: Prisma.Decimal;
    pricePerUnit: Prisma.Decimal;
    availabilityType: string;
  };
  harvestLot: {
    id: string;
    seasonLabel: string | null;
    expectedHarvestDate: Date;
    expectedQuantityTon: Prisma.Decimal;
    reservedQuantityTon: Prisma.Decimal;
    status: HarvestLotStatus;
  } | null;
  order: { id: string; orderNumber: string; status: string } | null;
}) => {
  const availableStock = computeAvailableStock(row.product.stock, row.product.reservedStock);
  const availableLotTon = row.harvestLot
    ? computeAvailableLotTon(
        row.harvestLot.expectedQuantityTon,
        row.harvestLot.reservedQuantityTon,
      )
    : null;

  return {
    id: row.id,
    bookingNumber: row.bookingNumber,
    buyerId: row.buyerId,
    supplierId: row.supplierId,
    productId: row.productId,
    harvestLotId: row.harvestLotId,
    productMode: row.productMode,
    quantity: Number(row.quantity),
    unit: row.unit,
    priceSnapshot: Number(row.priceSnapshot),
    subtotalSnapshot: Number(row.subtotalSnapshot),
    status: row.status,
    expiresAt: row.expiresAt,
    expectedDeliveryDate: row.expectedDeliveryDate,
    notes: row.notes,
    orderId: row.orderId,
    confirmedAt: row.confirmedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    isExpired:
      row.status === BookingStatus.PENDING_PAYMENT && row.expiresAt.getTime() < Date.now(),
    buyer: mapUser(row.buyer),
    supplier: mapUser(row.supplier),
    product: {
      id: row.product.id,
      name: row.product.name,
      thumbnailUrl: row.product.thumbnailUrl
        ? storageService.toMediaResponsePath(row.product.thumbnailUrl)
        : null,
      productMode: row.product.productMode,
      unit: row.product.unit,
      stock: Number(row.product.stock),
      reservedStock: Number(row.product.reservedStock),
      availableStock: Number(availableStock),
      pricePerUnit: Number(row.product.pricePerUnit),
      availabilityType: row.product.availabilityType,
    },
    harvestLot: row.harvestLot
      ? {
          ...row.harvestLot,
          expectedQuantityTon: Number(row.harvestLot.expectedQuantityTon),
          reservedQuantityTon: Number(row.harvestLot.reservedQuantityTon),
          availableQuantityTon: Number(availableLotTon),
        }
      : null,
    order: row.order,
  };
};

const releaseBookingReserve = async (
  tx: Prisma.TransactionClient,
  booking: {
    productId: string;
    harvestLotId: string | null;
    quantity: Prisma.Decimal;
    unit: UnitStatus;
  },
) => {
  if (booking.harvestLotId) {
    const qtyTon = toTon(booking.quantity, booking.unit);
    await tx.productHarvestLot.update({
      where: { id: booking.harvestLotId },
      data: { reservedQuantityTon: { decrement: qtyTon } },
    });
  } else {
    await tx.product.update({
      where: { id: booking.productId },
      data: { reservedStock: { decrement: booking.quantity } },
    });
  }
};

/** Tandai booking kedaluwarsa dan lepaskan reserve. */
export const expireStaleBookings = async () => {
  const now = new Date();
  const stale = await prisma.booking.findMany({
    where: {
      status: { in: [BookingStatus.PENDING_PAYMENT, BookingStatus.CONFIRMED] },
      expiresAt: { lt: now },
    },
    select: {
      id: true,
      buyerId: true,
      supplierId: true,
      productId: true,
      harvestLotId: true,
      quantity: true,
      unit: true,
      bookingNumber: true,
      product: { select: { name: true } },
    },
  });

  if (stale.length === 0) return { count: 0 };

  await prisma.$transaction(
    async (tx) => {
      for (const b of stale) {
        await releaseBookingReserve(tx, b);
        await tx.booking.update({
          where: { id: b.id },
          data: { status: BookingStatus.EXPIRED },
        });
      }
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );

  for (const b of stale) {
    await createNotification({
      userId: b.buyerId,
      type: NotificationType.BOOKING,
      title: 'Booking kedaluwarsa',
      message: `Booking ${b.bookingNumber} untuk ${b.product.name} telah kedaluwarsa. Stok kembali tersedia.`,
      refId: b.id,
      data: { bookingId: b.id, bookingNumber: b.bookingNumber },
    }).catch(() => undefined);
  }

  return { count: stale.length };
};

const assertBookingAccessible = (
  booking: { buyerId: string; supplierId: string },
  userId: string,
) => {
  if (booking.buyerId !== userId && booking.supplierId !== userId) {
    throw new AppError('Anda tidak memiliki akses ke booking ini.', 403);
  }
};

export const createBooking = async (
  buyerId: string,
  data: {
    productId: string;
    harvestLotId?: string;
    quantity: number;
    expectedDeliveryDate?: Date;
    notes?: string;
  },
) => {
  await assertBuyerCommerceReady(buyerId);

  const product = await prisma.product.findUnique({
    where: { id: data.productId },
    select: {
      id: true,
      userId: true,
      name: true,
      status: true,
      productMode: true,
      stock: true,
      reservedStock: true,
      unit: true,
      minOrder: true,
      pricePerUnit: true,
      availabilityType: true,
    },
  });

  if (!product) throw new AppError('Produk tidak ditemukan.', 404);
  if (product.userId === buyerId) {
    throw new AppError('Anda tidak bisa booking produk sendiri.', 400);
  }
  if (product.status !== ProductStatus.ACTIVE) {
    throw new AppError(`Produk ${product.name} tidak aktif.`, 400);
  }
  if (data.quantity < Number(product.minOrder)) {
    throw new AppError(
      `Minimal booking ${product.minOrder.toString()} ${product.unit}.`,
      400,
    );
  }

  const qty = new Prisma.Decimal(data.quantity);
  const expiresAt = new Date(Date.now() + BOOKING_HOLD_HOURS * 60 * 60 * 1000);
  const priceSnapshot = product.pricePerUnit;
  const subtotalSnapshot = qty.mul(priceSnapshot);

  const booking = await prisma.$transaction(
    async (tx) => {
      if (data.harvestLotId) {
        if (product.productMode !== ProductMode.ORGANIC_PRODUCE) {
          throw new AppError('Booking lot panen hanya untuk produk hasil tani.', 400);
        }

        const lot = await tx.productHarvestLot.findFirst({
          where: { id: data.harvestLotId, productId: product.id },
        });
        if (!lot) throw new AppError('Lot panen tidak ditemukan.', 404);
        if (![HarvestLotStatus.SCHEDULED, HarvestLotStatus.HARVESTING].includes(lot.status as HarvestLotStatus)) {
          throw new AppError('Lot panen tidak bisa dibooking pada status ini.', 400);
        }

        const qtyTon = toTon(qty, product.unit);
        const availableTon = computeAvailableLotTon(
          lot.expectedQuantityTon,
          lot.reservedQuantityTon,
        );
        if (qtyTon.gt(availableTon)) {
          throw new AppError(
            `Kuota lot panen tidak mencukupi. Tersisa ${availableTon.toString()} ton.`,
            400,
          );
        }

        await tx.productHarvestLot.update({
          where: { id: lot.id },
          data: { reservedQuantityTon: { increment: qtyTon } },
        });
      } else {
        const fresh = await tx.product.findUnique({
          where: { id: product.id },
          select: { stock: true, reservedStock: true },
        });
        if (!fresh) throw new AppError('Produk tidak ditemukan.', 404);

        const available = computeAvailableStock(fresh.stock, fresh.reservedStock);
        if (qty.gt(available)) {
          throw new AppError(
            `Stok tersedia tidak mencukupi. Tersisa ${available.toString()} ${product.unit}.`,
            400,
          );
        }

        await tx.product.update({
          where: { id: product.id },
          data: { reservedStock: { increment: qty } },
        });
      }

      return tx.booking.create({
        data: {
          bookingNumber: generateBookingNumber(),
          buyerId,
          supplierId: product.userId,
          productId: product.id,
          harvestLotId: data.harvestLotId ?? null,
          productMode: product.productMode,
          quantity: qty,
          unit: product.unit,
          priceSnapshot,
          subtotalSnapshot,
          expiresAt,
          expectedDeliveryDate: data.expectedDeliveryDate ?? null,
          notes: data.notes?.trim() || null,
        },
        include: bookingInclude,
      });
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 15000 },
  );

  await createNotification({
    userId: product.userId,
    type: NotificationType.BOOKING,
    title: 'Booking baru masuk',
    message: `Buyer mengajukan booking ${booking.bookingNumber} untuk ${product.name} (${data.quantity} ${product.unit}).`,
    refId: booking.id,
    data: { bookingId: booking.id, bookingNumber: booking.bookingNumber },
  }).catch(() => undefined);

  return mapBooking(booking);
};

export const listMyBookings = async (
  userId: string,
  role: UserRole,
  page = 1,
  limit = 20,
  status?: BookingStatus,
) => {
  await expireStaleBookings();

  const where =
    role === UserRole.SUPPLIER
      ? { supplierId: userId, ...(status && { status }) }
      : { buyerId: userId, ...(status && { status }) };

  const [rows, total] = await Promise.all([
    prisma.booking.findMany({
      where,
      include: bookingInclude,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.booking.count({ where }),
  ]);

  return {
    items: rows.map(mapBooking),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
};

export const listIncomingBookings = async (
  supplierId: string,
  page = 1,
  limit = 20,
  status?: BookingStatus,
) => {
  await expireStaleBookings();

  const where = {
    supplierId,
    ...(status && { status }),
  };

  const [rows, total] = await Promise.all([
    prisma.booking.findMany({
      where,
      include: bookingInclude,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.booking.count({ where }),
  ]);

  return {
    items: rows.map(mapBooking),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
};

export const getBookingById = async (id: string, userId: string) => {
  await expireStaleBookings();

  const row = await prisma.booking.findUnique({
    where: { id },
    include: bookingInclude,
  });
  if (!row) throw new AppError('Booking tidak ditemukan.', 404);
  assertBookingAccessible(row, userId);
  return mapBooking(row);
};

export const cancelBooking = async (
  id: string,
  userId: string,
  reason?: string,
) => {
  const row = await prisma.booking.findUnique({ where: { id } });
  if (!row) throw new AppError('Booking tidak ditemukan.', 404);

  const isBuyer = row.buyerId === userId;
  const isSupplier = row.supplierId === userId;
  if (!isBuyer && !isSupplier) {
    throw new AppError('Anda tidak memiliki akses ke booking ini.', 403);
  }

  if (![BookingStatus.PENDING_PAYMENT, BookingStatus.CONFIRMED].includes(row.status)) {
    throw new AppError('Booking tidak bisa dibatalkan pada status ini.', 400);
  }
  if (row.expiresAt.getTime() < Date.now() && row.status === BookingStatus.PENDING_PAYMENT) {
    throw new AppError('Booking sudah kedaluwarsa.', 400);
  }

  const updated = await prisma.$transaction(
    async (tx) => {
      await releaseBookingReserve(tx, row);
      return tx.booking.update({
        where: { id },
        data: {
          status: BookingStatus.CANCELLED,
          cancelledById: userId,
          cancelReason: reason?.trim() || null,
        },
        include: bookingInclude,
      });
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );

  const notifyUserId = isBuyer ? row.supplierId : row.buyerId;
  await createNotification({
    userId: notifyUserId,
    type: NotificationType.BOOKING,
    title: 'Booking dibatalkan',
    message: `Booking ${row.bookingNumber} telah dibatalkan.`,
    refId: row.id,
    data: { bookingId: row.id, bookingNumber: row.bookingNumber },
  }).catch(() => undefined);

  return mapBooking(updated);
};

export const confirmBooking = async (id: string, supplierId: string) => {
  const row = await prisma.booking.findUnique({ where: { id } });
  if (!row) throw new AppError('Booking tidak ditemukan.', 404);
  if (row.supplierId !== supplierId) {
    throw new AppError('Hanya supplier yang bisa mengonfirmasi booking.', 403);
  }
  if (row.status !== BookingStatus.PENDING_PAYMENT) {
    throw new AppError('Booking hanya bisa dikonfirmasi dari status menunggu pembayaran.', 400);
  }
  if (row.expiresAt.getTime() < Date.now()) {
    throw new AppError('Booking sudah kedaluwarsa.', 400);
  }

  const updated = await prisma.booking.update({
    where: { id },
    data: { status: BookingStatus.CONFIRMED, confirmedAt: new Date() },
    include: bookingInclude,
  });

  await createNotification({
    userId: row.buyerId,
    type: NotificationType.BOOKING,
    title: 'Booking dikonfirmasi',
    message: `Supplier mengonfirmasi booking ${row.bookingNumber}. Silakan lanjut checkout.`,
    refId: row.id,
    data: { bookingId: row.id, bookingNumber: row.bookingNumber },
  }).catch(() => undefined);

  return mapBooking(updated);
};

export const checkoutBooking = async (
  bookingId: string,
  buyerId: string,
  data: {
    shippingAddress?: string;
    shippingSnapshot?: Record<string, unknown>;
    shippingSelections?: Array<Record<string, unknown> & { sellerId: string }>;
    notes?: string;
    voucherCode?: string;
  },
) => {
  await assertBuyerCommerceReady(buyerId);

  const row = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { product: { select: { name: true, userId: true } } },
  });
  if (!row) throw new AppError('Booking tidak ditemukan.', 404);
  if (row.buyerId !== buyerId) {
    throw new AppError('Hanya buyer pemilik booking yang bisa checkout.', 403);
  }
  if (![BookingStatus.PENDING_PAYMENT, BookingStatus.CONFIRMED].includes(row.status)) {
    throw new AppError('Booking tidak bisa di-checkout pada status ini.', 400);
  }
  if (row.expiresAt.getTime() < Date.now()) {
    throw new AppError('Booking sudah kedaluwarsa. Buat booking baru.', 400);
  }

  // Pre-harvest lot booking: stock may not exist yet — block direct checkout until stocked
  if (row.harvestLotId) {
    const lot = await prisma.productHarvestLot.findUnique({
      where: { id: row.harvestLotId },
      select: { status: true },
    });
    if (!lot || lot.status !== HarvestLotStatus.STOCKED) {
      throw new AppError(
        'Checkout pre-panen hanya bisa dilakukan setelah lot masuk stok (stock-in).',
        400,
      );
    }
  }

  const checkoutNotes = [
    data.notes?.trim(),
    row.notes?.trim(),
    `Dari booking ${row.bookingNumber}`,
  ]
    .filter(Boolean)
    .join(' · ');

  const orderResult = await createDirectOrderFromCart(buyerId, {
    items: [{ productId: row.productId, quantity: Number(row.quantity) }],
    shippingAddress: data.shippingAddress,
    shippingSnapshot: data.shippingSnapshot as Parameters<
      typeof createDirectOrderFromCart
    >[1]['shippingSnapshot'],
    shippingSelections: data.shippingSelections as Parameters<
      typeof createDirectOrderFromCart
    >[1]['shippingSelections'],
    notes: checkoutNotes,
    voucherCode: data.voucherCode,
  });

  const leadOrderId = orderResult.leadOrderId;
  if (!leadOrderId) {
    throw new AppError('Gagal membuat pesanan dari booking.', 500);
  }

  const fulfilled = await prisma.$transaction(
    async (tx) => {
      const current = await tx.booking.findUnique({ where: { id: bookingId } });
      if (!current || current.status === BookingStatus.FULFILLED) {
        return current;
      }

      await releaseBookingReserve(tx, current);
      return tx.booking.update({
        where: { id: bookingId },
        data: {
          status: BookingStatus.FULFILLED,
          orderId: leadOrderId,
        },
        include: bookingInclude,
      });
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );

  if (!fulfilled) throw new AppError('Booking tidak ditemukan setelah checkout.', 500);

  await createNotification({
    userId: row.supplierId,
    type: NotificationType.BOOKING,
    title: 'Booking di-checkout',
    message: `Buyer checkout booking ${row.bookingNumber} menjadi pesanan.`,
    refId: row.id,
    data: { bookingId: row.id, orderId: leadOrderId },
  }).catch(() => undefined);

  return {
    booking: mapBooking(fulfilled),
    checkout: orderResult,
  };
};
