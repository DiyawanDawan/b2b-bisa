import { Response } from 'express';
import { AuthRequest } from '#types/index';
import catchAsync from '#utils/catchAsync';
import { successResponse } from '#utils/response.util';
import * as followService from '#services/follow.service';

export const toggleFollow = catchAsync(async (req: AuthRequest, res: Response) => {
  const { userId } = req.body as { userId: string };
  const result = await followService.toggleFollow(req.user!.id, userId);
  successResponse(
    res,
    result,
    result.following ? 'Berhasil mengikuti user.' : 'Berhenti mengikuti user.',
  );
});

export const checkFollow = catchAsync(async (req: AuthRequest, res: Response) => {
  const result = await followService.isFollowing(req.user!.id, req.params.userId);
  successResponse(res, result, 'Status follow.');
});

export const getMyFollowingIds = catchAsync(async (req: AuthRequest, res: Response) => {
  const result = await followService.getFollowingIds(req.user!.id);
  successResponse(res, result, 'Daftar user yang diikuti.');
});

export const getFollowStats = catchAsync(async (req: AuthRequest, res: Response) => {
  const userId = req.params.userId || req.user!.id;
  const result = await followService.getFollowStats(userId);
  successResponse(res, result, 'Statistik follow.');
});

export const getMyFollowing = catchAsync(async (req: AuthRequest, res: Response) => {
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 30;
  const result = await followService.listFollowing(req.user!.id, page, limit);
  successResponse(res, result, 'Daftar mengikuti.');
});

export const getMyFollowers = catchAsync(async (req: AuthRequest, res: Response) => {
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 30;
  const result = await followService.listFollowers(req.user!.id, page, limit);
  successResponse(res, result, 'Daftar pengikut.');
});

export const getUserFollowing = catchAsync(async (req: AuthRequest, res: Response) => {
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 30;
  const result = await followService.listFollowing(req.params.userId, page, limit);
  successResponse(res, result, 'Daftar mengikuti user.');
});

export const getUserFollowers = catchAsync(async (req: AuthRequest, res: Response) => {
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 30;
  const result = await followService.listFollowers(req.params.userId, page, limit);
  successResponse(res, result, 'Daftar pengikut user.');
});
