import { z } from 'zod';
import { BiomassaType, BiocharGrade, ProductStatus, UnitStatus, ProductMode } from '#prisma';

const createStatusSchema = z.union([
  z.literal(ProductStatus.ACTIVE),
  z.literal(ProductStatus.DRAFT),
  z.literal(ProductStatus.INACTIVE),
]);

const updateStatusSchema = z.union([
  z.literal(ProductStatus.ACTIVE),
  z.literal(ProductStatus.DRAFT),
  z.literal(ProductStatus.OUT_OF_STOCK),
  z.literal(ProductStatus.INACTIVE),
]);

const customSpecItemSchema = z.object({
  label: z.string().min(1),
  value: z.string().min(1),
});

const specsSchema = z.preprocess((val) => {
  if (val === undefined || val === null || val === '') return undefined;
  if (typeof val === 'string') {
    try {
      return JSON.parse(val);
    } catch {
      return undefined;
    }
  }
  return val;
}, z.array(customSpecItemSchema).optional());

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

  // Organic Produce Mode fields
  productMode: z.nativeEnum(ProductMode).default(ProductMode.BIOMASS_MATERIAL),
  fertilizerType: z.string().optional(),
  isChemicalFree: z.preprocess((val) => val === 'true' || val === true, z.boolean()).default(false),
  cropType: z.string().optional(),
  specs: specsSchema,

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
  /** Urutan foto: JSON array existing/new (multipart) */
  imageOrder: z.string().optional(),
});

const sanitizeEmptyStrings = (raw: unknown) => {
  if (typeof raw !== 'object' || raw === null) return raw;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    out[key] = value === '' ? undefined : value;
  }
  return out;
};

export const updateProductSchema = z.preprocess(
  sanitizeEmptyStrings,
  createProductSchema.partial().extend({
    status: updateStatusSchema.optional(),
    syncImages: z.preprocess((val) => val === 'true' || val === true, z.boolean()).optional(),
    imageOrder: z.string().optional(),
    originalPrice: z.preprocess(
      (val) => (val === '' || val === null || val === 'null' ? null : val),
      z.coerce.number().positive().nullable().optional(),
    ),
  }),
);

export const productFilterSchema = z.object({
  search: z.string().optional(),
  userId: z.string().uuid('ID penyuplai tidak valid').or(z.literal('')).optional(),
  // Sync ProductStatus penuh untuk keperluan filter admin/supplier
  status: z.nativeEnum(ProductStatus).optional(),
  categoryId: z.string().uuid('ID Kategori tidak valid').or(z.literal('')).optional(),
  biomassaType: z.nativeEnum(BiomassaType).optional(),
  grade: z.nativeEnum(BiocharGrade).optional(),
  province: z.string().optional(),
  regency: z.string().optional(),
  minPrice: z.coerce.number().optional(),
  maxPrice: z.coerce.number().optional(),
  minStock: z.coerce.number().optional(),

  // Organic Produce filters
  productMode: z.nativeEnum(ProductMode).optional(),
  cropType: z.string().optional(),

  // Advanced Industrial Filters
  minRating: z.coerce.number().min(0).max(5).optional(),
  minCarbonPurity: z.coerce.number().min(0).max(100).optional(),
  maxMoistureContent: z.coerce.number().min(0).max(100).optional(),

  sortBy: z
    .enum(['name', 'pricePerUnit', 'createdAt', 'averageRating', 'totalSold'])
    .default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(10),
});
