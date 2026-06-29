import prisma from '#config/prisma';
import AppError from '#utils/appError';
import { PostStatus, VoteType, Prisma } from '#prisma';
import { FORUM_MODERATION_THRESHOLD } from '#utils/env.util';
import { buildForumMetadata, type ForumProductMention } from '#utils/forumContent.util';

export type ForumMediaInput = { url: string; type: 'image' | 'video' };

const toMediaJson = (media?: ForumMediaInput[]): Prisma.InputJsonValue | undefined =>
  media && media.length > 0 ? media : undefined;

const toJsonValue = (arr?: unknown[] | null): Prisma.InputJsonValue | typeof Prisma.JsonNull =>
  arr && arr.length > 0 ? (arr as Prisma.InputJsonValue) : Prisma.JsonNull;

export const listPosts = async (params: {
  categoryId?: string;
  groupId?: string;
  keyword?: string;
  tag?: string;
  page?: number;
  limit?: number;
  userId?: string;
  sortBy?: 'newest' | 'popular' | 'trending';
}) => {
  const {
    categoryId,
    groupId,
    keyword,
    tag,
    page = 1,
    limit = 10,
    userId,
    sortBy = 'trending',
  } = params;
  const skip = (page - 1) * limit;

  // MySQL JSON tidak mendukung query path generik via Prisma typed API
  // untuk semua versi — pakai $queryRaw kalau perlu strict. Untuk
  // simpilitas pakai `string_contains` (MySQL JSON_CONTAINS-like) yang
  // bekerja stabil di Prisma 5+.
  const normalizedTag = tag?.trim().toLowerCase().replace(/^#/, '');

  const where: Prisma.ForumPostWhereInput = {
    ...(categoryId && { categoryId }),
    ...(groupId
      ? { groupId }
      : { groupId: null }),
    ...(keyword && {
      OR: [{ title: { contains: keyword } }, { content: { contains: keyword } }],
    }),
    ...(normalizedTag && {
      // Cari posts dengan tag yang persis match (case-insensitive sudah karena
      // semua tag disimpan lowercase saat parse).
      tags: { array_contains: [normalizedTag] } as unknown as Prisma.JsonNullableFilter,
    }),
    status: PostStatus.PUBLISHED,
  };

  let orderBy: any = { createdAt: 'desc' };
  if (sortBy === 'popular') {
    orderBy = { upvotes: 'desc' };
  } else if (sortBy === 'trending') {
    orderBy = [{ upvotes: 'desc' }, { createdAt: 'desc' }];
  }

  const [rawPosts, total] = await prisma.$transaction([
    prisma.forumPost.findMany({
      where,
      select: {
        id: true,
        userId: true,
        title: true,
        content: true,
        mediaUrls: true,
        tags: true,
        productMentions: true,
        categoryId: true,
        groupId: true,
        upvotes: true,
        downvotes: true,
        viewCount: true,
        createdAt: true,
        updatedAt: true,
        user: {
          select: {
            id: true,
            fullName: true,
            avatarUrl: true,
            role: true,
            verification: { select: { isVerified: true } },
          },
        },
        _count: { select: { comments: true } },
        comments: {
          take: 8,
          orderBy: { createdAt: 'desc' },
          select: {
            user: {
              select: { id: true, fullName: true, avatarUrl: true },
            },
          },
        },
        ...(userId && {
          votes: {
            where: { userId },
            select: { type: true },
          },
        }),
      },
      orderBy,
      skip,
      take: limit,
    }),
    prisma.forumPost.count({ where }),
  ]);

  const posts = rawPosts.map(({ content, votes, comments, ...rest }) => {
    // Dedupe commenter berdasarkan userId, urutan dari komentar terbaru,
    // ambil maksimal 4 untuk ditampilkan di avatar stack mobile.
    const seen = new Set<string>();
    const participants: { id: string; fullName: string; avatarUrl: string | null }[] = [];
    for (const c of comments ?? []) {
      if (!c?.user) continue;
      if (seen.has(c.user.id)) continue;
      seen.add(c.user.id);
      participants.push(c.user);
      if (participants.length === 4) break;
    }

    return {
      ...rest,
      contentPreview: content.length > 200 ? `${content.slice(0, 200)}…` : content,
      userVote: userId && votes && (votes as any[]).length > 0 ? (votes as any[])[0].type : null,
      participants,
    };
  });

  return { posts, total, totalPages: Math.ceil(total / limit) };
};

export const getPostById = async (id: string, isAdmin = false, userId?: string) => {
  const post = await prisma.forumPost.findFirst({
    where: {
      id,
      ...(isAdmin ? {} : { status: PostStatus.PUBLISHED }),
    },
    select: {
      id: true,
      title: true,
      content: true,
      mediaUrls: true,
      tags: true,
      productMentions: true,
      categoryId: true,
      upvotes: true,
      downvotes: true,
      viewCount: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      userId: true,
      user: {
        select: {
          id: true,
          fullName: true,
          avatarUrl: true,
          role: true,
          verification: { select: { isVerified: true } },
        },
      },
      comments: {
        where: { parentId: null }, // Only top-level comments
        select: {
          id: true,
          content: true,
          mediaUrls: true,
          upvotes: true,
          downvotes: true,
          createdAt: true,
          user: {
            select: {
              id: true,
              fullName: true,
              avatarUrl: true,
              verification: { select: { isVerified: true } },
            },
          },
          _count: { select: { votes: true } },
          ...(userId && {
            votes: {
              where: { userId },
              select: { type: true },
            },
          }),
          replies: {
            select: {
              id: true,
              content: true,
              mediaUrls: true,
              upvotes: true,
              downvotes: true,
              createdAt: true,
              user: {
                select: {
                  id: true,
                  fullName: true,
                  avatarUrl: true,
                  verification: { select: { isVerified: true } },
                },
              },
              parent: { select: { id: true, user: { select: { fullName: true } } } },
              _count: { select: { votes: true } },
              ...(userId && {
                votes: {
                  where: { userId },
                  select: { type: true },
                },
              }),
            },
            orderBy: { createdAt: 'asc' },
          },
        },
        orderBy: { createdAt: 'asc' },
      },
      _count: { select: { votes: true, comments: true } },
      ...(userId && {
        votes: {
          where: { userId },
          select: { type: true },
        },
      }),
    },
  });

  if (!post) throw new AppError('Diskusi tidak ditemukan.', 404);

  // Mark view count increment (non-blocking)
  prisma.forumPost.update({ where: { id }, data: { viewCount: { increment: 1 } } }).catch(() => {});

  const formattedComments = post.comments.map((comment) => ({
    ...comment,
    userVote: userId && (comment as any).votes?.length > 0 ? (comment as any).votes[0].type : null,
    replies: comment.replies.map((reply) => ({
      ...reply,
      userVote: userId && (reply as any).votes?.length > 0 ? (reply as any).votes[0].type : null,
    })),
  }));

  return {
    ...post,
    comments: formattedComments,
    userVote: userId && (post as any).votes?.length > 0 ? (post as any).votes[0].type : null,
  };
};

export const createPost = async (
  userId: string,
  data: {
    title: string;
    content?: string;
    categoryId?: string;
    groupId?: string;
    mediaUrls?: ForumMediaInput[];
    status?: PostStatus | 'PUBLISHED' | 'DRAFT';
    tags?: string[];
  },
) => {
  const cleanContent = data.content?.trim() || '';
  if (data.groupId) {
    const { assertGroupMember } = await import('#services/forum-group.service');
    await assertGroupMember(data.groupId, userId);
  }
  // Parse #hashtag dan @product dari title + content sekaligus supaya
  // tag di judul juga ke-capture.
  const { tags, productMentions } = await buildForumMetadata({
    content: `${data.title}\n${cleanContent}`,
    explicitTags: data.tags,
  });

  return prisma.forumPost.create({
    data: {
      userId,
      title: data.title,
      content: cleanContent,
      categoryId: data.categoryId,
      groupId: data.groupId,
      mediaUrls: toMediaJson(data.mediaUrls),
      tags: toJsonValue(tags),
      productMentions: toJsonValue(productMentions as unknown[]),
      status: (data.status as PostStatus) || PostStatus.PUBLISHED,
    },
  });
};

/**
 * Update post oleh owner. Hanya field yang di-pass yang diupdate.
 * Kalau status dipindah ke PUBLISHED, validasi minimum konten / media tetap
 * diberlakukan agar tidak ada draft kosong yang lolos ke feed.
 */
export const updatePost = async (
  id: string,
  userId: string,
  data: {
    title?: string;
    content?: string;
    categoryId?: string | null;
    mediaUrls?: ForumMediaInput[];
    status?: PostStatus | 'PUBLISHED' | 'DRAFT' | 'ARCHIVED';
    tags?: string[];
  },
  role?: string,
) => {
  const post = await prisma.forumPost.findUnique({ where: { id } });
  if (!post) throw new AppError('Diskusi tidak ditemukan.', 404);

  if (post.userId !== userId && role !== 'ADMIN') {
    throw new AppError('Anda tidak memiliki izin untuk mengubah diskusi ini.', 403);
  }

  const finalTitle = data.title ?? post.title;
  const finalContent = (data.content ?? post.content) || '';
  const finalMediaArr = data.mediaUrls
    ? data.mediaUrls
    : ((post.mediaUrls as unknown as ForumMediaInput[] | null) ?? []);
  const finalStatus = (data.status as PostStatus) ?? post.status;

  if (finalStatus === PostStatus.PUBLISHED) {
    if (!finalTitle || finalTitle.trim().length < 5) {
      throw new AppError('Judul diskusi minimal 5 karakter sebelum dipublikasikan.', 400);
    }
    if (finalContent.trim().length < 10 && finalMediaArr.length === 0) {
      throw new AppError(
        'Isi diskusi minimal 10 karakter atau lampirkan media sebelum dipublikasikan.',
        400,
      );
    }
  }

  // Re-parse tag & mention setiap kali content/title/tags berubah supaya
  // metadata tetap sinkron dengan isi terbaru.
  let parsedMeta: { tags: string[]; productMentions: ForumProductMention[] } | null = null;
  if (data.content !== undefined || data.title !== undefined || data.tags !== undefined) {
    parsedMeta = await buildForumMetadata({
      content: `${finalTitle}\n${finalContent}`,
      explicitTags: data.tags,
    });
  }

  return prisma.forumPost.update({
    where: { id },
    data: {
      ...(data.title !== undefined && { title: data.title }),
      ...(data.content !== undefined && { content: data.content.trim() }),
      ...(data.categoryId !== undefined && { categoryId: data.categoryId }),
      ...(data.mediaUrls !== undefined && {
        mediaUrls: toMediaJson(data.mediaUrls) ?? Prisma.JsonNull,
      }),
      ...(parsedMeta && {
        tags: toJsonValue(parsedMeta.tags),
        productMentions: toJsonValue(parsedMeta.productMentions as unknown[]),
      }),
      ...(data.status !== undefined && { status: data.status as PostStatus }),
    },
    select: {
      id: true,
      title: true,
      content: true,
      categoryId: true,
      mediaUrls: true,
      tags: true,
      productMentions: true,
      status: true,
      upvotes: true,
      downvotes: true,
      viewCount: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { comments: true } },
    },
  });
};

/**
 * List postingan milik user sendiri — termasuk DRAFT dan ARCHIVED.
 * Digunakan oleh halaman "Manajemen Postingan Saya" di mobile.
 */
export const listMyPosts = async (params: {
  userId: string;
  status?: PostStatus | 'PUBLISHED' | 'DRAFT' | 'ARCHIVED';
  page?: number;
  limit?: number;
}) => {
  const { userId, status, page = 1, limit = 20 } = params;
  const skip = (page - 1) * limit;

  const where = {
    userId,
    ...(status && { status: status as PostStatus }),
  };

  const [rawPosts, total] = await prisma.$transaction([
    prisma.forumPost.findMany({
      where,
      select: {
        id: true,
        userId: true,
        title: true,
        content: true,
        mediaUrls: true,
        tags: true,
        productMentions: true,
        categoryId: true,
        status: true,
        upvotes: true,
        downvotes: true,
        viewCount: true,
        createdAt: true,
        updatedAt: true,
        user: {
          select: {
            id: true,
            fullName: true,
            avatarUrl: true,
            role: true,
            verification: { select: { isVerified: true } },
          },
        },
        _count: { select: { comments: true } },
      },
      orderBy: { updatedAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.forumPost.count({ where }),
  ]);

  const posts = rawPosts.map(({ content, ...rest }) => ({
    ...rest,
    content,
    contentPreview: content.length > 200 ? `${content.slice(0, 200)}…` : content,
    userVote: null,
    participants: [],
  }));

  return { posts, total, totalPages: Math.ceil(total / limit) };
};

export const createComment = async (
  userId: string,
  postId: string,
  content: string,
  parentId?: string,
  mediaUrls?: ForumMediaInput[],
) => {
  const post = await prisma.forumPost.findUnique({ where: { id: postId } });
  if (!post) throw new AppError('Diskusi tidak ditemukan.', 404);

  // If replying, verify parent comment exists and belongs to same post
  if (parentId) {
    const parentComment = await prisma.forumComment.findUnique({
      where: { id: parentId },
      select: { id: true, postId: true },
    });
    if (!parentComment) throw new AppError('Komentar yang dibalas tidak ditemukan.', 404);
    if (parentComment.postId !== postId) {
      throw new AppError('Komentar yang dibalas tidak ada di diskusi ini.', 400);
    }
  }

  const comment = await prisma.forumComment.create({
    data: {
      userId,
      postId,
      content: content.trim(),
      parentId: parentId || null,
      mediaUrls: toMediaJson(mediaUrls),
    },
    include: {
      user: {
        select: {
          id: true,
          fullName: true,
          avatarUrl: true,
          role: true,
          verification: { select: { isVerified: true } },
        },
      },
    },
  });

  return {
    ...comment,
    userVote: null,
    replies: [],
  };
};

/**
 * Toggle Vote logic for Posts or Comments
 */
export const toggleVote = async (params: {
  userId: string;
  targetId: string;
  targetType: 'POST' | 'COMMENT';
  voteType: VoteType;
}) => {
  const { userId, targetId, targetType, voteType } = params;

  return prisma.$transaction(async (tx) => {
    // 1. Check existing vote
    const existingVote = await tx.forumVote.findFirst({
      where: {
        userId,
        ...(targetType === 'POST' ? { postId: targetId } : { commentId: targetId }),
      },
    });

    const isPost = targetType === 'POST';

    if (existingVote) {
      // If same vote type clicked again => Remove vote (toggle off)
      if (existingVote.type === voteType) {
        await tx.forumVote.delete({ where: { id: existingVote.id } });
        if (isPost) {
          await tx.forumPost.update({
            where: { id: targetId },
            data: { [voteType === VoteType.UP ? 'upvotes' : 'downvotes']: { decrement: 1 } },
          });
        } else {
          await tx.forumComment.update({
            where: { id: targetId },
            data: { [voteType === VoteType.UP ? 'upvotes' : 'downvotes']: { decrement: 1 } },
          });
        }
        return { action: 'REMOVED' };
      } else {
        // Switch vote type (e.g. from UP to DOWN)
        await tx.forumVote.update({
          where: { id: existingVote.id },
          data: { type: voteType },
        });
        if (isPost) {
          await tx.forumPost.update({
            where: { id: targetId },
            data: {
              [voteType === VoteType.UP ? 'upvotes' : 'downvotes']: { increment: 1 },
              [existingVote.type === VoteType.UP ? 'upvotes' : 'downvotes']: { decrement: 1 },
            },
          });
        } else {
          await tx.forumComment.update({
            where: { id: targetId },
            data: {
              [voteType === VoteType.UP ? 'upvotes' : 'downvotes']: { increment: 1 },
              [existingVote.type === VoteType.UP ? 'upvotes' : 'downvotes']: { decrement: 1 },
            },
          });
        }
        return { action: 'SWITCHED' };
      }
    } else {
      // Create new vote
      await tx.forumVote.create({
        data: {
          userId,
          type: voteType,
          ...(isPost ? { postId: targetId } : { commentId: targetId }),
        },
      });
      if (isPost) {
        const updatedPost = await tx.forumPost.update({
          where: { id: targetId },
          data: { [voteType === VoteType.UP ? 'upvotes' : 'downvotes']: { increment: 1 } },
          select: { downvotes: true, id: true },
        });

        // --- AUTOMATED MODERATION FEATURE ---
        if (voteType === VoteType.DOWN && updatedPost.downvotes >= FORUM_MODERATION_THRESHOLD) {
          await tx.forumPost.update({
            where: { id: targetId },
            data: { status: PostStatus.ARCHIVED },
          });
        }
      } else {
        await tx.forumComment.update({
          where: { id: targetId },
          data: { [voteType === VoteType.UP ? 'upvotes' : 'downvotes']: { increment: 1 } },
        });
      }

      return { action: 'ADDED' };
    }
  });
};

export const deletePost = async (id: string, userId: string, role?: string) => {
  const post = await prisma.forumPost.findUnique({ where: { id } });
  if (!post) throw new AppError('Post tidak ditemukan.', 404);

  // Only owner or Admin can soft-delete
  if (post.userId !== userId && role !== 'ADMIN') {
    throw new AppError('Anda tidak memiliki izin untuk menghapus postingan ini.', 403);
  }

  // Soft Delete: Change status to ARCHIVED
  return prisma.forumPost.update({
    where: { id },
    data: { status: PostStatus.ARCHIVED },
  });
};
