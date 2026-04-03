import prisma from '#config/prisma';
import AppError from '#utils/appError';

/**
 * Mendapatkan semua bank yang didukung oleh sistem.
 */
export const getAllBanks = async (onlyActive = true) => {
  return await prisma.bank.findMany({
    where: onlyActive ? { isActive: true } : {},
    orderBy: { name: 'asc' },
  });
};

/**
 * [Admin] Menambah bank baru.
 */
export const createBank = async (data: { code: string; name: string; logoUrl?: string }) => {
  const existing = await prisma.bank.findUnique({ where: { code: data.code } });
  if (existing) throw new AppError('Kode bank sudah ada', 400);

  return await prisma.bank.create({ data });
};

/**
 * [Admin] Update info bank.
 */
export const updateBank = async (id: string, data: any) => {
  return await prisma.bank.update({
    where: { id },
    data,
  });
};

/**
 * [Admin] Hapus bank.
 */
export const deleteBank = async (id: string) => {
  // Cek apakah sudah ada rekening yang pakai bank ini
  const inUse = await prisma.userBankAccount.findFirst({ where: { bankId: id } });
  if (inUse) throw new AppError('Bank tidak bisa dihapus karena sudah digunakan oleh user', 400);

  return await prisma.bank.delete({ where: { id } });
};
