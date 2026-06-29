import { Response, Request } from 'express';
import { AuthRequest } from '#types/index';
import catchAsync from '#utils/catchAsync';
import { successResponse, createdResponse } from '#utils/response.util';
import * as liveService from '#services/live-session.service';
import { LiveSessionStatus } from '#prisma';

export const listPublic = catchAsync(async (req: Request, res: Response) => {
  const status = req.query.status as LiveSessionStatus | undefined;
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;
  const data = await liveService.listPublicLiveSessions({ status, page, limit });
  return successResponse(res, data, 'Daftar sesi live');
});

export const getById = catchAsync(async (req: Request, res: Response) => {
  const data = await liveService.getLiveSessionById(req.params.id);
  return successResponse(res, data, 'Detail sesi live');
});

export const listMine = catchAsync(async (req: AuthRequest, res: Response) => {
  const data = await liveService.listMyLiveSessions(req.user!.id);
  return successResponse(res, data, 'Sesi live saya');
});

export const create = catchAsync(async (req: AuthRequest, res: Response) => {
  const data = await liveService.createLiveSession(req.user!.id, req.body);
  return createdResponse(res, data, 'Sesi live dibuat');
});

export const start = catchAsync(async (req: AuthRequest, res: Response) => {
  const data = await liveService.startLiveSession(req.user!.id, req.params.id);
  return successResponse(res, data, 'Sesi live dimulai');
});

export const end = catchAsync(async (req: AuthRequest, res: Response) => {
  const data = await liveService.endLiveSession(req.user!.id, req.params.id);
  return successResponse(res, data, 'Sesi live diakhiri');
});

export const comment = catchAsync(async (req: AuthRequest, res: Response) => {
  const { message } = req.body as { message: string };
  const data = await liveService.addLiveComment(req.params.id, req.user!.id, message);
  return createdResponse(res, data, 'Komentar dikirim');
});

export const recordViewer = catchAsync(async (req: Request, res: Response) => {
  await liveService.recordLiveViewer(req.params.id);
  return successResponse(res, { recorded: true }, 'Viewer dicatat');
});
