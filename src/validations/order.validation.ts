import { z } from 'zod';
import { ProductMode } from '#prisma';
import { shippingSelectionSchema } from '#validations/shipping.validation';

const shippingSnapshotSchema = z.object({
  recipient: z.string().min(1, 'Nama penerima wajib diisi').optional(),
  phone: z.string().optional(),
  email: z.string().email('Email tidak valid').optional(),
  address: z.string().min(10, 'Alamat pengiriman harus lengkap (minimal 10 karakter)').optional(),
  zipCode: z.string().optional(),
  province: z.string().optional(),
  regency: z.string().optional(),
  latitude: z.coerce.number().optional(),
  longitude: z.coerce.number().optional(),
  source: z.enum(['buyer_profile', 'buyer_saved_address', 'custom']).optional(),
  customerAddressId: z.string().uuid().optional(),
});

export const invoicePreviewBodySchema = z.object({
  shippingSelection: shippingSelectionSchema.optional(),
  shippingSnapshot: shippingSnapshotSchema.optional(),
  quantity: z.coerce.number().positive('Kuantitas harus lebih dari 0').optional(),
  pricePerUnit: z.coerce.number().positive('Harga per unit harus lebih dari 0').optional(),
});

export const createContractSchema = z.object({
  negotiationId: z.string().uuid('Negotiation ID harus berupa UUID yang valid'),
  shippingAddress: z
    .string()
    .min(10, 'Alamat pengiriman harus lengkap (minimal 10 karakter)')
    .optional(),
  shippingSnapshot: shippingSnapshotSchema.optional(),
  shippingSelection: shippingSelectionSchema.optional(),
  specifications: z.string().max(2000, 'Catatan/spesifikasi terlalu panjang').optional(),
  quantity: z.coerce.number().positive('Kuantitas harus lebih dari 0').optional(),
  pricePerUnit: z.coerce.number().positive('Harga per unit harus lebih dari 0').optional(),
});

export const updatePendingInvoiceSchema = z.object({
  shippingSnapshot: shippingSnapshotSchema.optional(),
  specifications: z.string().max(2000, 'Catatan/spesifikasi terlalu panjang').optional(),
});

export const createDirectOrderSchema = z.object({
  items: z
    .array(
      z.object({
        productId: z.string().uuid('Product ID harus berupa UUID yang valid'),
        quantity: z.coerce.number().positive('Kuantitas harus lebih dari 0'),
      }),
    )
    .min(1, 'Minimal pilih 1 produk untuk checkout')
    .max(50, 'Maksimal 50 produk per checkout'),
  shippingAddress: z
    .string()
    .min(10, 'Alamat pengiriman harus lengkap (minimal 10 karakter)')
    .optional(),
  shippingSnapshot: shippingSnapshotSchema.optional(),
  shippingSelections: z
    .array(
      shippingSelectionSchema.extend({
        sellerId: z.string().uuid('Seller ID harus UUID'),
      }),
    )
    .optional(),
  notes: z.string().max(500, 'Catatan terlalu panjang').optional(),
  orderType: z.enum(['STANDARD', 'SAMPLE']).optional().default('STANDARD'),
  voucherCode: z.string().min(2).max(50).optional(),
});

export const previewDirectOrderFromCartQuerySchema = z.object({
  query: z.object({
    shippingAddress: z
      .string()
      .min(10, 'Alamat pengiriman harus lengkap (minimal 10 karakter)')
      .optional(),
  }),
});

export const updateTrackingSchema = z.object({
  vesselName: z.string().min(3, 'Nama Kapal/Kendaraan ekspedisi harus jelas'),
  originHub: z.string().optional(),
  destinationHub: z.string().optional(),
  latitude: z.coerce.number().optional(),
  longitude: z.coerce.number().optional(),
  awbNumber: z.string().min(5, 'Nomor resi tidak valid').optional(),
  courierCode: z.string().min(2).optional(),
  recipientPhoneLast5: z
    .string()
    .regex(/^\d{5}$/)
    .optional(),
});

export const initializePaymentSchema = z.object({
  channelCode: z.string().max(20, 'Kode channel terlalu panjang').optional(),
  /** Ganti metode bayar: reset inisialisasi lama (hanya order PENDING). */
  forceNew: z.boolean().optional(),
});

/** Satu pembayaran untuk semua pesanan dari checkout yang sama (multi-supplier). */
export const batchCheckoutPaymentSchema = z.object({
  orderIds: z
    .array(z.string().uuid('Order ID harus UUID'))
    .min(1, 'Minimal 1 pesanan')
    .max(50, 'Maksimal 50 pesanan per checkout'),
  channelCode: z.string().max(20, 'Kode channel terlalu panjang').optional(),
  forceNew: z.boolean().optional(),
});

export const batchSimulatePaymentSchema = z.object({
  orderIds: z
    .array(z.string().uuid('Order ID harus UUID'))
    .min(1, 'Minimal 1 pesanan')
    .max(50, 'Maksimal 50 pesanan per checkout'),
});

const disputeEvidenceUrlSchema = z
  .string()
  .min(3, 'Path bukti tidak valid')
  .refine(
    (value) => {
      if (value.startsWith('http://') || value.startsWith('https://')) {
        try {
          new URL(value);
          return true;
        } catch {
          return false;
        }
      }
      return /^[\w\-./]+$/.test(value);
    },
    { message: 'URL bukti tidak valid' },
  );

export const raiseDisputeSchema = z.object({
  reason: z.string().min(10, 'Alasan sengketa harus jelas (minimal 10 karakter)'),
  description: z.string().max(2000, 'Deskripsi terlalu panjang').optional(),
  evidenceUrls: z
    .array(disputeEvidenceUrlSchema)
    .max(5, 'Maksimal 5 foto bukti')
    .optional(),
});

export const respondDisputeSchema = z.object({
  response: z.string().min(10, 'Tanggapan minimal 10 karakter'),
  evidenceUrls: z
    .array(disputeEvidenceUrlSchema)
    .max(5, 'Maksimal 5 foto bukti')
    .optional(),
});

export const listOrdersSchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).optional().default(1),
    limit: z.coerce.number().int().min(1).max(100).optional().default(20),
    status: z.string().optional(),
    search: z.string().optional(),
    productMode: z.nativeEnum(ProductMode).optional(),
    orderType: z.enum(['STANDARD', 'SAMPLE']).optional(),
  }),
});

export const orderStatusCountsSchema = z.object({
  query: z.object({
    search: z.string().optional(),
    productMode: z.nativeEnum(ProductMode).optional(),
    orderType: z.enum(['STANDARD', 'SAMPLE']).optional(),
  }),
});
