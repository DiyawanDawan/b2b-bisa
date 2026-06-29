import { Response } from 'express';
import { AuthRequest } from '#types/index';
import catchAsync from '#utils/catchAsync';
import { successResponse } from '#utils/response.util';
import * as referralService from '#services/referral.service';

export const getMyReferral = catchAsync(async (req: AuthRequest, res: Response) => {
  const data = await referralService.getReferralDashboard(req.user!.id);
  return successResponse(res, data, 'Data program referral');
});

export const validateCode = catchAsync(async (req: AuthRequest, res: Response) => {
  const code = (req.params.code as string)?.trim();
  const result = await referralService.validateReferralCode(code);
  return successResponse(res, result, 'Validasi kode referral');
});
