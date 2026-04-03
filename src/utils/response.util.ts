import { Response } from 'express';
import { Prisma } from '#prisma';

/**
 * Recursively search and convert Prisma.Decimal to Number for clean API responses
 */
const transformDecimal = (obj: any): any => {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(transformDecimal);

  // If it's a Decimal, convert to number
  if (Prisma.Decimal.isDecimal(obj)) {
    return obj.toNumber();
  }

  // Handle regular objects
  const newObj: any = {};
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      newObj[key] = transformDecimal(obj[key]);
    }
  }
  return newObj;
};

// No global interface needed for now as they are simple objects
export const successResponse = (
  res: Response,
  data: unknown = null,
  message = 'Berhasil',
  statusCode = 200,
): Response => {
  const result = {
    meta: {
      success: true,
      status: statusCode,
      message,
    },
    data: transformDecimal(data),
  };
  return res.status(statusCode).json(result);
};

export const createdResponse = (
  res: Response,
  data: unknown = null,
  message = 'Data berhasil dibuat',
): Response => successResponse(res, data, message, 201);

export const errorResponse = (
  res: Response,
  message = 'Terjadi kesalahan',
  statusCode = 500,
  errors?: unknown,
): Response => {
  const result: any = {
    meta: {
      success: false,
      status: statusCode,
      message,
    },
    data: errors || null,
  };
  return res.status(statusCode).json(result);
};

export const paginatedResponse = (
  res: Response,
  data: unknown[],
  total: number,
  page: number,
  limit: number,
  message = 'Berhasil',
): Response => {
  return res.status(200).json({
    meta: {
      success: true,
      status: 200,
      message,
    },
    data: transformDecimal(data),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
};
