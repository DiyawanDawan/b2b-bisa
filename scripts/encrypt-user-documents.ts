import prisma from '../src/config/prisma';
import logger from '../src/config/logger';
import { encryptField, isEncryptedPayload } from '../src/utils/encryption.util';

async function backfillEncryptUserDocuments() {
  const total = await prisma.userDocument.count();
  if (total === 0) {
    logger.info('   user_documents kosong, skip.');
    return;
  }

  let encryptedCount = 0;
  let skipCount = 0;
  let errorCount = 0;
  const BATCH = 200;

  for (let offset = 0; offset < total; offset += BATCH) {
    const rows = await prisma.userDocument.findMany({
      select: { id: true, title: true, fileUrl: true },
      skip: offset,
      take: BATCH,
    });

    for (const row of rows) {
      const updates = {};

      if (!isEncryptedPayload(row.title)) {
        updates.title = encryptField(row.title);
      }

      if (!isEncryptedPayload(row.fileUrl)) {
        updates.fileUrl = encryptField(row.fileUrl);
      }

      if (Object.keys(updates).length === 0) {
        skipCount++;
        continue;
      }

      try {
        await prisma.userDocument.update({
          where: { id: row.id },
          data: updates,
        });
        encryptedCount++;
      } catch (e) {
        logger.error(`   Gagal enkripsi user_document ${row.id}: ${e.message}`);
        errorCount++;
      }
    }
  }

  logger.info(
    `✅ user_documents: ${encryptedCount} dienkripsi, ${skipCount} sudah terenkripsi, ${errorCount} error.`,
  );
}

async function backfillMissingOrderSnapshot() {
  const missing = await prisma.order.count({
    where: { shippingAddressSnapshot: { equals: null } },
  });
  if (missing === 0) {
    logger.info('   Semua order sudah punya shipping_address_snapshot, skip.');
    return;
  }

  const orders = await prisma.order.findMany({
    where: { shippingAddressSnapshot: { equals: null } },
    include: {
      shippingAddress: {
        include: { province: { select: { name: true } }, regency: { select: { name: true } } },
      },
      buyer: { select: { fullName: true, email: true } },
    },
  });

  let fixed = 0;
  for (const order of orders) {
    const addr = order.shippingAddress;
    if (!addr) continue;

    const snapshot = {
      recipient: order.buyer?.fullName ?? 'Unknown',
      email: order.buyer?.email ?? '',
      address: addr.fullAddress ?? '',
      zipCode: addr.zipCode ?? '',
      province: addr.province?.name ?? '',
      regency: addr.regency?.name ?? '',
    };

    await prisma.order.update({
      where: { id: order.id },
      data: { shippingAddressSnapshot: snapshot },
    });
    fixed++;
  }

  logger.info(`✅ orders: ${fixed} shipping_address_snapshot ditambahkan.`);
}

async function main() {
  logger.info('🔐 [ENCRYPT-BACKFILL] Mulai enkripsi data sensitif...\n');

  await backfillEncryptUserDocuments();
  await backfillMissingOrderSnapshot();

  logger.info('\n🎉 [ENCRYPT-BACKFILL] Selesai.');
}

main()
  .catch((err) => {
    logger.error('[ENCRYPT-BACKFILL] Gagal:', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
