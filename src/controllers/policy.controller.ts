import { Request, Response } from 'express';
import catchAsync from '#utils/catchAsync';
import { successResponse } from '#utils/response.util';
import * as policyService from '#services/policy.service';

/**
 * GET /api/v1/policies
 */
export const listPolicies = catchAsync(async (_req: Request, res: Response) => {
  const data = await policyService.listActivePolicies();
  return successResponse(res, data, 'Daftar kebijakan berhasil diambil');
});

/**
 * GET /api/v1/policies/:key
 * key: terms | privacy
 */
export const getPolicyByKey = catchAsync(async (req: Request, res: Response) => {
  const data = await policyService.getPolicyByKey(req.params.key);
  return successResponse(res, data, 'Kebijakan berhasil diambil');
});
