import { z } from 'zod';

export const withdrawRequestSchema = z.object({
  amount: z.coerce.number().positive('Jumlah pencairan harus lebih dari 0'),
  bankCode: z.string().min(1, 'Kode bank tidak boleh kosong'),
  accountNo: z.string().min(5, 'Nomor rekening terlalu pendek'),
  accountName: z.string().min(3, 'Nama pemilik rekening wajib diisi sesuai KTP/Buku Bank'),
});

export const createPayoutAccountSchema = z.object({
  bankId: z.string().uuid('Bank ID harus berupa UUID yang valid'),
  accountNumber: z.string().min(5, 'Nomor rekening terlalu pendek'),
  accountName: z.string().min(3, 'Nama pemilik rekening wajib diisi'),
  isMain: z.boolean().optional(),
});
