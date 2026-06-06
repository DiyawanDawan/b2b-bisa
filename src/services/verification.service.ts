import prisma from '#config/prisma';
import AppError from '#utils/appError';
import { VerificationStatus } from '#prisma';

export const submitVerification = async (
  userId: string,
  data: {
    ktpUrl?: string;
    nibUrl?: string;
    selfieUrl?: string;
    siupUrl?: string;
    businessName?: string;
    taxId?: string;
    businessAddress?: string;
  },
) => {
  if (!data.ktpUrl && !data.nibUrl && !data.selfieUrl && !data.siupUrl) {
    throw new AppError('Upload minimal satu dokumen.', 400);
  }

  return prisma.userVerification.upsert({
    where: { userId },
    create: { userId, ...data, verificationStatus: VerificationStatus.PENDING, isVerified: false },
    update: { ...data, verificationStatus: VerificationStatus.PENDING, isVerified: false },
  });
};

export const getPendingVerifications = async () => {
  return prisma.userVerification.findMany({
    where: { verificationStatus: VerificationStatus.PENDING },
    select: {
      id: true,
      userId: true,
      ktpUrl: true,
      nibUrl: true,
      selfieUrl: true,
      siupUrl: true,
      businessName: true,
      taxId: true,
      businessAddress: true,
      verificationStatus: true,
      isVerified: true,
      createdAt: true,
      user: {
        select: { id: true, fullName: true, email: true, role: true, phone: true },
      },
    },
    orderBy: { createdAt: 'asc' },
  });
};

export const updateVerificationStatus = async (
  userId: string,
  status: 'VERIFIED' | 'REJECTED',
  adminId: string,
  rejectionReason?: string,
) => {
  const verification = await prisma.userVerification.findUnique({ where: { userId } });
  if (!verification) throw new AppError('Data verifikasi tidak ditemukan.', 404);

  return prisma.userVerification.update({
    where: { userId },
    data: {
      verificationStatus: status as VerificationStatus,
      isVerified: status === 'VERIFIED',
      rejectionReason: status === 'REJECTED' ? rejectionReason : null,
      reviewedBy: adminId,
      reviewedAt: new Date(),
    },
  });
};

export const sendVerificationCode = async (_userId: string, _type: string, _target?: string) => {
  // TODO: Implement actual OTP sending via SMS gateway (e.g., Twilio, Vonage, SMSOTP)
  // For now, throw clear error to prevent misuse
  throw new AppError(
    'Verifikasi nomor telepon belum tersedia. Gunakan verifikasi email atau hubungi admin.',
    501,
  );
};

export const verifyCode = async (
  _userId: string,
  _type: string,
  _code: string,
  _target?: string,
) => {
  // TODO: Implement actual OTP verification
  throw new AppError(
    'Verifikasi nomor telepon belum tersedia. Gunakan verifikasi email atau hubungi admin.',
    501,
  );
};
