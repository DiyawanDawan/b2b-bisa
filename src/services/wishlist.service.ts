import prisma from '#config/prisma';
import AppError from '#utils/appError';
import { ProductStatus } from '#prisma';

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
      profile: { select: { companyName: true } },
      verification: { select: { isVerified: true, verificationStatus: true } },
    },
  },
};

const mapProduct = (product: Record<string, unknown>) => {
  const p = product as {
    user?: {
      verification?: { isVerified?: boolean; verificationStatus?: string };
    } & Record<string, unknown>;
  };
  return {
    ...p,
    user: p.user
      ? {
          ...p.user,
          isVerified: p.user.verification?.isVerified || false,
          verificationStatus: p.user.verification?.verificationStatus || 'PENDING',
        }
      : p.user,
  };
};

export const getWishlist = async (userId: string) => {
  const likes = await prisma.productLike.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    include: { product: { select: productSelect } },
  });

  const products = likes.map((l) => mapProduct(l.product as Record<string, unknown>));
  return { products, count: products.length };
};

export const getWishlistIds = async (userId: string) => {
  const likes = await prisma.productLike.findMany({
    where: { userId },
    select: { productId: true },
  });
  return { productIds: likes.map((l) => l.productId) };
};

export const toggleLike = async (userId: string, productId: string) => {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true, status: true },
  });

  if (!product) throw new AppError('Produk tidak ditemukan.', 404);
  if (product.status !== ProductStatus.ACTIVE) throw new AppError('Produk tidak tersedia.', 400);

  const existing = await prisma.productLike.findUnique({
    where: { userId_productId: { userId, productId } },
  });

  if (existing) {
    await prisma.productLike.delete({ where: { id: existing.id } });
    return { liked: false, productId };
  }

  await prisma.productLike.create({ data: { userId, productId } });
  return { liked: true, productId };
};

export const isProductLiked = async (userId: string, productId: string) => {
  const existing = await prisma.productLike.findUnique({
    where: { userId_productId: { userId, productId } },
  });
  return { liked: !!existing };
};
