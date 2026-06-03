import prisma from '#config/prisma';
import AppError from '#utils/appError';
import * as storageService from '#services/storage.service';

const userSelect = {
  id: true,
  fullName: true,
  avatarUrl: true,
  role: true,
  province: true,
  regency: true,
  verification: { select: { isVerified: true } },
};

const mapUser = (user: {
  id: string;
  fullName: string;
  avatarUrl: string | null;
  role: string;
  province: string | null;
  regency: string | null;
  verification?: { isVerified: boolean } | null;
}) => ({
  id: user.id,
  fullName: user.fullName,
  avatarUrl: user.avatarUrl ? storageService.getPublicUrl(user.avatarUrl) : null,
  role: user.role,
  province: user.province,
  regency: user.regency,
  isVerified: user.verification?.isVerified ?? false,
});

export const toggleFollow = async (followerId: string, followingId: string) => {
  if (followerId === followingId) {
    throw new AppError('Tidak bisa mengikuti akun sendiri.', 400);
  }

  const target = await prisma.user.findUnique({
    where: { id: followingId },
    select: { id: true },
  });
  if (!target) throw new AppError('User tidak ditemukan.', 404);

  const existing = await prisma.userFollow.findUnique({
    where: { followerId_followingId: { followerId, followingId } },
  });

  if (existing) {
    await prisma.userFollow.delete({ where: { id: existing.id } });
    return { following: false, userId: followingId };
  }

  await prisma.userFollow.create({ data: { followerId, followingId } });
  return { following: true, userId: followingId };
};

export const isFollowing = async (followerId: string, followingId: string) => {
  const existing = await prisma.userFollow.findUnique({
    where: { followerId_followingId: { followerId, followingId } },
  });
  return { isFollowing: !!existing, userId: followingId };
};

export const getFollowingIds = async (followerId: string) => {
  const rows = await prisma.userFollow.findMany({
    where: { followerId },
    select: { followingId: true },
  });
  return { userIds: rows.map((r) => r.followingId) };
};

export const getFollowStats = async (userId: string) => {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!user) throw new AppError('User tidak ditemukan.', 404);

  const [followingCount, followersCount] = await Promise.all([
    prisma.userFollow.count({ where: { followerId: userId } }),
    prisma.userFollow.count({ where: { followingId: userId } }),
  ]);

  return { userId, followingCount, followersCount };
};

export const listFollowing = async (userId: string, page = 1, limit = 30) => {
  const skip = (page - 1) * limit;
  const [rows, total] = await Promise.all([
    prisma.userFollow.findMany({
      where: { followerId: userId },
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: { following: { select: userSelect } },
    }),
    prisma.userFollow.count({ where: { followerId: userId } }),
  ]);

  return {
    users: rows.map((r) => mapUser(r.following)),
    total,
    page,
    limit,
  };
};

export const listFollowers = async (userId: string, page = 1, limit = 30) => {
  const skip = (page - 1) * limit;
  const [rows, total] = await Promise.all([
    prisma.userFollow.findMany({
      where: { followingId: userId },
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: { follower: { select: userSelect } },
    }),
    prisma.userFollow.count({ where: { followingId: userId } }),
  ]);

  return {
    users: rows.map((r) => mapUser(r.follower)),
    total,
    page,
    limit,
  };
};
