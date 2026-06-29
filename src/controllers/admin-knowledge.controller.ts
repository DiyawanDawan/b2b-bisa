import { Response } from 'express';
import catchAsync from '#utils/catchAsync';
import { paginatedObjectResponse, successResponse } from '#utils/response.util';
import { AuthRequest } from '#types/index';
import * as knowledgeService from '#services/knowledge.service';

export const listKnowledge = catchAsync(async (req: AuthRequest, res: Response) => {
  const { page, limit } = req.query as { page?: string; limit?: string };
  const pageNum = page ? Number(page) : 1;
  const limitNum = limit ? Number(limit) : 20;
  const result = await knowledgeService.listKnowledgeDocuments({
    page: pageNum,
    limit: limitNum,
  });
  paginatedObjectResponse(
    res,
    { items: result.items ?? [] },
    {
      page: result.page,
      limit: result.limit,
      total: result.total,
      totalPages: Math.ceil(result.total / result.limit) || 0,
    },
    'Daftar knowledge berhasil dimuat',
  );
});

export const getKnowledgeStats = catchAsync(async (_req: AuthRequest, res: Response) => {
  const stats = await knowledgeService.getKnowledgeStats();
  successResponse(res, stats, 'Statistik knowledge');
});

export const createKnowledgeText = catchAsync(async (req: AuthRequest, res: Response) => {
  const { title, content, description } = req.body as {
    title: string;
    content: string;
    description?: string;
  };
  const doc = await knowledgeService.createKnowledgeFromText({
    title,
    content,
    description,
    uploadedById: req.user!.id,
  });
  successResponse(res, doc, 'Knowledge teks berhasil di-index ke Chroma', 201);
});

export const uploadKnowledge = catchAsync(async (req: AuthRequest, res: Response) => {
  const file = req.file;
  if (!file) {
    res.status(400).json({ meta: { success: false, message: 'File wajib diupload.' } });
    return;
  }
  const { title, description } = req.body as { title: string; description?: string };
  const doc = await knowledgeService.uploadKnowledgeFile({
    title,
    description,
    file,
    uploadedById: req.user!.id,
  });
  successResponse(res, doc, 'File knowledge berhasil di-upload dan di-index', 201);
});

export const deleteKnowledge = catchAsync(async (req: AuthRequest, res: Response) => {
  const result = await knowledgeService.deleteKnowledgeDocument(req.params.id);
  successResponse(res, result, 'Knowledge dihapus dari Chroma dan database');
});

export const reindexKnowledge = catchAsync(async (req: AuthRequest, res: Response) => {
  const doc = await knowledgeService.reindexKnowledgeDocument(req.params.id);
  successResponse(res, doc, 'Knowledge berhasil di-index ulang');
});
