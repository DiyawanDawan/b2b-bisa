import logger from '../../src/config/logger.js';

export async function seedMediaUploadSessions(prisma, users) {
  logger.info('🌱 [33] Seeding media upload sessions...');

  const existing = await prisma.mediaUploadSession.count();
  if (existing > 0) {
    logger.info('   ↳ Media upload sessions already seeded, skipping (data tidak dihapus)...');
    return;
  }

  const supplier = users?.siti ?? users?.allSuppliers?.[0];
  const buyer = users?.hendra ?? users?.allBuyers?.[0];

  if (!supplier) {
    logger.warn('⚠️ [33] Supplier tidak ditemukan — media upload dilewati.');
    return;
  }

  const now = new Date();
  const future = new Date(now.getTime() + 24 * 60 * 60 * 1000); // +24 jam
  const past = new Date(now.getTime() - 2 * 60 * 60 * 1000);    // -2 jam

  const sessions = [
    {
      userId: supplier.id,
      folder: 'products',
      fileName: 'product-banner-hq.jpg',
      mimeType: 'image/jpeg',
      totalBytes: 5_242_880n, // 5 MB
      partSize: 5_242_880,
      totalParts: 1,
      r2UploadId: 'seed-upload-001',
      r2Key: 'seed/products/product-banner-hq.jpg',
      status: 'COMPLETED',
      completedParts: JSON.stringify([{ PartNumber: 1, ETag: '"seed-etag-001"' }]),
      finalPath: 'https://r2.bisa.id/products/product-banner-hq.jpg',
      expiresAt: future,
    },
    {
      userId: supplier.id,
      folder: 'documents',
      fileName: 'certificate.pdf',
      mimeType: 'application/pdf',
      totalBytes: 1_048_576n, // 1 MB
      partSize: 1_048_576,
      totalParts: 1,
      r2UploadId: 'seed-upload-002',
      r2Key: 'seed/documents/certificate.pdf',
      status: 'COMPLETED',
      completedParts: JSON.stringify([{ PartNumber: 1, ETag: '"seed-etag-002"' }]),
      finalPath: 'https://r2.bisa.id/documents/certificate.pdf',
      expiresAt: future,
    },
    {
      userId: supplier.id,
      folder: 'products',
      fileName: 'bulk-biomass-photo.png',
      mimeType: 'image/png',
      totalBytes: 10_485_760n, // 10 MB, 2 part
      partSize: 5_242_880,
      totalParts: 2,
      r2UploadId: 'seed-upload-003',
      r2Key: 'seed/products/bulk-biomass-photo.png',
      status: 'UPLOADING',
      completedParts: JSON.stringify([{ PartNumber: 1, ETag: '"seed-etag-003a"' }]),
      finalPath: null,
      expiresAt: future,
    },
    {
      userId: supplier.id,
      folder: 'store',
      fileName: 'old-banner.jpg',
      mimeType: 'image/jpeg',
      totalBytes: 2_621_440n, // 2.5 MB
      partSize: 2_621_440,
      totalParts: 1,
      r2UploadId: 'seed-upload-004',
      r2Key: 'seed/store/old-banner.jpg',
      status: 'EXPIRED',
      completedParts: JSON.stringify([]),
      finalPath: null,
      expiresAt: past,
    },
    {
      userId: supplier.id,
      folder: 'products',
      fileName: 'aborted-upload.raw',
      mimeType: 'application/octet-stream',
      totalBytes: 50_000_000n, // 50 MB
      partSize: 5_242_880,
      totalParts: 10,
      r2UploadId: 'seed-upload-005',
      r2Key: 'seed/products/aborted-upload.raw',
      status: 'ABORTED',
      completedParts: JSON.stringify([{ PartNumber: 1, ETag: '"seed-etag-005a"' }]),
      finalPath: null,
      expiresAt: future,
    },
  ];

  if (buyer) {
    sessions.push({
      userId: buyer.id,
      folder: 'kyc',
      fileName: 'selfie-verification.jpg',
      mimeType: 'image/jpeg',
      totalBytes: 3_145_728n, // 3 MB
      partSize: 3_145_728,
      totalParts: 1,
      r2UploadId: 'seed-upload-006',
      r2Key: 'seed/kyc/selfie-verification.jpg',
      status: 'INIT',
      completedParts: JSON.stringify([]),
      finalPath: null,
      expiresAt: future,
    });
  }

  for (const session of sessions) {
    await prisma.mediaUploadSession.create({ data: session });
  }

  logger.info(`✅ [33] ${sessions.length} media upload sessions seeded.`);
}
