import prisma from '#config/prisma';
import AppError from '#utils/appError';
import { Prisma } from '#prisma';
import { resolveMediaField } from '#utils/mediaResolver.util';

type ForumGroupRole = 'OWNER' | 'ADMIN' | 'MEMBER';
const FORUM_GROUP_ROLE = {
  OWNER: 'OWNER' as ForumGroupRole,
  ADMIN: 'ADMIN' as ForumGroupRole,
  MEMBER: 'MEMBER' as ForumGroupRole,
};

const slugBase = (name: string) =>
  name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'grup';

const uniqueSlug = async (name: string) => {
  const base = slugBase(name);
  let slug = base;
  let n = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const exists = await prisma.forumGroup.findUnique({ where: { slug } });
    if (!exists) return slug;
    n += 1;
    slug = `${base}-${n}`;
  }
};

const groupOwnerSelect = {
  id: true,
  fullName: true,
  avatarUrl: true,
} as const;

const mapGroup = (
  group: {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    avatarUrl: string | null;
    bannerUrl: string | null;
    isPublic: boolean;
    memberCount: number;
    createdAt: Date;
    owner: { id: string; fullName: string; avatarUrl: string | null };
    _count?: { posts: number };
  },
  membership?: { role: ForumGroupRole } | null,
) => ({
  id: group.id,
  name: group.name,
  slug: group.slug,
  description: group.description,
  avatarUrl: resolveMediaField(group.avatarUrl),
  bannerUrl: resolveMediaField(group.bannerUrl),
  isPublic: group.isPublic,
  memberCount: group.memberCount,
  postCount: group._count?.posts ?? 0,
  createdAt: group.createdAt,
  owner: {
    ...group.owner,
    avatarUrl: resolveMediaField(group.owner.avatarUrl),
  },
  isMember: Boolean(membership),
  myRole: membership?.role ?? null,
});

export const assertGroupMember = async (groupId: string, userId: string) => {
  const member = await prisma.forumGroupMember.findUnique({
    where: { groupId_userId: { groupId, userId } },
  });
  if (!member) {
    throw new AppError('Anda harus bergabung ke grup ini untuk melanjutkan.', 403);
  }
  return member;
};

export const listGroups = async (params: {
  keyword?: string;
  page?: number;
  limit?: number;
  userId?: string;
  mine?: boolean;
}) => {
  const { keyword, page = 1, limit = 20, userId, mine = false } = params;
  const skip = (page - 1) * limit;

  const where: Prisma.ForumGroupWhereInput = mine
    ? {
        members: { some: { userId: userId! } },
        ...(keyword?.trim() && {
          OR: [
            { name: { contains: keyword.trim() } },
            { description: { contains: keyword.trim() } },
          ],
        }),
      }
    : {
        isPublic: true,
        ...(keyword?.trim() && {
          OR: [
            { name: { contains: keyword.trim() } },
            { description: { contains: keyword.trim() } },
          ],
        }),
      };

  const [groups, total] = await prisma.$transaction([
    prisma.forumGroup.findMany({
      where,
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        avatarUrl: true,
        bannerUrl: true,
        isPublic: true,
        memberCount: true,
        createdAt: true,
        owner: { select: groupOwnerSelect },
        _count: { select: { posts: true } },
        ...(userId && {
          members: {
            where: { userId },
            select: { role: true },
            take: 1,
          },
        }),
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.forumGroup.count({ where }),
  ]);

  return {
    groups: groups.map((g) => {
      const membership = userId && g.members?.[0] ? g.members[0] : null;
      const { members: _members, ...rest } = g as typeof g & {
        members?: { role: ForumGroupRole }[];
      };
      return mapGroup(rest, membership);
    }),
    total,
    totalPages: Math.ceil(total / limit),
  };
};

export const getGroupById = async (id: string, userId?: string) => {
  const group = await prisma.forumGroup.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      avatarUrl: true,
      bannerUrl: true,
      isPublic: true,
      memberCount: true,
      createdAt: true,
      owner: { select: groupOwnerSelect },
      _count: { select: { posts: true } },
      ...(userId && {
        members: {
          where: { userId },
          select: { role: true },
          take: 1,
        },
      }),
    },
  });

  if (!group) throw new AppError('Grup tidak ditemukan.', 404);
  if (!group.isPublic && !userId) {
    throw new AppError('Grup ini privat. Silakan login untuk melihat.', 403);
  }

  const membership = userId && group.members?.[0] ? group.members[0] : null;
  if (!group.isPublic && !membership) {
    throw new AppError('Grup ini privat.', 403);
  }

  const { members: _members, ...rest } = group as typeof group & {
    members?: { role: ForumGroupRole }[];
  };
  return mapGroup(rest, membership);
};

export const createGroup = async (
  userId: string,
  data: {
    name: string;
    description?: string;
    avatarUrl?: string;
    bannerUrl?: string;
    isPublic?: boolean;
  },
) => {
  const slug = await uniqueSlug(data.name);

  const group = await prisma.$transaction(async (tx) => {
    const created = await tx.forumGroup.create({
      data: {
        name: data.name.trim(),
        slug,
        description: data.description?.trim() || null,
        avatarUrl: data.avatarUrl ?? null,
        bannerUrl: data.bannerUrl ?? null,
        ownerId: userId,
        isPublic: data.isPublic ?? true,
        memberCount: 1,
      },
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        avatarUrl: true,
        bannerUrl: true,
        isPublic: true,
        memberCount: true,
        createdAt: true,
        owner: { select: groupOwnerSelect },
        _count: { select: { posts: true } },
      },
    });

    await tx.forumGroupMember.create({
      data: {
        groupId: created.id,
        userId,
        role: FORUM_GROUP_ROLE.OWNER,
      },
    });

    return created;
  });

  return mapGroup(group, { role: FORUM_GROUP_ROLE.OWNER });
};

export const updateGroup = async (
  groupId: string,
  userId: string,
  data: {
    name?: string;
    description?: string | null;
    avatarUrl?: string | null;
    bannerUrl?: string | null;
    isPublic?: boolean;
  },
) => {
  const member = await prisma.forumGroupMember.findUnique({
    where: { groupId_userId: { groupId, userId } },
  });
  if (
    !member ||
    (member.role !== FORUM_GROUP_ROLE.OWNER && member.role !== FORUM_GROUP_ROLE.ADMIN)
  ) {
    throw new AppError('Anda tidak memiliki izin mengubah grup ini.', 403);
  }

  const updated = await prisma.forumGroup.update({
    where: { id: groupId },
    data: {
      ...(data.name !== undefined && { name: data.name.trim() }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.avatarUrl !== undefined && { avatarUrl: data.avatarUrl }),
      ...(data.bannerUrl !== undefined && { bannerUrl: data.bannerUrl }),
      ...(data.isPublic !== undefined && { isPublic: data.isPublic }),
    },
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      avatarUrl: true,
      bannerUrl: true,
      isPublic: true,
      memberCount: true,
      createdAt: true,
      owner: { select: groupOwnerSelect },
      _count: { select: { posts: true } },
    },
  });

  return mapGroup(updated, member);
};

export const joinGroup = async (groupId: string, userId: string) => {
  const group = await prisma.forumGroup.findUnique({ where: { id: groupId } });
  if (!group) throw new AppError('Grup tidak ditemukan.', 404);
  if (!group.isPublic) throw new AppError('Grup ini privat.', 403);

  const existing = await prisma.forumGroupMember.findUnique({
    where: { groupId_userId: { groupId, userId } },
  });
  if (existing) return getGroupById(groupId, userId);

  await prisma.$transaction([
    prisma.forumGroupMember.create({
      data: { groupId, userId, role: FORUM_GROUP_ROLE.MEMBER },
    }),
    prisma.forumGroup.update({
      where: { id: groupId },
      data: { memberCount: { increment: 1 } },
    }),
  ]);

  return getGroupById(groupId, userId);
};

export const leaveGroup = async (groupId: string, userId: string) => {
  const member = await prisma.forumGroupMember.findUnique({
    where: { groupId_userId: { groupId, userId } },
  });
  if (!member) throw new AppError('Anda belum bergabung ke grup ini.', 400);
  if (member.role === FORUM_GROUP_ROLE.OWNER) {
    throw new AppError('Pemilik grup tidak bisa keluar. Hapus grup atau transfer kepemilikan dulu.', 400);
  }

  await prisma.$transaction([
    prisma.forumGroupMember.delete({
      where: { groupId_userId: { groupId, userId } },
    }),
    prisma.forumGroup.update({
      where: { id: groupId },
      data: { memberCount: { decrement: 1 } },
    }),
  ]);

  return { left: true };
};
