import logger from '../../src/config/logger.js';

export async function seedVerifications(prisma) {
  logger.info('🌱 [12] Seeding User Verifications for Suppliers...');

  const allSuppliers = await prisma.user.findMany({
    where: { role: 'SUPPLIER' },
  });

  if (allSuppliers.length === 0) {
    logger.warn('⚠️ No suppliers found to verify. Run users seeder first.');
    return;
  }

  for (const supplier of allSuppliers) {
    await prisma.userVerification.upsert({
      where: { userId: supplier.id },
      update: {
        isVerified: true,
        verificationStatus: 'VERIFIED',
        reviewedAt: new Date(),
      },
      create: {
        userId: supplier.id,
        isVerified: true,
        verificationStatus: 'VERIFIED',
        reviewedAt: new Date(),
        businessName: supplier.fullName,
        businessAddress: 'Verified Hub Area',
        ktpUrl: 'https://bisa.es/docs/ktp_sample.jpg',
        selfieUrl: 'https://bisa.es/docs/selfie_sample.jpg',
      },
    });
  }

  logger.info(`✅ [12] Successfully verified ${allSuppliers.length} suppliers.`);
}
