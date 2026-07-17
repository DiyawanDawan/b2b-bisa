import prisma from '#config/prisma';
import AppError from '#utils/appError';
import { ProductStatus } from '#prisma';
import * as storageService from '#services/storage.service';
import { attachUserMediaUrls } from '#utils/userMedia.util';

const productSelect = {
  id: true,
  name: true,
  description: true,
  pricePerUnit: true,
  originalPrice: true,
  stock: true,
  minOrder: true,
  unit: true,
  thumbnailUrl: true,
  biomassaType: true,
  grade: true,
  province: true,
  regency: true,
  status: true,
  productMode: true,
  fertilizerType: true,
  isChemicalFree: true,
  cropType: true,
  isCertified: true,
  isIotMonitored: true,
  isEscrowProtected: true,
  averageRating: true,
  totalReviews: true,
  totalSold: true,
  createdAt: true,
  user: {
    select: {
      id: true,
      fullName: true,
      avatarUrl: true,
      province: true,
      regency: true,
      profile: {
        select: {
          companyName: true,
          rajaongkirOriginId: true,
          rajaongkirOriginLabel: true,
        },
      },
      verification: { select: { isVerified: true, verificationStatus: true } },
    },
  },
};

const mapCartItem = (item: { id: string; quantity: unknown; product: Record<string, unknown> }) => {
  const p = item.product as {
    thumbnailUrl?: string | null;
    pricePerUnit?: unknown;
    user?: {
      avatarUrl?: string | null;
      verification?: { isVerified?: boolean; verificationStatus?: string };
      isVerified?: boolean;
      verificationStatus?: string;
    } & Record<string, unknown>;
  } & Record<string, unknown>;
  const thumbnailUrl =
    typeof p.thumbnailUrl === 'string' && p.thumbnailUrl
      ? storageService.toMediaResponsePath(p.thumbnailUrl)
      : p.thumbnailUrl;

  const user = p.user
    ? attachUserMediaUrls({
        ...p.user,
      })
    : p.user;

  return {
    id: item.id,
    quantity: Number(item.quantity),
    product: {
      ...p,
      thumbnailUrl,
      user,
    },
  };
};

export const getCart = async (userId: string) => {
  const items = await prisma.cartItem.findMany({
    where: { userId },
    orderBy: { updatedAt: 'desc' },
    include: { product: { select: productSelect } },
  });

  const mapped = items.map(mapCartItem);
  const totalAmount = mapped.reduce(
    (sum, i) => sum + i.quantity * Number(i.product.pricePerUnit),
    0,
  );

  return { items: mapped, count: mapped.length, totalAmount };
};

export const getCartCount = async (userId: string) => {
  const count = await prisma.cartItem.count({ where: { userId } });
  return { count };
};

export const addToCart = async (userId: string, productId: string, quantity: number) => {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true, status: true, stock: true, minOrder: true, userId: true },
  });

  if (!product) throw new AppError('Produk tidak ditemukan.', 404);
  if (product.status !== ProductStatus.ACTIVE) throw new AppError('Produk tidak tersedia.', 400);
  if (product.userId === userId)
    throw new AppError('Tidak bisa menambahkan produk sendiri ke keranjang.', 400);

  const minOrder = Number(product.minOrder);
  if (quantity < minOrder) {
    throw new AppError(`Minimal order ${minOrder} unit.`, 400);
  }
  if (quantity > Number(product.stock)) {
    throw new AppError('Stok produk tidak mencukupi.', 400);
  }

  const existing = await prisma.cartItem.findUnique({
    where: { userId_productId: { userId, productId } },
  });

  if (existing) {
    const newQty = Number(existing.quantity) + quantity;
    if (newQty < minOrder) {
      throw new AppError(`Minimal order ${minOrder} unit.`, 400);
    }
    if (newQty > Number(product.stock)) {
      throw new AppError('Stok produk tidak mencukupi.', 400);
    }
    await prisma.cartItem.update({
      where: { id: existing.id },
      data: { quantity: newQty },
    });
  } else {
    await prisma.cartItem.create({
      data: { userId, productId, quantity },
    });
  }

  return getCart(userId);
};

export const updateCartItem = async (userId: string, cartItemId: string, quantity: number) => {
  const item = await prisma.cartItem.findFirst({
    where: { id: cartItemId, userId },
    include: { product: { select: { stock: true, minOrder: true } } },
  });

  if (!item) throw new AppError('Item keranjang tidak ditemukan.', 404);

  const minOrder = Number(item.product.minOrder);
  if (quantity < minOrder) {
    throw new AppError(`Minimal order ${minOrder} unit.`, 400);
  }
  if (quantity > Number(item.product.stock)) {
    throw new AppError('Stok produk tidak mencukupi.', 400);
  }

  await prisma.cartItem.update({
    where: { id: cartItemId },
    data: { quantity },
  });

  return getCart(userId);
};

export const removeCartItem = async (userId: string, cartItemId: string) => {
  const item = await prisma.cartItem.findFirst({
    where: { id: cartItemId, userId },
  });
  if (!item) throw new AppError('Item keranjang tidak ditemukan.', 404);

  await prisma.cartItem.delete({ where: { id: cartItemId } });
  return getCart(userId);
};

export const clearCart = async (userId: string) => {
  await prisma.cartItem.deleteMany({ where: { userId } });
  return { items: [], count: 0, totalAmount: 0 };
};
