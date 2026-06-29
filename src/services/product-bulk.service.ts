import prisma from '#config/prisma';
import AppError from '#utils/appError';
import { parseCsvRows, PRODUCT_BULK_CSV_TEMPLATE } from '#utils/csvParse.util';
import {
  BiomassaType,
  BiocharGrade,
  ProductStatus,
  UnitStatus,
  Prisma,
} from '#prisma';
import { assertSupplierStoreReady } from '#utils/readiness.util';

const MAX_ROWS = 100;

export const getBulkCsvTemplate = () => PRODUCT_BULK_CSV_TEMPLATE;

type RowResult = {
  row: number;
  name?: string;
  success: boolean;
  productId?: string;
  error?: string;
};

const parseEnum = <T extends string>(value: string, allowed: readonly T[], label: string): T => {
  const v = value.trim().toUpperCase() as T;
  if (!allowed.includes(v)) {
    throw new AppError(`${label} tidak valid: ${value}`, 400);
  }
  return v;
};

export const importProductsFromCsv = async (userId: string, fileBuffer: Buffer) => {
  const rows = parseCsvRows(fileBuffer);
  if (rows.length === 0) {
    throw new AppError('File CSV kosong atau header tidak ditemukan.', 400);
  }
  if (rows.length > MAX_ROWS) {
    throw new AppError(`Maksimal ${MAX_ROWS} baris produk per upload.`, 400);
  }

  const location = await prisma.user.findUnique({
    where: { id: userId },
    select: { province: true, regency: true },
  });
  if (!location) throw new AppError('User tidak ditemukan.', 404);

  const results: RowResult[] = [];
  let created = 0;

  for (let i = 0; i < rows.length; i++) {
    const rowNum = i + 2;
    const row = rows[i];
    try {
      const name = row.name?.trim();
      if (!name || name.length < 3) {
        throw new AppError('Nama produk minimal 3 karakter.', 400);
      }

      const biomassaType = parseEnum(
        row.biomassaType || 'OTHER',
        Object.values(BiomassaType),
        'biomassaType',
      );
      const gradeRaw = row.grade?.trim();
      const grade =
        gradeRaw && gradeRaw.length > 0
          ? parseEnum(gradeRaw, Object.values(BiocharGrade), 'grade')
          : undefined;

      if (biomassaType === BiomassaType.BIOCHAR && !grade) {
        throw new AppError('Grade wajib untuk produk BIOCHAR.', 400);
      }

      const pricePerUnit = Number(row.pricePerUnit);
      const stock = Number(row.stock ?? 0);
      const minOrder = Number(row.minOrder ?? 1);
      if (!Number.isFinite(pricePerUnit) || pricePerUnit <= 0) {
        throw new AppError('pricePerUnit harus angka positif.', 400);
      }
      if (!Number.isFinite(stock) || stock < 0) {
        throw new AppError('stock tidak valid.', 400);
      }
      if (!Number.isFinite(minOrder) || minOrder < 1) {
        throw new AppError('minOrder minimal 1.', 400);
      }

      const unit = parseEnum(
        (row.unit || 'KG').toUpperCase(),
        Object.values(UnitStatus),
        'unit',
      );
      const status = parseEnum(
        (row.status || 'DRAFT').toUpperCase(),
        [ProductStatus.DRAFT, ProductStatus.ACTIVE, ProductStatus.INACTIVE],
        'status',
      );

      if (status === ProductStatus.ACTIVE) {
        await assertSupplierStoreReady(userId);
        throw new AppError(
          'Bulk upload tidak mendukung status ACTIVE (butuh foto). Gunakan DRAFT.',
          400,
        );
      }

      const product = await prisma.product.create({
        data: {
          userId,
          name,
          biomassaType,
          grade: biomassaType === BiomassaType.BIOCHAR ? grade : null,
          description: row.description?.trim() || null,
          pricePerUnit: new Prisma.Decimal(pricePerUnit),
          stock: new Prisma.Decimal(stock),
          minOrder: new Prisma.Decimal(minOrder),
          unit,
          status,
          province: location.province,
          regency: location.regency,
          productMode: 'BIOMASS_MATERIAL',
        },
        select: { id: true, name: true },
      });

      created++;
      results.push({ row: rowNum, name: product.name, success: true, productId: product.id });
    } catch (err) {
      const message = err instanceof AppError ? err.message : 'Gagal memproses baris.';
      results.push({
        row: rowNum,
        name: row.name?.trim(),
        success: false,
        error: message,
      });
    }
  }

  return {
    totalRows: rows.length,
    created,
    failed: rows.length - created,
    results,
  };
};
