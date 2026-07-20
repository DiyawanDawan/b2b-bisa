import { Response, NextFunction } from 'express';
import prisma from '#config/prisma';
import { AuthRequest } from '#types/index';
import { errorResponse } from '#utils/response.util';
import { DriverStatus } from '#prisma';

/** Pastikan user punya record BisaExpressDriver aktif. */
export const requireBisaExpressDriver = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    if (!req.user?.id) {
      errorResponse(res, 'Authentication required', 401);
      return;
    }
    const driver = await prisma.bisaExpressDriver.findUnique({
      where: { userId: req.user.id },
      select: { id: true, isActive: true, status: true },
    });
    if (!driver || !driver.isActive || driver.status === DriverStatus.SUSPENDED) {
      errorResponse(res, 'Akses driver BISA Express ditolak', 403);
      return;
    }
    next();
  } catch (err) {
    next(err);
  }
};
