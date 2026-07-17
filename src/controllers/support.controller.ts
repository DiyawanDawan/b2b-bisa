import { Response } from 'express';
import { AuthRequest } from '#types/index';
import catchAsync from '#utils/catchAsync';
import { createdResponse, successResponse } from '#utils/response.util';
import * as supportService from '#services/support.service';
import { SupportTicketStatus } from '#prisma';

export const createTicket = catchAsync(async (req: AuthRequest, res: Response) => {
  const ticket = await supportService.createTicket(req.user!.id, req.body);
  return createdResponse(res, ticket, 'Tiket Customer Service berhasil dibuat.');
});

export const listTickets = catchAsync(async (req: AuthRequest, res: Response) => {
  const result = await supportService.listUserTickets(
    req.user!.id,
    Number(req.query.page) || 1,
    Number(req.query.limit) || 20,
    req.query.status as SupportTicketStatus | undefined,
  );
  return successResponse(res, result, 'Daftar tiket dukungan berhasil diambil.');
});

export const getActiveTicket = catchAsync(async (req: AuthRequest, res: Response) => {
  const ticket = await supportService.getActiveTicket(req.user!.id);
  return successResponse(res, { ticket }, 'Status tiket aktif berhasil diambil.');
});

export const getTicket = catchAsync(async (req: AuthRequest, res: Response) => {
  const ticket = await supportService.getUserTicket(req.params.id, req.user!.id);
  return successResponse(res, ticket, 'Detail tiket dukungan berhasil diambil.');
});

export const addMessage = catchAsync(async (req: AuthRequest, res: Response) => {
  const ticket = await supportService.addUserMessage(req.params.id, req.user!.id, req.body.content);
  return createdResponse(res, ticket, 'Pesan berhasil dikirim ke Customer Service.');
});

export const closeTicket = catchAsync(async (req: AuthRequest, res: Response) => {
  const ticket = await supportService.closeUserTicket(req.params.id, req.user!.id);
  return successResponse(res, ticket, 'Tiket dukungan berhasil ditutup.');
});
