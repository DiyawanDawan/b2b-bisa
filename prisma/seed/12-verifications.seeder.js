import logger from '../../src/config/logger.js';
import { sealBusinessAddress } from '../../src/utils/piiField.util.ts';

export async function seedVerifications(prisma) {
  logger.info('🌱 [12] Seeding User Verifications for Suppliers...');

  const admin = await prisma.user.findFirst({
    where: { role: 'ADMIN' },
    select: { id: true },
  });

  const allSuppliers = await prisma.user.findMany({
    where: { role: 'SUPPLIER' },
    orderBy: { createdAt: 'asc' },
  });

  if (allSuppliers.length === 0) {
    logger.warn('⚠️ No suppliers found to verify. Run users seeder first.');
    return;
  }

  for (let i = 0; i < allSuppliers.length; i++) {
    const supplier = allSuppliers[i];

    // Keep demo elite suppliers verified; reserve a few for PENDING/REJECTED admin queues.
    let verificationStatus = 'VERIFIED';
    let isVerified = true;
    let rejectionReason = null;
    let reviewedAt = new Date();
    let reviewedBy = admin?.id ?? null;

    if (supplier.email === 'siti.aminah@agritech.com' || supplier.email === 'hello@greenearth.co') {
      verificationStatus = 'VERIFIED';
    } else if (i === allSuppliers.length - 1) {
      verificationStatus = 'REJECTED';
      isVerified = false;
      rejectionReason = '[SEED] Dokumen KTP tidak jelas / tidak cocok dengan selfie.';
    } else if (i === allSuppliers.length - 2 || i % 7 === 3) {
      verificationStatus = 'PENDING';
      isVerified = false;
      reviewedAt = null;
      reviewedBy = null;
      rejectionReason = null;
    }

    await prisma.userVerification.upsert({
      where: { userId: supplier.id },
      update: {
        isVerified,
        verificationStatus,
        reviewedAt,
        reviewedBy,
        rejectionReason,
        businessName: supplier.fullName,
        businessAddress: sealBusinessAddress('Verified Hub Area'),
        ktpUrl: 'https://bisa.es/docs/ktp_sample.jpg',
        selfieUrl: 'https://bisa.es/docs/selfie_sample.jpg',
      },
      create: {
        userId: supplier.id,
        isVerified,
        verificationStatus,
        reviewedAt,
        reviewedBy,
        rejectionReason,
        businessName: supplier.fullName,
        businessAddress: sealBusinessAddress('Verified Hub Area'),
        ktpUrl: 'https://bisa.es/docs/ktp_sample.jpg',
        selfieUrl: 'https://bisa.es/docs/selfie_sample.jpg',
      },
    });
  }

  const counts = await prisma.userVerification.groupBy({
    by: ['verificationStatus'],
    _count: { _all: true },
  });
  logger.info(
    `✅ [12] KYC seeded for ${allSuppliers.length} suppliers: ${counts
      .map((c) => `${c.verificationStatus}=${c._count._all}`)
      .join(', ')}`,
  );
}
