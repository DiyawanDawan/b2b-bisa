import prisma from '#config/prisma';
import AppError from '#utils/appError';

/**
 * 1. Submit a Review (Buyer Only)
 */
export const createReview = async (
  buyerId: string,
  data: { orderId: string; rating: number; comment: string },
) => {
  const order = await prisma.order.findUnique({
    where: { id: data.orderId },
    include: { items: true, review: true },
  });

  if (!order) throw new AppError('Kontrak Pesanan tidak ditemukan.', 404);
  if (order.buyerId !== buyerId) throw new AppError('Anda bukan pembeli dari transaksi ini.', 403);
  if (order.status !== 'COMPLETED')
    throw new AppError(
      'Penilaian hanya bisa diisi setelah barang berstatus Selesai/Diterima.',
      400,
    );
  if (order.review) throw new AppError('Anda sudah memberikan penilaian untuk pesanan ini.', 409);

  // Asumsi 1 Order memiliki 1 primary item (karena kita merombak checkout menjadi per-negotiation)
  const productId = order.items[0].productId;

  return prisma.$transaction(async (tx) => {
    // 1. Buat Review
    const newReview = await tx.review.create({
      data: {
        orderId: data.orderId,
        productId,
        buyerId,
        rating: data.rating,
        comment: data.comment,
      },
    });

    // Skema V3 tidak menyimpan averageRating pada Produk secara manual, dihitung agregat secara langsung jika diperlukan

    return newReview;
  });
};

/**
 * 2. Get Product Reviews (Public)
 */
export const getProductReviews = async (
  productId: string,
  limit: number = 10,
  page: number = 1,
) => {
  const skip = (page - 1) * limit;

  const [reviews, total] = await Promise.all([
    prisma.review.findMany({
      where: { productId },
      include: {
        buyer: { select: { fullName: true, avatarUrl: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.review.count({ where: { productId } }),
  ]);

  return { data: reviews, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
};

/**
 * 3. Get Buyer My Reviews (History)
 */
export const getBuyerReviews = async (buyerId: string, limit: number = 10, page: number = 1) => {
  const skip = (page - 1) * limit;

  const [reviews, total] = await Promise.all([
    prisma.review.findMany({
      where: { buyerId },
      include: {
        product: { select: { name: true, thumbnailUrl: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.review.count({ where: { buyerId } }),
  ]);

  return { data: reviews, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
};
