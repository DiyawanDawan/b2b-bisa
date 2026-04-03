import { z } from 'zod';
import { BiomassaType, BiocharGrade, ProductStatus, UnitStatus } from '#prisma';

const createStatusSchema = z.union([
  z.literal(ProductStatus.ACTIVE),
  z.literal(ProductStatus.DRAFT),
]);

const updateStatusSchema = z.union([
  z.literal(ProductStatus.ACTIVE),
  z.literal(ProductStatus.DRAFT),
  z.literal(ProductStatus.OUT_OF_STOCK),
]);

export const createProductSchema = z.object({
  name: z.string().min(3, 'Nama produk minimal 3 karakter'),
  biomassaType: z.nativeEnum(BiomassaType, { required_error: 'Jenis biomassa wajib dipilih' }),
  grade: z.nativeEnum(BiocharGrade).optional(), // Only required if biomassaType === BIOCHAR
  description: z.string().optional(),
  pricePerUnit: z.coerce.number().positive('Harga per unit harus lebih dari 0'),
  stock: z.coerce.number().nonnegative('Stok tidak boleh negatif'),
  minOrder: z.coerce.number().min(1).default(100),
  unit: z.nativeEnum(UnitStatus).default(UnitStatus.KG),
  status: createStatusSchema.default(ProductStatus.ACTIVE), // Hanya bisa ACTIVE/DRAFT saat create

  // Technical Specs (B2B Standard)
  moistureContent: z.coerce.number().min(0).max(100).optional(),
  carbonPurity: z.coerce.number().min(0).max(100).optional(),
  productionCapacity: z.coerce.number().nonnegative().optional(),
  surfaceArea: z.coerce.number().nonnegative().optional(),
  phLevel: z.coerce.number().min(0).max(14).optional(),
  density: z.string().optional(), // e.g. "95-105 kg/m3"
  carbonOffsetPerTon: z.coerce.number().nonnegative().optional(),
  grossWeightPerSak: z.coerce.number().nonnegative().optional(),
  netWeightPerSak: z.coerce.number().nonnegative().optional(),
  bagDimension: z.string().optional(),

  province: z.string().optional(),
  regency: z.string().optional(),
  categoryId: z.string().uuid('ID Kategori tidak valid').optional(),
});

export const updateProductSchema = createProductSchema.partial().extend({
  // Saat update, status bisa berubah ke OUT_OF_STOCK juga
  status: updateStatusSchema.optional(),
});

export const productFilterSchema = z.object({
  search: z.string().optional(),
  userId: z.string().uuid('ID penyuplai tidak valid').optional(),
  // Sync ProductStatus penuh untuk keperluan filter admin/supplier
  status: z.nativeEnum(ProductStatus).optional(),
  categoryId: z.string().optional(),
  biomassaType: z.nativeEnum(BiomassaType).optional(),
  grade: z.nativeEnum(BiocharGrade).optional(),
  province: z.string().optional(),
  regency: z.string().optional(),
  minPrice: z.coerce.number().optional(),
  maxPrice: z.coerce.number().optional(),
  minStock: z.coerce.number().optional(),
  sortBy: z.enum(['name', 'pricePerUnit', 'createdAt']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(10),
});
