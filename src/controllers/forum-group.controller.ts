import { Response } from 'express';
import catchAsync from '#utils/catchAsync';
import {
  successResponse,
  createdResponse,
  paginatedResponse,
  errorResponse,
} from '#utils/response.util';
import * as forumGroupService from '#services/forum-group.service';
import { AuthRequest } from '#types/index';

interface ListGroupsQuery {
  keyword?: string;
  page?: number;
  limit?: number;
  mine?: boolean;
}

export const listGroups = catchAsync(async (req: AuthRequest, res: Response) => {
  const { keyword, page, limit, mine } = req.query as unknown as ListGroupsQuery;
  const pageNumber = page ? Number(page) : 1;
  const limitNumber = limit ? Number(limit) : 20;
  const mineOnly = Boolean(mine);

  if (mineOnly && !req.user?.id) {
    return errorResponse(res, 'Login diperlukan untuk melihat grup saya.', 401);
  }

  const data = await forumGroupService.listGroups({
    keyword,
    page: pageNumber,
    limit: limitNumber,
    userId: req.user?.id,
    mine: mineOnly,
  });
  return paginatedResponse(
    res,
    data.groups,
    data.total,
    pageNumber,
    limitNumber,
    mine ? 'Grup saya' : 'Daftar grup diskusi',
  );
});

export const getGroupById = catchAsync(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const data = await forumGroupService.getGroupById(id, req.user?.id);
  successResponse(res, data, 'Detail grup');
});

export const createGroup = catchAsync(async (req: AuthRequest, res: Response) => {
  const data = await forumGroupService.createGroup(req.user!.id, req.body);
  createdResponse(res, data, 'Grup berhasil dibuat');
});

export const updateGroup = catchAsync(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const data = await forumGroupService.updateGroup(id, req.user!.id, req.body);
  successResponse(res, data, 'Grup berhasil diperbarui');
});

export const joinGroup = catchAsync(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const data = await forumGroupService.joinGroup(id, req.user!.id);
  successResponse(res, data, 'Berhasil bergabung ke grup');
});

export const leaveGroup = catchAsync(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const data = await forumGroupService.leaveGroup(id, req.user!.id);
  successResponse(res, data, 'Berhasil keluar dari grup');
});
