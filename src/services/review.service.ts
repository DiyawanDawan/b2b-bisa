import prisma from '#config/prisma';
import AppError from '#utils/appError';

/**
 * 1. Submit a Review (Buyer Only)
 */
export const createReview = async (
  buyerId: string,
  data: { orderId: string; rating: number; comment: string },
) => {
  // Validate rating range (CRIT-006)
  if (!Number.isInteger(data.rating) || data.rating < 1 || data.rating > 5) {
    throw new AppError('Rating harus bilangan bulat antara 1 sampai 5.', 400);
  }

  const order = await prisma.order.findUnique({
    where: { id: data.orderId },
    select: {
      id: true,
      buyerId: true,
      status: true,
      review: { select: { id: true } },
      items: {
        select: {
          productId: true,
        },
        take: 1,
      },
    },
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
  const firstItem = order.items[0];
  if (!firstItem) {
    throw new AppError('Pesanan tidak memiliki item produk untuk direview.', 400);
  }
  const productId = firstItem.productId;

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

    // 2. Recalculate & sync cache fields on Product (averageRating, totalReviews)
    //    Using aggregate inside the same tx ensures consistency.
    const agg = await tx.review.aggregate({
      where: { productId },
      _avg: { rating: true },
      _count: { id: true },
    });

    const newAverage = agg._avg.rating ?? 0;
    const newTotal = agg._count.id;

    await tx.product.update({
      where: { id: productId },
      data: {
        averageRating: Math.round(newAverage * 10) / 10,
        totalReviews: newTotal,
      },
    });

    return newReview;
  });
};

/**
 * 1b. Update a Review (Buyer Only)
 */
export const updateReview = async (
  buyerId: string,
  reviewId: string,
  data: { rating: number; comment: string },
) => {
  if (!Number.isInteger(data.rating) || data.rating < 1 || data.rating > 5) {
    throw new AppError('Rating harus bilangan bulat antara 1 sampai 5.', 400);
  }

  const review = await prisma.review.findUnique({
    where: { id: reviewId },
    select: { id: true, buyerId: true, productId: true },
  });

  if (!review) throw new AppError('Ulasan tidak ditemukan.', 404);
  if (review.buyerId !== buyerId) throw new AppError('Anda tidak memiliki akses.', 403);

  return prisma.$transaction(async (tx) => {
    const updated = await tx.review.update({
      where: { id: reviewId },
      data: {
        rating: data.rating,
        comment: data.comment,
      },
    });

    // Recalculate Product Rating
    const agg = await tx.review.aggregate({
      where: { productId: review.productId },
      _avg: { rating: true },
      _count: { id: true },
    });

    await tx.product.update({
      where: { id: review.productId },
      data: {
        averageRating: Math.round((agg._avg.rating ?? 0) * 10) / 10,
        totalReviews: agg._count.id,
      },
    });

    return updated;
  });
};

/**
 * 1c. Supplier reply to a review
 */
export const replyToReview = async (supplierId: string, reviewId: string, reply: string) => {
  const review = await prisma.review.findUnique({
    where: { id: reviewId },
    select: {
      id: true,
      product: { select: { userId: true } },
    },
  });

  if (!review) throw new AppError('Ulasan tidak ditemukan.', 404);
  if (review.product.userId !== supplierId) {
    throw new AppError('Anda bukan pemilik produk untuk ulasan ini.', 403);
  }

  return prisma.review.update({
    where: { id: reviewId },
    data: { supplierReply: reply },
  });
};

const formatReviewForApi = (review: {
  id: string;
  orderId?: string;
  productId: string;
  buyerId: string;
  rating: number;
  comment: string | null;
  supplierReply?: string | null;
  imageUrl?: string | null;
  createdAt: Date;
  buyer?: { fullName: string; avatarUrl?: string | null } | null;
  product?: { name: string; thumbnailUrl?: string | null } | null;
}) => ({
  ...review,
  userId: review.buyerId,
  userName: review.buyer?.fullName ?? 'Pengguna',
  userAvatar: review.buyer?.avatarUrl ?? null,
  reply: review.supplierReply ?? null,
});

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
      select: {
        id: true,
        orderId: true,
        productId: true,
        buyerId: true,
        rating: true,
        comment: true,
        supplierReply: true,
        createdAt: true,
        buyer: { select: { fullName: true, avatarUrl: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.review.count({ where: { productId } }),
  ]);

  return {
    data: reviews.map(formatReviewForApi),
    meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
  };
};

/**
 * 3. Get Buyer My Reviews (History)
 */
export const getBuyerReviews = async (buyerId: string, limit: number = 10, page: number = 1) => {
  const skip = (page - 1) * limit;

  const [reviews, total] = await Promise.all([
    prisma.review.findMany({
      where: { buyerId },
      select: {
        id: true,
        orderId: true,
        productId: true,
        buyerId: true,
        rating: true,
        comment: true,
        createdAt: true,
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

/**
 * 4. Get Review Summary for a Product (Public)
 * Returns average rating, total count, and rating distribution
 */
export const getReviewSummary = async (productId: string) => {
  const reviews = await prisma.review.groupBy({
    by: ['rating'],
    where: { productId },
    _count: { id: true },
  });

  const distribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let totalRating = 0;
  let totalCount = 0;

  reviews.forEach((group) => {
    const rating = group.rating as number;
    distribution[rating] = group._count.id;
    totalRating += rating * group._count.id;
    totalCount += group._count.id;
  });

  const average = totalCount > 0 ? totalRating / totalCount : 0;

  return {
    productId,
    averageRating: Math.round(average * 10) / 10, // 1 decimal place
    totalReviews: totalCount,
    ratingDistribution: distribution,
  };
};
