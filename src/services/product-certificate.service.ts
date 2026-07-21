import prisma from '#config/prisma';
import AppError from '#utils/appError';
import {
  MediaUploadSessionStatus,
  NotificationPriority,
  NotificationType,
  Prisma,
  ProductCertificateStatus,
  ProductStatus,
} from '#prisma';
import * as storageService from '#services/storage.service';
import { createNotification } from '#services/notification.service';
import { createHash } from 'crypto';

const publicCertificateSelect = {
  id: true,
  productId: true,
  title: true,
  certificateType: true,
  issuerName: true,
  certificateNumber: true,
  issuedAt: true,
  expiresAt: true,
  mimeType: true,
  fileName: true,
  reviewedAt: true,
} satisfies Prisma.ProductCertificateSelect;

const activeApprovedWhere = () => ({
  status: ProductCertificateStatus.APPROVED,
  OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
});

const computeStorageSha256 = async (storageKey: string): Promise<string> => {
  const file = await storageService.getFileStream(storageKey);
  if (!file) throw new AppError('Dokumen sertifikat tidak dapat dibaca dari penyimpanan.', 500);
  const hash = createHash('sha256');
  for await (const chunk of file.stream) {
    hash.update(chunk);
  }
  return hash.digest('hex');
};

const loadOwnedProduct = async (productId: string, userId: string, isAdmin = false) => {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true, userId: true, name: true },
  });
  if (!product) throw new AppError('Produk tidak ditemukan.', 404);
  if (!isAdmin && product.userId !== userId) {
    throw new AppError('Anda tidak memiliki akses ke produk ini.', 403);
  }
  return product;
};

export const submitCertificate = async (
  productId: string,
  userId: string,
  isAdmin: boolean,
  data: {
    title: string;
    certificateType: string;
    issuerName?: string;
    certificateNumber?: string;
    issuedAt?: Date;
    expiresAt?: Date;
    storageKey: string;
  },
) => {
  await loadOwnedProduct(productId, userId, isAdmin);
  const normalizedKey = storageService.normalizeStorageKey(data.storageKey) ?? data.storageKey;
  const session = await prisma.mediaUploadSession.findFirst({
    where: {
      userId,
      folder: 'product-certificates',
      status: MediaUploadSessionStatus.COMPLETED,
      OR: [{ finalPath: normalizedKey }, { r2Key: normalizedKey }],
    },
    orderBy: { updatedAt: 'desc' },
  });
  if (!session) {
    throw new AppError('Dokumen belum selesai diunggah atau bukan milik Anda.', 400);
  }

  const existingCount = await prisma.productCertificate.count({ where: { productId } });
  if (existingCount >= 20) {
    throw new AppError('Maksimal 20 sertifikat per produk.', 400);
  }
  const sha256 = await computeStorageSha256(normalizedKey);

  return prisma.productCertificate.create({
    data: {
      productId,
      title: data.title,
      certificateType: data.certificateType,
      issuerName: data.issuerName,
      certificateNumber: data.certificateNumber,
      issuedAt: data.issuedAt,
      expiresAt: data.expiresAt,
      storageKey: normalizedKey,
      fileName: session.fileName,
      mimeType: session.mimeType,
      fileSizeBytes: session.totalBytes,
      sha256,
    },
  });
};

export const listOwnerCertificates = async (productId: string, userId: string, isAdmin = false) => {
  await loadOwnedProduct(productId, userId, isAdmin);
  const rows = await prisma.productCertificate.findMany({
    where: { productId },
    orderBy: { createdAt: 'desc' },
  });
  return rows.map((row) => ({ ...row, fileSizeBytes: Number(row.fileSizeBytes) }));
};

export const deleteOwnerCertificate = async (
  productId: string,
  certificateId: string,
  userId: string,
  isAdmin = false,
) => {
  await loadOwnedProduct(productId, userId, isAdmin);
  const certificate = await prisma.productCertificate.findFirst({
    where: { id: certificateId, productId },
  });
  if (!certificate) throw new AppError('Sertifikat tidak ditemukan.', 404);
  if (certificate.status === ProductCertificateStatus.APPROVED) {
    throw new AppError('Sertifikat yang sudah disetujui tidak dapat dihapus oleh supplier.', 409);
  }
  await prisma.productCertificate.delete({ where: { id: certificateId } });
  void storageService.deleteFile(certificate.storageKey);
};

export const listPublicProductCertificates = (productId: string) =>
  prisma.productCertificate.findMany({
    where: { productId, ...activeApprovedWhere() },
    select: publicCertificateSelect,
    orderBy: { reviewedAt: 'desc' },
  });

export const getPublicCertificateDocument = async (productId: string, certificateId: string) => {
  const certificate = await prisma.productCertificate.findFirst({
    where: { id: certificateId, productId, ...activeApprovedWhere() },
    select: { storageKey: true },
  });
  if (!certificate) throw new AppError('Sertifikat tidak ditemukan atau tidak berlaku.', 404);
  return storageService.getSignedProxyUrl(certificate.storageKey, 300);
};

export const listPublicSupplierCertificates = async (
  supplierId: string,
  page: number,
  limit: number,
) => {
  const supplier = await prisma.user.findFirst({
    where: { id: supplierId, role: 'SUPPLIER', isPublicInMarketplace: true },
    select: { id: true },
  });
  if (!supplier) throw new AppError('Supplier tidak ditemukan.', 404);
  const where: Prisma.ProductCertificateWhereInput = {
    ...activeApprovedWhere(),
    product: { userId: supplierId, status: ProductStatus.ACTIVE },
  };
  const [rows, total] = await Promise.all([
    prisma.productCertificate.findMany({
      where,
      select: {
        ...publicCertificateSelect,
        product: { select: { id: true, name: true, thumbnailUrl: true } },
      },
      orderBy: { reviewedAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.productCertificate.count({ where }),
  ]);
  return { rows, total };
};

export const listAdminQueue = async (params: {
  status?: ProductCertificateStatus;
  search?: string;
  page: number;
  limit: number;
}) => {
  const where: Prisma.ProductCertificateWhereInput = {
    status: params.status,
    ...(params.search
      ? {
          OR: [
            { title: { contains: params.search } },
            { certificateNumber: { contains: params.search } },
            { product: { name: { contains: params.search } } },
          ],
        }
      : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.productCertificate.findMany({
      where,
      include: {
        product: {
          select: {
            id: true,
            name: true,
            thumbnailUrl: true,
            user: { select: { id: true, fullName: true, email: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip: (params.page - 1) * params.limit,
      take: params.limit,
    }),
    prisma.productCertificate.count({ where }),
  ]);
  return {
    rows: rows.map((row) => ({ ...row, fileSizeBytes: Number(row.fileSizeBytes) })),
    total,
  };
};

export const getAdminDetail = async (certificateId: string) => {
  const row = await prisma.productCertificate.findUnique({
    where: { id: certificateId },
    include: {
      product: {
        select: {
          id: true,
          name: true,
          thumbnailUrl: true,
          user: { select: { id: true, fullName: true, email: true } },
        },
      },
      reviewedBy: { select: { id: true, fullName: true } },
    },
  });
  if (!row) throw new AppError('Sertifikat tidak ditemukan.', 404);
  return {
    ...row,
    fileSizeBytes: Number(row.fileSizeBytes),
    documentUrl: storageService.getSignedProxyUrl(row.storageKey, 900),
    storageKey: undefined,
  };
};

export const reviewCertificate = async (
  certificateId: string,
  adminId: string,
  status: 'APPROVED' | 'REJECTED',
  rejectionReason?: string,
) => {
  if (status === ProductCertificateStatus.REJECTED && !rejectionReason?.trim()) {
    throw new AppError('Alasan penolakan wajib diisi.', 400);
  }
  const result = await prisma.$transaction(async (tx) => {
    const current = await tx.productCertificate.findUnique({
      where: { id: certificateId },
      include: { product: { select: { id: true, userId: true, name: true } } },
    });
    if (!current) throw new AppError('Sertifikat tidak ditemukan.', 404);
    if (current.status !== ProductCertificateStatus.PENDING) {
      throw new AppError('Sertifikat ini sudah pernah ditinjau.', 409);
    }
    const claimed = await tx.productCertificate.updateMany({
      where: { id: certificateId, status: ProductCertificateStatus.PENDING },
      data: {
        status,
        reviewedById: adminId,
        reviewedAt: new Date(),
        rejectionReason:
          status === ProductCertificateStatus.REJECTED ? rejectionReason?.trim() : null,
      },
    });
    if (claimed.count !== 1) {
      throw new AppError('Sertifikat ini sudah ditinjau oleh admin lain.', 409);
    }
    const updated = await tx.productCertificate.findUniqueOrThrow({
      where: { id: certificateId },
    });
    const approvedCount = await tx.productCertificate.count({
      where: { productId: current.productId, ...activeApprovedWhere() },
    });
    await tx.product.update({
      where: { id: current.productId },
      data: { isCertified: approvedCount > 0 },
    });
    await tx.auditLog.create({
      data: {
        userId: adminId,
        action: 'REVIEW_PRODUCT_CERTIFICATE',
        entity: 'PRODUCT_CERTIFICATE',
        entityId: certificateId,
        oldValue: { status: current.status },
        newValue: { status, rejectionReason: rejectionReason ?? null },
      },
    });
    return { updated, product: current.product };
  });

  void createNotification({
    userId: result.product.userId,
    title:
      status === ProductCertificateStatus.APPROVED
        ? 'Sertifikat produk disetujui'
        : 'Sertifikat produk perlu diperbaiki',
    body:
      status === ProductCertificateStatus.APPROVED
        ? `Sertifikat untuk "${result.product.name}" telah diverifikasi admin BISA.`
        : `Sertifikat untuk "${result.product.name}" ditolak. Alasan: ${rejectionReason}`,
    type: NotificationType.PRODUCT_CERTIFICATE,
    priority:
      status === ProductCertificateStatus.APPROVED
        ? NotificationPriority.MEDIUM
        : NotificationPriority.HIGH,
    refId: result.product.id,
  });
  return result.updated;
};
