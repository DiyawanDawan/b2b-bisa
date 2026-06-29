import { Response, NextFunction } from 'express';
import AppError from '#utils/appError';
import { AuthRequest } from '#types/index';
import * as erpService from '#services/erp-integration.service';

export const requireSupplierApiKey = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  const header = req.headers['x-api-key'];
  const rawKey = typeof header === 'string' ? header.trim() : '';
  if (!rawKey) {
    return next(new AppError('Header X-API-Key wajib untuk integrasi ERP.', 401));
  }

  const supplierId = await erpService.resolveSupplierFromApiKey(rawKey);
  if (!supplierId) {
    return next(new AppError('API key tidak valid atau sudah dicabut.', 401));
  }

  req.user = { id: supplierId, role: 'SUPPLIER' } as AuthRequest['user'];
  next();
};
