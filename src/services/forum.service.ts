import prisma from '#config/prisma';
import AppError from '#utils/appError';
import { PostStatus, VoteType } from '#prisma';
import { FORUM_MODERATION_THRESHOLD } from '#utils/env.util';

export const listPosts = async (params: {
  categoryId?: string;
  keyword?: string;
  page?: number;
  limit?: number;
}) => {
  const { categoryId, keyword, page = 1, limit = 10 } = params;
  const skip = (page - 1) * limit;

  const where = {
    ...(categoryId && { categoryId }),
    ...(keyword && {
      OR: [{ title: { contains: keyword } }, { content: { contains: keyword } }],
    }),
    status: PostStatus.PUBLISHED,
  };

  const [posts, total] = await prisma.$transaction([
    prisma.forumPost.findMany({
      where,
      include: {
        user: { select: { id: true, fullName: true, avatarUrl: true, role: true } },
        _count: { select: { comments: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.forumPost.count({ where }),
  ]);

  return { posts, total, totalPages: Math.ceil(total / limit) };
};

export const getPostById = async (id: string) => {
  const post = await prisma.forumPost.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, fullName: true, avatarUrl: true, role: true } },
      comments: {
        include: {
          user: { select: { id: true, fullName: true, avatarUrl: true } },
          _count: { select: { votes: true } },
        },
        orderBy: { createdAt: 'asc' },
      },
      _count: { select: { votes: true } },
    },
  });
  if (!post) throw new AppError('Diskusi tidak ditemukan.', 404);

  // Mark view count increment (non-blocking)
  prisma.forumPost.update({ where: { id }, data: { viewCount: { increment: 1 } } }).catch(() => {});

  return post;
};

export const createPost = async (
  userId: string,
  data: { title: string; content: string; categoryId?: string },
) => {
  return prisma.forumPost.create({
    data: {
      userId,
      ...data,
    },
  });
};

export const createComment = async (userId: string, postId: string, content: string) => {
  const post = await prisma.forumPost.findUnique({ where: { id: postId } });
  if (!post) throw new AppError('Diskusi tidak ditemukan.', 404);

  return prisma.forumComment.create({
    data: {
      userId,
      postId,
      content,
    },
  });
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

export const deletePost = async (id: string, userId: string) => {
  const post = await prisma.forumPost.findUnique({ where: { id } });
  if (!post) throw new AppError('Post tidak ditemukan.', 404);
  if (post.userId !== userId) throw new AppError('Anda tidak memiliki izin.', 403);

  return prisma.forumPost.delete({ where: { id } });
};
