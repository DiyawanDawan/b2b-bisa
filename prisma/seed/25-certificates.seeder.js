import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';
import logger from '#config/logger';
import * as storageService from '#services/storage.service';
import { ProductCertificateStatus } from '#prisma';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PRODUCT_CERT_TYPES = [
  { title: 'Sertifikat Mutu Produk', type: 'MUTU_PRODUK', issuer: 'BISA Agri Lab' },
  { title: 'Sertifikat Organik', type: 'ORGANIK', issuer: 'Lembaga Sertifikasi Pertanian' },
  { title: 'Sertifikat Carbon Credit', type: 'CARBON_CREDIT', issuer: 'BISA Carbon Unit' },
];

const STORE_CERT_TYPES = [
  { title: 'Sertifikat Toko Supplier Terverifikasi', type: 'TOKO_TERVERIFIKASI', issuer: 'BISA Agri' },
  { title: 'Izin Usaha Pertanian', type: 'IZIN_USAHA', issuer: 'Dinas Pertanian' },
  { title: 'Sertifikat Good Agricultural Practices', type: 'GAP', issuer: 'Gap Indonesia' },
];

function readAsset(fileName) {
  const assetPath = path.join(__dirname, 'assets', 'certificates', fileName);
  if (!fs.existsSync(assetPath)) {
    logger.warn(`⚠️ [25] Asset sertifikat tidak ditemukan: ${assetPath}`);
    return null;
  }
  const buffer = fs.readFileSync(assetPath);
  const sha256 = createHash('sha256').update(buffer).digest('hex');
  return { buffer, sha256, fileName, mimeType: 'image/png' };
}

async function uploadSeedCertificate(folder, ownerId, fileName, buffer, mimeType) {
  const key = `${folder}/seed/${ownerId}/${Date.now()}-${fileName}`;
  try {
    const stored = await storageService.uploadFile(buffer, key, mimeType);
    return storageService.normalizeStorageKey(stored) ?? stored;
  } catch (err) {
    logger.warn(`⚠️ [25] Upload sertifikat seed gagal (${fileName}): ${err?.message ?? err}`);
    return null;
  }
}

export async function seedCertificates(prisma, users) {
  logger.info('🌱 [25] Seeding product & store certificates...');

  const admin = await prisma.user.findFirst({
    where: { role: 'ADMIN' },
    select: { id: true },
  });
  const suppliers = users?.allSuppliers ?? [];
  if (suppliers.length === 0) {
    logger.warn('⚠️ [25] Lewati seed sertifikat — supplier tidak ditemukan.');
    return;
  }

  const productAsset = readAsset('product-certificate-template.png');
  const storeAsset = readAsset('store-certificate-template.png');

  const products = await prisma.product.findMany({
    where: { userId: { in: suppliers.map((s) => s.id) }, status: 'ACTIVE' },
    select: { id: true, name: true, userId: true },
    take: 24,
  });

  let productCertCount = 0;
  for (const [index, product] of products.entries()) {
    const presets = PRODUCT_CERT_TYPES.slice(0, index % 2 === 0 ? 2 : 1);
    for (const [presetIndex, preset] of presets.entries()) {
      const existing = await prisma.productCertificate.findFirst({
        where: { productId: product.id, certificateType: preset.type },
      });
      if (existing) continue;

      let storageKey = `general/seed-certificates/product-${product.id}-${preset.type}.png`;
      if (productAsset) {
        const uploaded = await uploadSeedCertificate(
          'product-certificates',
          product.userId,
          `product-${preset.type}.png`,
          productAsset.buffer,
          productAsset.mimeType,
        );
        if (uploaded) storageKey = uploaded;
      }

      await prisma.productCertificate.create({
        data: {
          productId: product.id,
          title: preset.title,
          certificateType: preset.type,
          issuerName: preset.issuer,
          certificateNumber: `BISA-CERT-2026-${String(productCertCount + 1).padStart(4, '0')}`,
          issuedAt: new Date(Date.now() - 120 * 24 * 60 * 60 * 1000),
          expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
          storageKey,
          fileName: `${preset.type.toLowerCase()}.png`,
          mimeType: 'image/png',
          fileSizeBytes: productAsset?.buffer.length ?? 512_000,
          sha256: productAsset?.sha256 ?? null,
          status: ProductCertificateStatus.APPROVED,
          reviewedById: admin?.id ?? null,
          reviewedAt: new Date(),
        },
      });
      productCertCount += 1;
    }

    const approvedCount = await prisma.productCertificate.count({
      where: {
        productId: product.id,
        status: ProductCertificateStatus.APPROVED,
      },
    });
    if (approvedCount > 0) {
      await prisma.product.update({
        where: { id: product.id },
        data: { isCertified: true },
      });
    }
  }

  let storeCertCount = 0;
  for (const [index, supplier] of suppliers.slice(0, 12).entries()) {
    const presets = STORE_CERT_TYPES.slice(0, index % 3 === 0 ? 2 : 1);
    for (const preset of presets) {
      const existing = await prisma.supplierStoreCertificate.findFirst({
        where: { supplierId: supplier.id, certificateType: preset.type },
      });
      if (existing) continue;

      let storageKey = `general/seed-certificates/store-${supplier.id}-${preset.type}.png`;
      if (storeAsset) {
        const uploaded = await uploadSeedCertificate(
          'store-certificates',
          supplier.id,
          `store-${preset.type}.png`,
          storeAsset.buffer,
          storeAsset.mimeType,
        );
        if (uploaded) storageKey = uploaded;
      }

      await prisma.supplierStoreCertificate.create({
        data: {
          supplierId: supplier.id,
          title: preset.title,
          certificateType: preset.type,
          issuerName: preset.issuer,
          certificateNumber: `BISA-STORE-2026-${String(storeCertCount + 1).padStart(4, '0')}`,
          issuedAt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
          expiresAt: new Date(Date.now() + 730 * 24 * 60 * 60 * 1000),
          storageKey,
          fileName: `${preset.type.toLowerCase()}.png`,
          mimeType: 'image/png',
          fileSizeBytes: storeAsset?.buffer.length ?? 512_000,
          sha256: storeAsset?.sha256 ?? null,
          status: ProductCertificateStatus.APPROVED,
          reviewedById: admin?.id ?? null,
          reviewedAt: new Date(),
        },
      });
      storeCertCount += 1;
    }
  }

  logger.info(
    `✅ [25] Sertifikat seed: ${productCertCount} produk, ${storeCertCount} toko supplier.`,
  );

  const allProducts = await prisma.product.findMany({ select: { id: true } });
  for (const product of allProducts) {
    const approvedCount = await prisma.productCertificate.count({
      where: {
        productId: product.id,
        status: ProductCertificateStatus.APPROVED,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
    });
    await prisma.product.update({
      where: { id: product.id },
      data: { isCertified: approvedCount > 0 },
    });
  }
  logger.info(
    `✅ [25] Reconcile isCertified untuk ${allProducts.length} produk dari sertifikat aktif.`,
  );
}
