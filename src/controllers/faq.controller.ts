import { Response } from 'express';
import { AuthRequest, UserRole } from '#types/index';
import catchAsync from '#utils/catchAsync';
import { successResponse, createdResponse, paginatedResponse } from '#utils/response.util';
import * as faqService from '#services/faq.service';

export const listFaqs = catchAsync(async (req: AuthRequest, res: Response) => {
  const { page, limit, includeInactive } = req.query as {
    page?: string;
    limit?: string;
    includeInactive?: 'true' | 'false';
  };

  const pageNum = Number(page) || 1;
  const limitNum = Number(limit) || 50;
  const isAdmin = req.user?.role === UserRole.ADMIN;

  const result = await faqService.listFaqs(
    {
      page: pageNum,
      limit: limitNum,
      includeInactive: includeInactive === 'true',
    },
    isAdmin,
  );

  return paginatedResponse(res, result.faqs, result.total, pageNum, limitNum);
});

export const getFaq = catchAsync(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const isAdmin = req.user?.role === UserRole.ADMIN;
  const faq = await faqService.getFaqById(id, isAdmin);
  return successResponse(res, faq, 'Detail FAQ berhasil diambil');
});

export const createFaq = catchAsync(async (req: AuthRequest, res: Response) => {
  const faq = await faqService.createFaq(req.body);
  return createdResponse(res, faq, 'FAQ berhasil dibuat');
});

export const updateFaq = catchAsync(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const faq = await faqService.updateFaq(id, req.body);
  return successResponse(res, faq, 'FAQ berhasil diperbarui');
});

export const deleteFaq = catchAsync(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  await faqService.deleteFaq(id);
  return successResponse(res, null, 'FAQ berhasil dinonaktifkan');
});
