import { Router } from 'express';
import * as voucherController from '#controllers/voucher.controller';
import { requireAuth } from '#middlewares/authMiddleware';
import validate from '#middlewares/validate';
import * as v from '#validations/voucher.validation';
import { financialLimiter } from '#middlewares/rateLimiter';
import catchAsync from '#utils/catchAsync';
import { successResponse } from '#utils/response.util';
import * as exchangeRateService from '#services/exchange-rate.service';
import { Response } from 'express';
import { AuthRequest } from '#types/index';
import prisma from '#config/prisma';
import AppError from '#utils/appError';
import { z } from 'zod';

const router = Router();

const displayCurrencySchema = z.object({
  currency: z.enum(['IDR', 'USD', 'SGD', 'EUR']),
});

router.get(
  '/exchange-rates',
  catchAsync(async (_req, res: Response) => {
    return successResponse(res, exchangeRateService.getExchangeRates(), 'Kurs tampilan');
  }),
);

router.patch(
  '/display-currency',
  requireAuth,
  validate(displayCurrencySchema),
  catchAsync(async (req: AuthRequest, res: Response) => {
    const { currency } = req.body as { currency: string };
    if (!exchangeRateService.isSupportedDisplayCurrency(currency)) {
      throw new AppError('Mata uang tidak didukung.', 400);
    }
    const user = await prisma.user.update({
      where: { id: req.user!.id },
      data: { displayCurrency: currency.toUpperCase() },
      select: { displayCurrency: true },
    });
    return successResponse(res, user, 'Preferensi mata uang diperbarui');
  }),
);

router.post(
  '/vouchers/validate',
  financialLimiter,
  requireAuth,
  validate(v.validateVoucherSchema),
  voucherController.validateVoucher,
);

export default router;
