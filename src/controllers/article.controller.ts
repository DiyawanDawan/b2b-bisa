import { Response } from 'express';
import { AuthRequest, PostStatus, UserRole } from '#types/index';
import catchAsync from '#utils/catchAsync';
import { successResponse, createdResponse, paginatedResponse } from '#utils/response.util';
import * as articleService from '#services/article.service';
import { attachArticleMediaUrls } from '#utils/mediaResolver.util';

export const listArticles = catchAsync(async (req: AuthRequest, res: Response) => {
  const { page, limit, status, search, categoryId } = req.query as {
    page?: string;
    limit?: string;
    status?: PostStatus;
    search?: string;
    categoryId?: string;
  };

  const pageNum = Number(page) || 1;
  const limitNum = Number(limit) || 10;
  const isAdmin = req.user?.role === 'ADMIN';

  const result = await articleService.listArticles(
    {
      page: pageNum,
      limit: limitNum,
      status,
      search,
      categoryId,
    },
    isAdmin,
  );

  return paginatedResponse(
    res,
    result.articles.map(attachArticleMediaUrls),
    result.total,
    pageNum,
    limitNum,
  );
});

export const getArticle = catchAsync(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const isAdmin = req.user?.role === UserRole.ADMIN;
  const article = await articleService.getArticleById(id, isAdmin);
  return successResponse(res, attachArticleMediaUrls(article), 'Detail artikel berhasil diambil');
});

export const createArticle = catchAsync(async (req: AuthRequest, res: Response) => {
  const authorId = req.user?.id;
  const data = {
    ...req.body,
    author: { connect: { id: authorId } },
    ...(req.body.categoryId && { category: { connect: { id: req.body.categoryId } } }),
  };

  // Remove categoryId from root if it exists because we use 'connect'
  delete data.categoryId;

  const article = await articleService.createArticle(data);
  return createdResponse(res, attachArticleMediaUrls(article), 'Artikel berhasil dibuat');
});

export const updateArticle = catchAsync(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const data = {
    ...req.body,
    ...(req.body.categoryId && { category: { connect: { id: req.body.categoryId } } }),
  };

  // Same as create
  delete data.categoryId;

  const article = await articleService.updateArticle(id, data);
  return successResponse(res, attachArticleMediaUrls(article), 'Artikel berhasil diperbarui');
});

export const deleteArticle = catchAsync(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  await articleService.deleteArticle(id);
  return successResponse(res, null, 'Artikel berhasil dihapus');
});
