import { Response } from 'express';
import { Prisma, ProductMode } from '#prisma';
import { AuthRequest } from '#types/index';
import catchAsync from '#utils/catchAsync';
import { successResponse } from '#utils/response.util';
import * as voucherService from '#services/voucher.service';

export const validateVoucher = catchAsync(async (req: AuthRequest, res: Response) => {
  const { code, subtotal, sellerIds, cartLines } = req.body;
  const normalizedLines = Array.isArray(cartLines)
    ? cartLines.map(
        (line: {
          productId: string;
          sellerId: string;
          categoryId?: string | null;
          productMode?: ProductMode | null;
          lineSubtotal: number;
        }) => ({
          productId: line.productId,
          sellerId: line.sellerId,
          categoryId: line.categoryId,
          productMode: line.productMode,
          lineSubtotal: new Prisma.Decimal(line.lineSubtotal),
        }),
      )
    : undefined;
  const result = await voucherService.validateVoucherPreview(
    req.user!.id,
    code,
    subtotal,
    sellerIds,
    normalizedLines,
  );
  successResponse(res, result);
});
