import { ProductCertificateStatus, Prisma } from '#prisma';
import prisma from '#config/prisma';

/** Approved and not expired. */
export const activeApprovedCertificateWhere = () => ({
  status: ProductCertificateStatus.APPROVED,
  OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
});

/** Normalize Prisma certificate row for JSON (BigInt → number). */
export const serializeCertificateRow = <T extends { fileSizeBytes?: bigint | number }>(
  row: T,
): T & { fileSizeBytes: number } => ({
  ...row,
  fileSizeBytes: Number(row.fileSizeBytes ?? 0),
});

type PrismaTx = Prisma.TransactionClient;

const db = (tx?: PrismaTx) => tx ?? prisma;

/** Reconcile cached product badge from active approved certificate records. */
export const syncProductIsCertifiedFlag = async (productId: string, tx?: PrismaTx) => {
  const approvedCount = await db(tx).productCertificate.count({
    where: { productId, ...activeApprovedCertificateWhere() },
  });
  await db(tx).product.update({
    where: { id: productId },
    data: { isCertified: approvedCount > 0 },
  });
  return approvedCount > 0;
};

/** Prevent reusing the same uploaded file for multiple certificate rows. */
export const assertCertificateStorageKeyUnused = async (storageKey: string, tx?: PrismaTx) => {
  const [productUse, storeUse] = await Promise.all([
    db(tx).productCertificate.count({ where: { storageKey } }),
    db(tx).supplierStoreCertificate.count({ where: { storageKey } }),
  ]);
  if (productUse + storeUse > 0) {
    throw new Error('STORAGE_KEY_ALREADY_USED');
  }
};

/** Backfill all products after seed or migration. */
export const reconcileAllProductCertifiedFlags = async () => {
  const products = await prisma.product.findMany({ select: { id: true } });
  for (const product of products) {
    await syncProductIsCertifiedFlag(product.id);
  }
  return products.length;
};
