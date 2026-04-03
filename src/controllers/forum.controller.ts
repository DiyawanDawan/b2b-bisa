import { Response } from 'express';
import catchAsync from '#utils/catchAsync';
import { successResponse, createdResponse } from '#utils/response.util';
import * as forumService from '#services/forum.service';
import { AuthRequest } from '#middlewares/authMiddleware';

interface ForumQuery {
  categoryId?: string;
  keyword?: string;
  page?: string;
  limit?: string;
}

export const listPosts = catchAsync(async (req: AuthRequest, res: Response) => {
  const { categoryId, keyword, page, limit } = req.query as ForumQuery;
  const data = await forumService.listPosts({
    categoryId,
    keyword,
    page: page ? Number(page) : undefined,
    limit: limit ? Number(limit) : undefined,
  });
  successResponse(res, data, 'Daftar diskusi');
});

export const getPostById = catchAsync(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const data = await forumService.getPostById(id);
  successResponse(res, data, 'Detail diskusi');
});

export const createPost = catchAsync(async (req: AuthRequest, res: Response) => {
  const data = await forumService.createPost(req.user!.id, req.body);
  createdResponse(res, data, 'Diskusi berhasil dipublikasikan');
});

export const createComment = catchAsync(async (req: AuthRequest, res: Response) => {
  const { postId, content } = req.body;
  const data = await forumService.createComment(req.user!.id, postId, content);
  createdResponse(res, data, 'Komentar berhasil ditambahkan');
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
  const result = await forumService.deletePost(id, req.user!.id);
  successResponse(res, result, 'Diskusi berhasil dihapus');
});
