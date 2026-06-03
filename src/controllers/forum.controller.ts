import { Response } from 'express';
import catchAsync from '#utils/catchAsync';
import { successResponse, createdResponse, paginatedResponse } from '#utils/response.util';
import * as forumService from '#services/forum.service';
import { attachForumCommentMedia, attachForumMediaUrls } from '#utils/mediaResolver.util';
import { AuthRequest, UserRole } from '#types/index';

interface ForumQuery {
  categoryId?: string;
  keyword?: string;
  tag?: string;
  page?: string;
  limit?: string;
  sortBy?: 'newest' | 'popular' | 'trending';
}

interface MyPostsQuery {
  status?: 'PUBLISHED' | 'DRAFT' | 'ARCHIVED';
  page?: string;
  limit?: string;
}

export const listPosts = catchAsync(async (req: AuthRequest, res: Response) => {
  const { categoryId, keyword, tag, page, limit, sortBy } = req.query as ForumQuery;
  const pageNumber = page ? Number(page) : 1;
  const limitNumber = limit ? Number(limit) : 10;
  const data = await forumService.listPosts({
    categoryId,
    keyword,
    tag,
    page: pageNumber,
    limit: limitNumber,
    userId: req.user?.id,
    sortBy,
  });
  return paginatedResponse(
    res,
    data.posts.map(attachForumMediaUrls),
    data.total,
    pageNumber,
    limitNumber,
    'Daftar diskusi',
  );
});

export const getPostById = catchAsync(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const isAdmin = req.user?.role === UserRole.ADMIN;
  const data = await forumService.getPostById(id, isAdmin, req.user?.id);
  successResponse(res, attachForumMediaUrls(data), 'Detail diskusi');
});

export const createPost = catchAsync(async (req: AuthRequest, res: Response) => {
  const data = await forumService.createPost(req.user!.id, req.body);
  createdResponse(res, attachForumMediaUrls(data), 'Diskusi berhasil dipublikasikan');
});

export const createComment = catchAsync(async (req: AuthRequest, res: Response) => {
  const { postId, content, parentId, mediaUrls } = req.body;
  // eslint-disable-next-line no-console
  console.info('[forum] POST /comments', {
    userId: req.user!.id,
    postId,
    parentId: parentId ?? null,
    contentLength: (content ?? '').length,
    mediaCount: mediaUrls?.length ?? 0,
  });
  const data = await forumService.createComment(
    req.user!.id,
    postId,
    content ?? '',
    parentId,
    mediaUrls,
  );
  createdResponse(res, attachForumCommentMedia(data), 'Komentar berhasil ditambahkan');
});

export const vote = catchAsync(async (req: AuthRequest, res: Response) => {
  const { targetId, targetType, voteType } = req.body;
  const result = await forumService.toggleVote({
    userId: req.user!.id,
    targetId,
    targetType,
    voteType,
  });
  successResponse(res, result, 'Vote berhasil diperbarui');
});

export const deletePost = catchAsync(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const result = await forumService.deletePost(id, req.user!.id, req.user!.role);
  successResponse(res, result, 'Diskusi berhasil dihapus');
});

/**
 * GET /forum/posts/me — daftar postingan milik user sendiri.
 * Mendukung filter status (PUBLISHED / DRAFT / ARCHIVED).
 */
export const listMyPosts = catchAsync(async (req: AuthRequest, res: Response) => {
  const { status, page, limit } = req.query as MyPostsQuery;
  const pageNumber = page ? Number(page) : 1;
  const limitNumber = limit ? Number(limit) : 20;
  const data = await forumService.listMyPosts({
    userId: req.user!.id,
    status,
    page: pageNumber,
    limit: limitNumber,
  });
  return paginatedResponse(
    res,
    data.posts.map(attachForumMediaUrls),
    data.total,
    pageNumber,
    limitNumber,
    'Daftar postingan saya',
  );
});

/**
 * PUT /forum/posts/:id — edit postingan, ubah status (publish, draft, archive).
 * Hanya owner / admin yang bisa.
 */
export const updatePost = catchAsync(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const result = await forumService.updatePost(id, req.user!.id, req.body, req.user!.role);
  successResponse(res, attachForumMediaUrls(result), 'Diskusi berhasil diperbarui');
});
