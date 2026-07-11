import prisma from '#config/prisma';
import AppError from '#utils/appError';
import { LiveSessionStatus, ProductStatus } from '#prisma';
import * as storageService from '#services/storage.service';

const parsePinnedIds = (raw: unknown): string[] => {
  if (!Array.isArray(raw)) return [];
  return raw.filter((id): id is string => typeof id === 'string' && id.length > 0);
};

export const listPublicLiveSessions = async (
  params: { status?: LiveSessionStatus; page?: number; limit?: number } = {},
) => {
  const { status, page = 1, limit = 20 } = params;
  const where = status
    ? { status }
    : { status: { in: [LiveSessionStatus.LIVE, LiveSessionStatus.SCHEDULED] } };

  const [total, sessions] = await Promise.all([
    prisma.liveSession.count({ where }),
    prisma.liveSession.findMany({
      where,
      orderBy: [{ status: 'asc' }, { scheduledAt: 'asc' }, { createdAt: 'desc' }],
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        streamUrl: true,
        thumbnailUrl: true,
        pinnedProductIds: true,
        viewerCount: true,
        scheduledAt: true,
        startedAt: true,
        supplier: {
          select: {
            id: true,
            fullName: true,
            profile: { select: { companyName: true } },
          },
        },
      },
    }),
  ]);

  return {
    total,
    page,
    limit,
    sessions: sessions.map((s) => ({
      ...s,
      thumbnailUrl: storageService.getPublicUrl(s.thumbnailUrl) ?? s.thumbnailUrl,
      pinnedProductIds: parsePinnedIds(s.pinnedProductIds),
    })),
  };
};

export const getLiveSessionById = async (id: string) => {
  const session = await prisma.liveSession.findUnique({
    where: { id },
    include: {
      supplier: {
        select: {
          id: true,
          fullName: true,
          avatarUrl: true,
          profile: { select: { companyName: true } },
        },
      },
      comments: {
        orderBy: { createdAt: 'desc' },
        take: 50,
        include: {
          user: { select: { id: true, fullName: true, avatarUrl: true } },
        },
      },
    },
  });
  if (!session) throw new AppError('Sesi live tidak ditemukan.', 404);

  const pinnedIds = parsePinnedIds(session.pinnedProductIds);
  const products =
    pinnedIds.length > 0
      ? await prisma.product.findMany({
          where: { id: { in: pinnedIds }, status: ProductStatus.ACTIVE },
          select: {
            id: true,
            name: true,
            pricePerUnit: true,
            unit: true,
            thumbnailUrl: true,
          },
        })
      : [];

  return {
    ...session,
    thumbnailUrl: storageService.getPublicUrl(session.thumbnailUrl) ?? session.thumbnailUrl,
    pinnedProductIds: pinnedIds,
    pinnedProducts: products.map((p) => ({
      ...p,
      thumbnailUrl: storageService.getPublicUrl(p.thumbnailUrl) ?? p.thumbnailUrl,
    })),
  };
};

export const createLiveSession = async (
  supplierId: string,
  data: {
    title: string;
    description?: string;
    streamUrl?: string;
    scheduledAt?: string;
    pinnedProductIds?: string[];
  },
) => {
  if (!data.title?.trim()) throw new AppError('Judul sesi live wajib diisi.', 400);

  return prisma.liveSession.create({
    data: {
      supplierId,
      title: data.title.trim(),
      description: data.description?.trim(),
      streamUrl: data.streamUrl?.trim(),
      scheduledAt: data.scheduledAt ? new Date(data.scheduledAt) : undefined,
      pinnedProductIds: data.pinnedProductIds ?? [],
      status: LiveSessionStatus.SCHEDULED,
    },
  });
};

export const startLiveSession = async (supplierId: string, sessionId: string) => {
  const session = await prisma.liveSession.findFirst({
    where: { id: sessionId, supplierId },
  });
  if (!session) throw new AppError('Sesi live tidak ditemukan.', 404);
  if (session.status === LiveSessionStatus.ENDED) {
    throw new AppError('Sesi live sudah berakhir.', 400);
  }

  return prisma.liveSession.update({
    where: { id: sessionId },
    data: {
      status: LiveSessionStatus.LIVE,
      startedAt: new Date(),
    },
  });
};

export const endLiveSession = async (supplierId: string, sessionId: string) => {
  const session = await prisma.liveSession.findFirst({
    where: { id: sessionId, supplierId },
  });
  if (!session) throw new AppError('Sesi live tidak ditemukan.', 404);

  return prisma.liveSession.update({
    where: { id: sessionId },
    data: {
      status: LiveSessionStatus.ENDED,
      endedAt: new Date(),
    },
  });
};

export const addLiveComment = async (sessionId: string, userId: string, message: string) => {
  const trimmed = message?.trim();
  if (!trimmed || trimmed.length > 500) {
    throw new AppError('Komentar wajib diisi (maks. 500 karakter).', 400);
  }

  const session = await prisma.liveSession.findUnique({
    where: { id: sessionId },
    select: { status: true },
  });
  if (!session || session.status !== LiveSessionStatus.LIVE) {
    throw new AppError('Komentar hanya saat sesi LIVE.', 400);
  }

  return prisma.liveSessionComment.create({
    data: { sessionId, userId, message: trimmed },
    include: {
      user: { select: { id: true, fullName: true, avatarUrl: true } },
    },
  });
};

export const recordLiveViewer = async (sessionId: string) => {
  await prisma.liveSession.updateMany({
    where: { id: sessionId, status: LiveSessionStatus.LIVE },
    data: { viewerCount: { increment: 1 } },
  });
};

export const listMyLiveSessions = async (supplierId: string) =>
  prisma.liveSession.findMany({
    where: { supplierId },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
