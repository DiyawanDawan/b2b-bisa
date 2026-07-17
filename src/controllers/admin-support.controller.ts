import { Response } from 'express';
import { AuthRequest } from '#types/index';
import catchAsync from '#utils/catchAsync';
import { createdResponse, successResponse } from '#utils/response.util';
import * as supportService from '#services/support.service';

export const listTickets = catchAsync(async (req: AuthRequest, res: Response) => {
  const result = await supportService.listAdminTickets(req.query);
  return successResponse(res, result, 'Antrean tiket Customer Service berhasil diambil.');
});

export const getTicket = catchAsync(async (req: AuthRequest, res: Response) => {
  const ticket = await supportService.getAdminTicket(req.params.id);
  return successResponse(res, ticket, 'Detail tiket Customer Service berhasil diambil.');
});

export const updateTicket = catchAsync(async (req: AuthRequest, res: Response) => {
  const ticket = await supportService.updateAdminTicket(req.params.id, req.body);
  return successResponse(res, ticket, 'Tiket Customer Service berhasil diperbarui.');
});

export const addMessage = catchAsync(async (req: AuthRequest, res: Response) => {
  const ticket = await supportService.addAdminMessage(
    req.params.id,
    req.user!.id,
    req.body.content,
  );
  return createdResponse(res, ticket, 'Balasan Customer Service berhasil dikirim.');
});

export const resolveTicket = catchAsync(async (req: AuthRequest, res: Response) => {
  const ticket = await supportService.resolveAdminTicket(
    req.params.id,
    req.user!.id,
    req.body.resolutionMessage,
  );
  return successResponse(res, ticket, 'Tiket Customer Service berhasil diselesaikan.');
});
