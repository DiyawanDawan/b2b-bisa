import { Response } from 'express';
import { AuthRequest } from '#types/index';
import catchAsync from '#utils/catchAsync';
import { createdResponse, paginatedResponse, successResponse } from '#utils/response.util';
import * as rfqService from '#services/rfq.service';

export const createRfq = catchAsync(async (req: AuthRequest, res: Response) => {
  const result = await rfqService.createRfq(req.user!.id, req.body);
  createdResponse(res, result, 'RFQ berhasil dibuat.');
});

export const listMyRfqs = catchAsync(async (req: AuthRequest, res: Response) => {
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 20;
  const result = await rfqService.listBuyerRfqs(req.user!.id, page, limit);
  paginatedResponse(res, result.items, result.total, page, limit);
});

export const listInbox = catchAsync(async (req: AuthRequest, res: Response) => {
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 20;
  const result = await rfqService.listSupplierRfqInbox(req.user!.id, page, limit);
  paginatedResponse(res, result.items, result.total, page, limit);
});

export const getInboxDetail = catchAsync(async (req: AuthRequest, res: Response) => {
  const result = await rfqService.getSupplierRfqDetail(req.user!.id, req.params.id);
  successResponse(res, result, 'Detail RFQ masuk berhasil diambil.');
});

export const respond = catchAsync(async (req: AuthRequest, res: Response) => {
  const result = await rfqService.respondToRfq(req.user!.id, req.params.id, req.body.message);
  successResponse(res, result, 'Respons RFQ berhasil — ruang chat dibuka.');
});

export const getMyRfqDetail = catchAsync(async (req: AuthRequest, res: Response) => {
  const result = await rfqService.getBuyerRfqDetail(req.user!.id, req.params.id);
  successResponse(res, result, 'Detail RFQ berhasil diambil.');
});
