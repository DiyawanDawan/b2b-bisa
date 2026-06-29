import { Response } from 'express';
import { AuthRequest } from '#types/index';
import catchAsync from '#utils/catchAsync';
import { createdResponse, successResponse } from '#utils/response.util';
import * as productBulkService from '#services/product-bulk.service';
import AppError from '#utils/appError';

export const downloadBulkTemplate = catchAsync(async (_req: AuthRequest, res: Response) => {
  const csv = productBulkService.getBulkCsvTemplate();
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="bisa-product-bulk-template.csv"');
  res.status(200).send(csv);
});

export const uploadBulkCsv = catchAsync(async (req: AuthRequest, res: Response) => {
  const file = req.file;
  if (!file?.buffer) {
    throw new AppError('File CSV wajib diunggah (field: file).', 400);
  }

  const result = await productBulkService.importProductsFromCsv(req.user!.id, file.buffer);

  createdResponse(
    res,
    result,
    `${result.created} produk berhasil diimpor (${result.failed} gagal).`,
  );
});
