import logger from '../../src/config/logger.js';

/**
 * Ringkasan jumlah data setelah seed — untuk validasi cepat.
 */
export async function seedSummary(prisma) {
  logger.info('📊 [18] Validasi ringkasan data seed...');

  const [
    users,
    suppliers,
    products,
    productSpecs,
    storeBanners,
    iotDevices,
    iotReadings,
    negotiations,
    orders,
    faqs,
    categories,
    collections,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { role: 'SUPPLIER' } }),
    prisma.product.count(),
    prisma.productSpec.count(),
    prisma.storeBanner.count(),
    prisma.iotDevice.count(),
    prisma.iotReading.count(),
    prisma.negotiation.count(),
    prisma.order.count(),
    prisma.faq.count(),
    prisma.category.count(),
    prisma.productCollection.count(),
  ]);

  const summary = {
    users,
    suppliers,
    products,
    productSpecs,
    storeBanners,
    iotDevices,
    iotReadings,
    negotiations,
    orders,
    faqs,
    categories,
    collections,
  };

  logger.info('📊 Seed summary:', summary);

  const warnings = [];
  if (suppliers === 0) warnings.push('Tidak ada supplier');
  if (products === 0) warnings.push('Tidak ada produk');
  if (productSpecs === 0) warnings.push('Tidak ada product_specs');
  if (storeBanners === 0) warnings.push('Tidak ada store_banners');
  if (iotDevices === 0) warnings.push('Tidak ada perangkat IoT');
  if (faqs === 0) warnings.push('Tidak ada FAQ');

  const suppliersMissingActiveBanner = await prisma.user.count({
    where: {
      role: 'SUPPLIER',
      storeBanners: { none: { isActive: true } },
    },
  });

  if (suppliers > 0 && suppliersMissingActiveBanner > 0) {
    warnings.push(`${suppliersMissingActiveBanner} supplier tanpa banner toko aktif`);
  }

  if (warnings.length > 0) {
    logger.warn(`⚠️ [18] Data belum lengkap: ${warnings.join(', ')}`);
  } else {
    logger.info('✅ [18] Semua modul inti memiliki data seed.');
  }

  return summary;
}
