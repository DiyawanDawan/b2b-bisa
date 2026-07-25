import prisma from '#config/prisma';
import AppError from '#utils/appError';
import { HarvestLotStatus, Prisma } from '#prisma';
import { createAuditLog } from '#services/admin.service';
import { invalidateProductCatalog } from '#utils/cache.util';
import slugify from '#utils/slugify';
import * as storageService from '#services/storage.service';

type StoreBannerModerationStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

const toNumber = (value: Prisma.Decimal | number | null | undefined) =>
  value == null ? null : Number(value);

/* -------------------------------------------------------------------------- */
/* Harvest lots                                                               */
/* -------------------------------------------------------------------------- */

export const listHarvestLotsAdmin = async (params: {
  page?: number;
  limit?: number;
  search?: string;
  status?: HarvestLotStatus;
  productId?: string;
  archived?: boolean;
}) => {
  const page = params.page ?? 1;
  const limit = params.limit ?? 10;
  const skip = (page - 1) * limit;

  const where: Prisma.ProductHarvestLotWhereInput = {
    ...(params.status ? { status: params.status } : {}),
    ...(params.productId ? { productId: params.productId } : {}),
    ...(params.archived === true
      ? { archivedAt: { not: null } }
      : params.archived === false
        ? { archivedAt: null }
        : {}),
    ...(params.search
      ? {
          OR: [
            { seasonLabel: { contains: params.search } },
            { notes: { contains: params.search } },
            { product: { name: { contains: params.search } } },
            { product: { user: { fullName: { contains: params.search } } } },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.productHarvestLot.findMany({
      where,
      orderBy: [{ expectedHarvestDate: 'desc' }, { createdAt: 'desc' }],
      skip,
      take: limit,
      select: {
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
        archivedAt: true,
        createdAt: true,
        updatedAt: true,
        product: {
          select: {
            id: true,
            name: true,
            unit: true,
            productMode: true,
            user: {
              select: {
                id: true,
                fullName: true,
                profile: { select: { companyName: true } },
              },
            },
          },
        },
      },
    }),
    prisma.productHarvestLot.count({ where }),
  ]);

  return {
    items: rows.map((row) => ({
      ...row,
      expectedQuantityTon: toNumber(row.expectedQuantityTon),
      reservedQuantityTon: toNumber(row.reservedQuantityTon),
      actualQuantityTon: toNumber(row.actualQuantityTon),
    })),
    total,
    page,
    limit,
  };
};

export const getHarvestLotAdmin = async (lotId: string) => {
  const lot = await prisma.productHarvestLot.findUnique({
    where: { id: lotId },
    select: {
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
      archivedAt: true,
      createdAt: true,
      updatedAt: true,
      product: {
        select: {
          id: true,
          name: true,
          unit: true,
          productMode: true,
          province: true,
          regency: true,
          isCertified: true,
          user: {
            select: {
              id: true,
              fullName: true,
              email: true,
              profile: { select: { companyName: true } },
            },
          },
          certificates: {
            orderBy: { createdAt: 'desc' },
            take: 20,
            select: {
              id: true,
              title: true,
              certificateType: true,
              status: true,
              issuerName: true,
              certificateNumber: true,
              issuedAt: true,
              expiresAt: true,
              createdAt: true,
            },
          },
        },
      },
      bookings: {
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          id: true,
          bookingNumber: true,
          status: true,
          quantity: true,
          unit: true,
          createdAt: true,
        },
      },
    },
  });

  if (!lot) throw new AppError('Batch panen tidak ditemukan', 404);

  return {
    ...lot,
    expectedQuantityTon: toNumber(lot.expectedQuantityTon),
    reservedQuantityTon: toNumber(lot.reservedQuantityTon),
    actualQuantityTon: toNumber(lot.actualQuantityTon),
    bookings: lot.bookings.map((b) => ({
      ...b,
      quantity: toNumber(b.quantity),
    })),
  };
};

export const archiveHarvestLotAdmin = async (lotId: string, adminId: string, reason?: string) => {
  const lot = await prisma.productHarvestLot.findUnique({
    where: { id: lotId },
    select: { id: true, status: true, archivedAt: true, productId: true },
  });
  if (!lot) throw new AppError('Batch panen tidak ditemukan', 404);
  if (lot.archivedAt) throw new AppError('Batch panen sudah diarsipkan', 400);

  const updated = await prisma.productHarvestLot.update({
    where: { id: lotId },
    data: {
      archivedAt: new Date(),
      ...(reason ? { notes: reason } : {}),
    },
  });

  await createAuditLog({
    userId: adminId,
    action: 'ARCHIVE_HARVEST_LOT',
    entity: 'PRODUCT_HARVEST_LOT',
    entityId: lotId,
    oldValue: { status: lot.status, archivedAt: null },
    newValue: { archivedAt: updated.archivedAt, reason: reason ?? null },
  });

  return {
    id: updated.id,
    archivedAt: updated.archivedAt,
    status: updated.status,
  };
};

export const restoreHarvestLotAdmin = async (lotId: string, adminId: string) => {
  const lot = await prisma.productHarvestLot.findUnique({
    where: { id: lotId },
    select: { id: true, archivedAt: true, status: true },
  });
  if (!lot) throw new AppError('Batch panen tidak ditemukan', 404);
  if (!lot.archivedAt) throw new AppError('Batch panen tidak dalam arsip', 400);

  const updated = await prisma.productHarvestLot.update({
    where: { id: lotId },
    data: { archivedAt: null },
  });

  await createAuditLog({
    userId: adminId,
    action: 'RESTORE_HARVEST_LOT',
    entity: 'PRODUCT_HARVEST_LOT',
    entityId: lotId,
    oldValue: { archivedAt: lot.archivedAt },
    newValue: { archivedAt: null },
  });

  return { id: updated.id, archivedAt: updated.archivedAt, status: updated.status };
};

/* -------------------------------------------------------------------------- */
/* Product collections                                                        */
/* -------------------------------------------------------------------------- */

const isCollectionVisibleNow = (collection: {
  isActive: boolean;
  publishAt: Date | null;
  unpublishAt: Date | null;
}) => {
  if (!collection.isActive) return false;
  const now = Date.now();
  if (collection.publishAt && collection.publishAt.getTime() > now) return false;
  if (collection.unpublishAt && collection.unpublishAt.getTime() <= now) return false;
  return true;
};

export const listCollectionsAdmin = async (params: {
  page?: number;
  limit?: number;
  search?: string;
  isActive?: boolean;
}) => {
  const page = params.page ?? 1;
  const limit = params.limit ?? 10;
  const skip = (page - 1) * limit;

  const where: Prisma.ProductCollectionWhereInput = {
    ...(params.isActive !== undefined ? { isActive: params.isActive } : {}),
    ...(params.search
      ? {
          OR: [
            { name: { contains: params.search } },
            { slug: { contains: params.search } },
            { description: { contains: params.search } },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.productCollection.findMany({
      where,
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
      skip,
      take: limit,
      include: {
        _count: { select: { products: true } },
      },
    }),
    prisma.productCollection.count({ where }),
  ]);

  return {
    items: rows.map((row) => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      description: row.description,
      thumbnailUrl: row.thumbnailUrl,
      isActive: row.isActive,
      sortOrder: row.sortOrder,
      publishAt: row.publishAt,
      unpublishAt: row.unpublishAt,
      productCount: row._count.products,
      isVisibleNow: isCollectionVisibleNow(row),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    })),
    total,
    page,
    limit,
  };
};

export const getCollectionAdmin = async (collectionId: string) => {
  const collection = await prisma.productCollection.findUnique({
    where: { id: collectionId },
    include: {
      products: {
        orderBy: { order: 'asc' },
        include: {
          product: {
            select: {
              id: true,
              name: true,
              status: true,
              thumbnailUrl: true,
              pricePerUnit: true,
              unit: true,
            },
          },
        },
      },
    },
  });
  if (!collection) throw new AppError('Koleksi tidak ditemukan', 404);

  return {
    id: collection.id,
    name: collection.name,
    slug: collection.slug,
    description: collection.description,
    thumbnailUrl: collection.thumbnailUrl,
    isActive: collection.isActive,
    sortOrder: collection.sortOrder,
    publishAt: collection.publishAt,
    unpublishAt: collection.unpublishAt,
    isVisibleNow: isCollectionVisibleNow(collection),
    createdAt: collection.createdAt,
    updatedAt: collection.updatedAt,
    products: collection.products.map((item) => ({
      id: item.id,
      order: item.order,
      productId: item.productId,
      product: {
        ...item.product,
        pricePerUnit: toNumber(item.product.pricePerUnit),
      },
    })),
  };
};

export const createCollectionAdmin = async (
  data: {
    name: string;
    slug?: string;
    description?: string | null;
    thumbnailUrl?: string | null;
    isActive?: boolean;
    sortOrder?: number;
    publishAt?: Date | null;
    unpublishAt?: Date | null;
  },
  adminId: string,
) => {
  const slug = (data.slug?.trim() || slugify(data.name) || `koleksi-${Date.now()}`).slice(0, 140);

  const existing = await prisma.productCollection.findFirst({
    where: { OR: [{ name: data.name }, { slug }] },
    select: { id: true },
  });
  if (existing) throw new AppError('Nama atau slug koleksi sudah dipakai', 409);

  const created = await prisma.productCollection.create({
    data: {
      name: data.name,
      slug,
      description: data.description ?? null,
      thumbnailUrl: data.thumbnailUrl ?? null,
      isActive: data.isActive ?? true,
      sortOrder: data.sortOrder ?? 0,
      publishAt: data.publishAt ?? null,
      unpublishAt: data.unpublishAt ?? null,
    },
  });

  void invalidateProductCatalog();
  await createAuditLog({
    userId: adminId,
    action: 'CREATE_PRODUCT_COLLECTION',
    entity: 'PRODUCT_COLLECTION',
    entityId: created.id,
    newValue: { name: created.name, slug: created.slug },
  });

  return created;
};

export const updateCollectionAdmin = async (
  collectionId: string,
  data: {
    name?: string;
    slug?: string;
    description?: string | null;
    thumbnailUrl?: string | null;
    isActive?: boolean;
    sortOrder?: number;
    publishAt?: Date | null;
    unpublishAt?: Date | null;
  },
  adminId: string,
) => {
  const existing = await prisma.productCollection.findUnique({
    where: { id: collectionId },
  });
  if (!existing) throw new AppError('Koleksi tidak ditemukan', 404);

  if (data.name || data.slug) {
    const conflict = await prisma.productCollection.findFirst({
      where: {
        id: { not: collectionId },
        OR: [
          ...(data.name ? [{ name: data.name }] : []),
          ...(data.slug ? [{ slug: data.slug }] : []),
        ],
      },
      select: { id: true },
    });
    if (conflict) throw new AppError('Nama atau slug koleksi sudah dipakai', 409);
  }

  const updated = await prisma.productCollection.update({
    where: { id: collectionId },
    data: {
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.slug !== undefined ? { slug: data.slug } : {}),
      ...(data.description !== undefined ? { description: data.description } : {}),
      ...(data.thumbnailUrl !== undefined ? { thumbnailUrl: data.thumbnailUrl } : {}),
      ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
      ...(data.sortOrder !== undefined ? { sortOrder: data.sortOrder } : {}),
      ...(data.publishAt !== undefined ? { publishAt: data.publishAt } : {}),
      ...(data.unpublishAt !== undefined ? { unpublishAt: data.unpublishAt } : {}),
    },
  });

  void invalidateProductCatalog();
  await createAuditLog({
    userId: adminId,
    action: 'UPDATE_PRODUCT_COLLECTION',
    entity: 'PRODUCT_COLLECTION',
    entityId: collectionId,
    oldValue: {
      name: existing.name,
      slug: existing.slug,
      isActive: existing.isActive,
      sortOrder: existing.sortOrder,
    },
    newValue: data as Prisma.InputJsonValue,
  });

  return updated;
};

export const deleteCollectionAdmin = async (
  collectionId: string,
  adminId: string,
  reason?: string,
) => {
  const existing = await prisma.productCollection.findUnique({
    where: { id: collectionId },
    select: { id: true, name: true, slug: true },
  });
  if (!existing) throw new AppError('Koleksi tidak ditemukan', 404);

  await prisma.productCollection.delete({ where: { id: collectionId } });
  void invalidateProductCatalog();
  await createAuditLog({
    userId: adminId,
    action: 'DELETE_PRODUCT_COLLECTION',
    entity: 'PRODUCT_COLLECTION',
    entityId: collectionId,
    oldValue: existing,
    newValue: reason ? { reason } : undefined,
  });

  return { id: collectionId };
};

export const assignCollectionProductsAdmin = async (
  collectionId: string,
  productIds: string[],
  replace: boolean,
  adminId: string,
) => {
  const collection = await prisma.productCollection.findUnique({
    where: { id: collectionId },
    select: { id: true },
  });
  if (!collection) throw new AppError('Koleksi tidak ditemukan', 404);

  const uniqueIds = [...new Set(productIds)];
  const products = await prisma.product.findMany({
    where: { id: { in: uniqueIds }, status: { not: 'DELETED' } },
    select: { id: true },
  });
  if (products.length !== uniqueIds.length) {
    throw new AppError('Satu atau lebih produk tidak ditemukan', 400);
  }

  await prisma.$transaction(async (tx) => {
    if (replace) {
      await tx.productCollectionItem.deleteMany({ where: { collectionId } });
      await tx.productCollectionItem.createMany({
        data: uniqueIds.map((productId, index) => ({
          collectionId,
          productId,
          order: index,
        })),
      });
      return;
    }

    const existing = await tx.productCollectionItem.findMany({
      where: { collectionId },
      select: { productId: true, order: true },
    });
    const existingSet = new Set(existing.map((e) => e.productId));
    const maxOrder = existing.reduce((max, item) => Math.max(max, item.order), -1);
    const toAdd = uniqueIds.filter((id) => !existingSet.has(id));
    if (toAdd.length) {
      await tx.productCollectionItem.createMany({
        data: toAdd.map((productId, index) => ({
          collectionId,
          productId,
          order: maxOrder + 1 + index,
        })),
      });
    }
  });

  void invalidateProductCatalog();
  await createAuditLog({
    userId: adminId,
    action: 'ASSIGN_PRODUCT_COLLECTION_ITEMS',
    entity: 'PRODUCT_COLLECTION',
    entityId: collectionId,
    newValue: { productIds: uniqueIds, replace },
  });

  return getCollectionAdmin(collectionId);
};

export const reorderCollectionProductsAdmin = async (
  collectionId: string,
  items: Array<{ productId: string; order: number }>,
  adminId: string,
) => {
  const collection = await prisma.productCollection.findUnique({
    where: { id: collectionId },
    select: { id: true },
  });
  if (!collection) throw new AppError('Koleksi tidak ditemukan', 404);

  await prisma.$transaction(
    items.map((item) =>
      prisma.productCollectionItem.updateMany({
        where: { collectionId, productId: item.productId },
        data: { order: item.order },
      }),
    ),
  );

  void invalidateProductCatalog();
  await createAuditLog({
    userId: adminId,
    action: 'REORDER_PRODUCT_COLLECTION_ITEMS',
    entity: 'PRODUCT_COLLECTION',
    entityId: collectionId,
    newValue: { items },
  });

  return getCollectionAdmin(collectionId);
};

/* -------------------------------------------------------------------------- */
/* Store banners                                                              */
/* -------------------------------------------------------------------------- */

const formatAdminBanner = (banner: {
  id: string;
  userId: string;
  imageUrl: string;
  title: string | null;
  sortOrder: number;
  isActive: boolean;
  moderationStatus: StoreBannerModerationStatus;
  startsAt: Date | null;
  endsAt: Date | null;
  reviewedById: string | null;
  reviewedAt: Date | null;
  rejectionReason: string | null;
  createdAt: Date;
  updatedAt: Date;
  user?: {
    id: string;
    fullName: string;
    profile?: { companyName: string | null } | null;
  };
  reviewedBy?: { id: string; fullName: string } | null;
}) => ({
  id: banner.id,
  userId: banner.userId,
  imageUrl: storageService.getPublicUrl(banner.imageUrl) ?? banner.imageUrl,
  title: banner.title,
  sortOrder: banner.sortOrder,
  isActive: banner.isActive,
  moderationStatus: banner.moderationStatus,
  startsAt: banner.startsAt,
  endsAt: banner.endsAt,
  reviewedById: banner.reviewedById,
  reviewedAt: banner.reviewedAt,
  rejectionReason: banner.rejectionReason,
  createdAt: banner.createdAt,
  updatedAt: banner.updatedAt,
  store: banner.user
    ? {
        id: banner.user.id,
        fullName: banner.user.fullName,
        companyName: banner.user.profile?.companyName ?? null,
      }
    : undefined,
  reviewedBy: banner.reviewedBy ?? null,
});

export const listStoreBannersAdmin = async (params: {
  page?: number;
  limit?: number;
  search?: string;
  moderationStatus?: StoreBannerModerationStatus;
  isActive?: boolean;
  userId?: string;
}) => {
  const page = params.page ?? 1;
  const limit = params.limit ?? 10;
  const skip = (page - 1) * limit;

  const where: Prisma.StoreBannerWhereInput = {
    ...(params.moderationStatus ? { moderationStatus: params.moderationStatus } : {}),
    ...(params.isActive !== undefined ? { isActive: params.isActive } : {}),
    ...(params.userId ? { userId: params.userId } : {}),
    ...(params.search
      ? {
          OR: [
            { title: { contains: params.search } },
            { user: { fullName: { contains: params.search } } },
            { user: { profile: { companyName: { contains: params.search } } } },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.storeBanner.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }],
      skip,
      take: limit,
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            profile: { select: { companyName: true } },
          },
        },
        reviewedBy: { select: { id: true, fullName: true } },
      },
    }),
    prisma.storeBanner.count({ where }),
  ]);

  return {
    items: rows.map(formatAdminBanner),
    total,
    page,
    limit,
  };
};

export const getStoreBannerAdmin = async (bannerId: string) => {
  const banner = await prisma.storeBanner.findUnique({
    where: { id: bannerId },
    include: {
      user: {
        select: {
          id: true,
          fullName: true,
          email: true,
          profile: { select: { companyName: true } },
        },
      },
      reviewedBy: { select: { id: true, fullName: true } },
      history: {
        orderBy: { createdAt: 'desc' },
        take: 30,
        include: {
          actor: { select: { id: true, fullName: true } },
        },
      },
    },
  });
  if (!banner) throw new AppError('Banner toko tidak ditemukan', 404);

  return {
    ...formatAdminBanner(banner),
    store: {
      id: banner.user.id,
      fullName: banner.user.fullName,
      email: banner.user.email,
      companyName: banner.user.profile?.companyName ?? null,
    },
    history: banner.history.map((h) => ({
      id: h.id,
      action: h.action,
      fromStatus: h.fromStatus,
      toStatus: h.toStatus,
      note: h.note,
      createdAt: h.createdAt,
      actor: h.actor,
    })),
  };
};

export const moderateStoreBannerAdmin = async (
  bannerId: string,
  adminId: string,
  payload: {
    action: 'APPROVE' | 'REJECT';
    reason?: string;
    startsAt?: Date | null;
    endsAt?: Date | null;
  },
) => {
  const banner = await prisma.storeBanner.findUnique({
    where: { id: bannerId },
  });
  if (!banner) throw new AppError('Banner toko tidak ditemukan', 404);

  const toStatus: StoreBannerModerationStatus =
    payload.action === 'APPROVE' ? 'APPROVED' : 'REJECTED';

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.storeBanner.update({
      where: { id: bannerId },
      data: {
        moderationStatus: toStatus,
        reviewedById: adminId,
        reviewedAt: new Date(),
        rejectionReason: payload.action === 'REJECT' ? (payload.reason ?? null) : null,
        ...(payload.startsAt !== undefined ? { startsAt: payload.startsAt } : {}),
        ...(payload.endsAt !== undefined ? { endsAt: payload.endsAt } : {}),
        ...(payload.action === 'APPROVE' ? { isActive: true } : { isActive: false }),
      },
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            profile: { select: { companyName: true } },
          },
        },
        reviewedBy: { select: { id: true, fullName: true } },
      },
    });

    await tx.storeBannerModerationHistory.create({
      data: {
        bannerId,
        action: payload.action,
        fromStatus: banner.moderationStatus as StoreBannerModerationStatus,
        toStatus,
        note: payload.reason ?? null,
        actorId: adminId,
      },
    });

    return row;
  });

  await createAuditLog({
    userId: adminId,
    action: payload.action === 'APPROVE' ? 'APPROVE_STORE_BANNER' : 'REJECT_STORE_BANNER',
    entity: 'STORE_BANNER',
    entityId: bannerId,
    oldValue: { moderationStatus: banner.moderationStatus },
    newValue: {
      moderationStatus: toStatus,
      reason: payload.reason ?? null,
      startsAt: payload.startsAt ?? null,
      endsAt: payload.endsAt ?? null,
    },
  });

  return formatAdminBanner(updated);
};

export const updateStoreBannerScheduleAdmin = async (
  bannerId: string,
  adminId: string,
  data: {
    startsAt?: Date | null;
    endsAt?: Date | null;
    isActive?: boolean;
    title?: string | null;
    sortOrder?: number;
  },
) => {
  const banner = await prisma.storeBanner.findUnique({ where: { id: bannerId } });
  if (!banner) throw new AppError('Banner toko tidak ditemukan', 404);

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.storeBanner.update({
      where: { id: bannerId },
      data,
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            profile: { select: { companyName: true } },
          },
        },
        reviewedBy: { select: { id: true, fullName: true } },
      },
    });

    await tx.storeBannerModerationHistory.create({
      data: {
        bannerId,
        action: 'UPDATE_SCHEDULE',
        fromStatus: banner.moderationStatus,
        toStatus: banner.moderationStatus,
        note: JSON.stringify(data),
        actorId: adminId,
      },
    });

    return row;
  });

  await createAuditLog({
    userId: adminId,
    action: 'UPDATE_STORE_BANNER_SCHEDULE',
    entity: 'STORE_BANNER',
    entityId: bannerId,
    newValue: data as Prisma.InputJsonValue,
  });

  return formatAdminBanner(updated);
};

export const listStoreBannerHistoryAdmin = async (
  bannerId: string,
  params: { page?: number; limit?: number } = {},
) => {
  const page = params.page ?? 1;
  const limit = params.limit ?? 20;
  const skip = (page - 1) * limit;

  const exists = await prisma.storeBanner.findUnique({
    where: { id: bannerId },
    select: { id: true },
  });
  if (!exists) throw new AppError('Banner toko tidak ditemukan', 404);

  const where = { bannerId };
  const [items, total] = await Promise.all([
    prisma.storeBannerModerationHistory.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      include: { actor: { select: { id: true, fullName: true } } },
    }),
    prisma.storeBannerModerationHistory.count({ where }),
  ]);

  return { items, total, page, limit };
};

/* -------------------------------------------------------------------------- */
/* Product Q&A                                                                */
/* -------------------------------------------------------------------------- */

export const listProductQuestionsAdmin = async (params: {
  page?: number;
  limit?: number;
  search?: string;
  productId?: string;
  answered?: boolean;
  isHidden?: boolean;
  isFlagged?: boolean;
}) => {
  const page = params.page ?? 1;
  const limit = params.limit ?? 10;
  const skip = (page - 1) * limit;

  const where: Prisma.ProductQuestionWhereInput = {
    ...(params.productId ? { productId: params.productId } : {}),
    ...(params.answered === true
      ? { answer: { not: null } }
      : params.answered === false
        ? { answer: null }
        : {}),
    ...(params.isHidden !== undefined ? { isHidden: params.isHidden } : {}),
    ...(params.isFlagged !== undefined ? { isFlagged: params.isFlagged } : {}),
    ...(params.search
      ? {
          OR: [
            { question: { contains: params.search } },
            { answer: { contains: params.search } },
            { product: { name: { contains: params.search } } },
            { asker: { fullName: { contains: params.search } } },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.productQuestion.findMany({
      where,
      orderBy: [{ isFlagged: 'desc' }, { createdAt: 'desc' }],
      skip,
      take: limit,
      select: {
        id: true,
        productId: true,
        question: true,
        answer: true,
        answeredAt: true,
        isHidden: true,
        isFlagged: true,
        moderationNote: true,
        moderatedAt: true,
        createdAt: true,
        updatedAt: true,
        asker: { select: { id: true, fullName: true, avatarUrl: true } },
        answeredBy: { select: { id: true, fullName: true } },
        moderatedBy: { select: { id: true, fullName: true } },
        product: {
          select: {
            id: true,
            name: true,
            thumbnailUrl: true,
            user: {
              select: {
                id: true,
                fullName: true,
                profile: { select: { companyName: true } },
              },
            },
          },
        },
      },
    }),
    prisma.productQuestion.count({ where }),
  ]);

  return { items: rows, total, page, limit };
};

export const getProductQuestionAdmin = async (questionId: string) => {
  const row = await prisma.productQuestion.findUnique({
    where: { id: questionId },
    select: {
      id: true,
      productId: true,
      question: true,
      answer: true,
      answeredAt: true,
      isHidden: true,
      isFlagged: true,
      moderationNote: true,
      moderatedAt: true,
      createdAt: true,
      updatedAt: true,
      asker: { select: { id: true, fullName: true, email: true, avatarUrl: true } },
      answeredBy: { select: { id: true, fullName: true } },
      moderatedBy: { select: { id: true, fullName: true } },
      product: {
        select: {
          id: true,
          name: true,
          status: true,
          thumbnailUrl: true,
          user: {
            select: {
              id: true,
              fullName: true,
              email: true,
              profile: { select: { companyName: true } },
            },
          },
        },
      },
    },
  });
  if (!row) throw new AppError('Pertanyaan tidak ditemukan', 404);
  return row;
};

export const moderateProductQuestionAdmin = async (
  questionId: string,
  adminId: string,
  payload: { action: 'HIDE' | 'RESTORE' | 'FLAG' | 'UNFLAG'; note?: string },
) => {
  const row = await prisma.productQuestion.findUnique({
    where: { id: questionId },
    select: { id: true, isHidden: true, isFlagged: true },
  });
  if (!row) throw new AppError('Pertanyaan tidak ditemukan', 404);

  const data: Prisma.ProductQuestionUpdateInput = {
    moderatedAt: new Date(),
    moderatedBy: { connect: { id: adminId } },
    ...(payload.note !== undefined ? { moderationNote: payload.note } : {}),
  };

  switch (payload.action) {
    case 'HIDE':
      data.isHidden = true;
      break;
    case 'RESTORE':
      data.isHidden = false;
      break;
    case 'FLAG':
      data.isFlagged = true;
      break;
    case 'UNFLAG':
      data.isFlagged = false;
      break;
    default:
      break;
  }

  const updated = await prisma.productQuestion.update({
    where: { id: questionId },
    data,
    select: {
      id: true,
      isHidden: true,
      isFlagged: true,
      moderationNote: true,
      moderatedAt: true,
    },
  });

  await createAuditLog({
    userId: adminId,
    action: `PRODUCT_QUESTION_${payload.action}`,
    entity: 'PRODUCT_QUESTION',
    entityId: questionId,
    oldValue: { isHidden: row.isHidden, isFlagged: row.isFlagged },
    newValue: {
      isHidden: updated.isHidden,
      isFlagged: updated.isFlagged,
      note: payload.note ?? null,
    },
  });

  return updated;
};

export const answerProductQuestionAdmin = async (
  questionId: string,
  adminId: string,
  answer: string,
) => {
  const row = await prisma.productQuestion.findUnique({
    where: { id: questionId },
    select: { id: true, answer: true },
  });
  if (!row) throw new AppError('Pertanyaan tidak ditemukan', 404);
  if (row.answer) throw new AppError('Pertanyaan ini sudah dijawab', 409);

  const updated = await prisma.productQuestion.update({
    where: { id: questionId },
    data: {
      answer: answer.trim(),
      answeredAt: new Date(),
      answeredById: adminId,
    },
    select: {
      id: true,
      answer: true,
      answeredAt: true,
      answeredBy: { select: { id: true, fullName: true } },
    },
  });

  await createAuditLog({
    userId: adminId,
    action: 'ANSWER_PRODUCT_QUESTION',
    entity: 'PRODUCT_QUESTION',
    entityId: questionId,
    newValue: { answer: updated.answer },
  });

  return updated;
};
