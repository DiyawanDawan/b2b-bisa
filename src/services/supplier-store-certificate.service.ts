import prisma from '#config/prisma';
import AppError from '#utils/appError';
import {
  MediaUploadSessionStatus,
  NotificationPriority,
  NotificationType,
  Prisma,
  ProductCertificateStatus,
  UserRole,
} from '#prisma';
import * as storageService from '#services/storage.service';
import { createNotification } from '#services/notification.service';
import { createHash } from 'crypto';
import {
  activeApprovedCertificateWhere,
  assertCertificateStorageKeyUnused,
  serializeCertificateRow,
} from '#utils/certificate.util';

const publicStoreCertificateSelect = {
  id: true,
  supplierId: true,
  title: true,
  certificateType: true,
  issuerName: true,
  certificateNumber: true,
  issuedAt: true,
  expiresAt: true,
  mimeType: true,
  fileName: true,
  reviewedAt: true,
} satisfies Prisma.SupplierStoreCertificateSelect;

const computeStorageSha256 = async (storageKey: string): Promise<string> => {
  const file = await storageService.getFileStream(storageKey);
  if (!file) throw new AppError('Dokumen sertifikat tidak dapat dibaca dari penyimpanan.', 500);
  const hash = createHash('sha256');
  for await (const chunk of file.stream) {
    hash.update(chunk);
  }
  return hash.digest('hex');
};

const loadSupplier = async (supplierId: string, userId: string, isAdmin = false) => {
  const supplier = await prisma.user.findUnique({
    where: { id: supplierId },
    select: { id: true, role: true, fullName: true },
  });
  if (!supplier || supplier.role !== UserRole.SUPPLIER) {
    throw new AppError('Supplier tidak ditemukan.', 404);
  }
  if (!isAdmin && supplier.id !== userId) {
    throw new AppError('Anda tidak memiliki akses ke sertifikat toko ini.', 403);
  }
  return supplier;
};

export const submitStoreCertificate = async (
  supplierId: string,
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
  await loadSupplier(supplierId, userId, isAdmin);
  const normalizedKey = storageService.normalizeStorageKey(data.storageKey) ?? data.storageKey;
  const session = await prisma.mediaUploadSession.findFirst({
    where: {
      userId,
      folder: 'store-certificates',
      status: MediaUploadSessionStatus.COMPLETED,
      OR: [{ finalPath: normalizedKey }, { r2Key: normalizedKey }],
    },
    orderBy: { updatedAt: 'desc' },
  });
  if (!session) {
    throw new AppError('Dokumen belum selesai diunggah atau bukan milik Anda.', 400);
  }

  return prisma.$transaction(async (tx) => {
    const existingCount = await tx.supplierStoreCertificate.count({ where: { supplierId } });
    if (existingCount >= 20) {
      throw new AppError('Maksimal 20 sertifikat toko per supplier.', 400);
    }
    try {
      await assertCertificateStorageKeyUnused(normalizedKey, tx);
    } catch {
      throw new AppError('File sertifikat ini sudah dipakai untuk sertifikat lain.', 409);
    }

    const sha256 = await computeStorageSha256(normalizedKey);
    const row = await tx.supplierStoreCertificate.create({
      data: {
        supplierId,
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
    return serializeCertificateRow(row);
  });
};

export const listOwnerStoreCertificates = async (
  supplierId: string,
  userId: string,
  isAdmin = false,
  baseUrl?: string,
) => {
  await loadSupplier(supplierId, userId, isAdmin);
  const rows = await prisma.supplierStoreCertificate.findMany({
    where: { supplierId },
    orderBy: { createdAt: 'desc' },
  });
  return rows.map((row) => {
    const serialized = serializeCertificateRow(row);
    const documentUrl =
      row.status === ProductCertificateStatus.APPROVED && baseUrl
        ? `${baseUrl}/api/v1/suppliers/${supplierId}/store-certificates/${row.id}/document`
        : null;
    return { ...serialized, documentUrl };
  });
};

export const deleteOwnerStoreCertificate = async (
  supplierId: string,
  certificateId: string,
  userId: string,
  isAdmin = false,
) => {
  await loadSupplier(supplierId, userId, isAdmin);
  const certificate = await prisma.supplierStoreCertificate.findFirst({
    where: { id: certificateId, supplierId },
  });
  if (!certificate) throw new AppError('Sertifikat toko tidak ditemukan.', 404);
  if (certificate.status === ProductCertificateStatus.APPROVED) {
    throw new AppError('Sertifikat toko yang sudah disetujui tidak dapat dihapus oleh supplier.', 409);
  }
  await prisma.supplierStoreCertificate.delete({ where: { id: certificateId } });
  void storageService.deleteFile(certificate.storageKey);
};

export const listPublicStoreCertificates = (supplierId: string) =>
  prisma.supplierStoreCertificate.findMany({
    where: { supplierId, ...activeApprovedCertificateWhere() },
    select: publicStoreCertificateSelect,
    orderBy: { reviewedAt: 'desc' },
  });

export const getPublicStoreCertificateDocument = async (
  supplierId: string,
  certificateId: string,
) => {
  const certificate = await prisma.supplierStoreCertificate.findFirst({
    where: { id: certificateId, supplierId, ...activeApprovedCertificateWhere() },
    select: { storageKey: true },
  });
  if (!certificate) throw new AppError('Sertifikat toko tidak ditemukan atau tidak berlaku.', 404);
  return storageService.getSignedProxyUrl(certificate.storageKey, 300);
};

export const listAdminStoreQueue = async (params: {
  status?: ProductCertificateStatus;
  search?: string;
  page: number;
  limit: number;
}) => {
  const where: Prisma.SupplierStoreCertificateWhereInput = {
    status: params.status,
    ...(params.search
      ? {
          OR: [
            { title: { contains: params.search } },
            { certificateNumber: { contains: params.search } },
            { supplier: { fullName: { contains: params.search } } },
            { supplier: { profile: { companyName: { contains: params.search } } } },
          ],
        }
      : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.supplierStoreCertificate.findMany({
      where,
      include: {
        supplier: {
          select: {
            id: true,
            fullName: true,
            email: true,
            avatarUrl: true,
            profile: { select: { companyName: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip: (params.page - 1) * params.limit,
      take: params.limit,
    }),
    prisma.supplierStoreCertificate.count({ where }),
  ]);
  return {
    rows: rows.map((row) => serializeCertificateRow(row)),
    total,
  };
};

export const getAdminStoreDetail = async (certificateId: string) => {
  const row = await prisma.supplierStoreCertificate.findUnique({
    where: { id: certificateId },
    include: {
      supplier: {
        select: {
          id: true,
          fullName: true,
          email: true,
          avatarUrl: true,
          profile: { select: { companyName: true, businessType: true } },
        },
      },
      reviewedBy: { select: { id: true, fullName: true } },
    },
  });
  if (!row) throw new AppError('Sertifikat toko tidak ditemukan.', 404);
  return {
    ...serializeCertificateRow(row),
    documentUrl: storageService.getSignedProxyUrl(row.storageKey, 900),
    storageKey: undefined,
  };
};

export const reviewStoreCertificate = async (
  certificateId: string,
  adminId: string,
  status: 'APPROVED' | 'REJECTED',
  rejectionReason?: string,
) => {
  if (status === ProductCertificateStatus.REJECTED && !rejectionReason?.trim()) {
    throw new AppError('Alasan penolakan wajib diisi.', 400);
  }

  const result = await prisma.$transaction(async (tx) => {
    const current = await tx.supplierStoreCertificate.findUnique({
      where: { id: certificateId },
      include: {
        supplier: { select: { id: true, fullName: true, profile: { select: { companyName: true } } } },
      },
    });
    if (!current) throw new AppError('Sertifikat toko tidak ditemukan.', 404);
    if (current.status !== ProductCertificateStatus.PENDING) {
      throw new AppError('Sertifikat toko ini sudah pernah ditinjau.', 409);
    }

    const claimed = await tx.supplierStoreCertificate.updateMany({
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
      throw new AppError('Sertifikat toko ini sudah ditinjau oleh admin lain.', 409);
    }

    const updated = await tx.supplierStoreCertificate.findUniqueOrThrow({
      where: { id: certificateId },
      include: {
        supplier: {
          select: {
            id: true,
            fullName: true,
            email: true,
            avatarUrl: true,
            profile: { select: { companyName: true } },
          },
        },
        reviewedBy: { select: { id: true, fullName: true } },
      },
    });

    await tx.auditLog.create({
      data: {
        userId: adminId,
        action: 'REVIEW_SUPPLIER_STORE_CERTIFICATE',
        entity: 'SUPPLIER_STORE_CERTIFICATE',
        entityId: certificateId,
        oldValue: { status: current.status },
        newValue: { status, rejectionReason: rejectionReason ?? null },
      },
    });

    return { updated, supplier: current.supplier };
  });

  void createNotification({
    userId: result.supplier.id,
    title:
      status === ProductCertificateStatus.APPROVED
        ? 'Sertifikat toko disetujui'
        : 'Sertifikat toko perlu diperbaiki',
    body:
      status === ProductCertificateStatus.APPROVED
        ? `Sertifikat toko "${result.updated.title}" telah diverifikasi admin BISA.`
        : `Sertifikat toko "${result.updated.title}" ditolak. Alasan: ${rejectionReason}`,
    type: NotificationType.PRODUCT_CERTIFICATE,
    priority:
      status === ProductCertificateStatus.APPROVED
        ? NotificationPriority.MEDIUM
        : NotificationPriority.HIGH,
    refId: result.supplier.id,
  });

  return getAdminStoreDetail(certificateId);
};
