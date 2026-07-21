jest.mock('#config/prisma', () => ({
  __esModule: true,
  default: {
    product: { findUnique: jest.fn() },
    mediaUploadSession: { findFirst: jest.fn() },
    productCertificate: {
      count: jest.fn(),
      create: jest.fn(),
      findMany: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));

jest.mock('#services/storage.service', () => ({
  normalizeStorageKey: jest.fn((value: string) => value),
  getFileStream: jest.fn(),
  getSignedProxyUrl: jest.fn(),
  deleteFile: jest.fn(),
}));

jest.mock('#services/notification.service', () => ({
  createNotification: jest.fn(),
}));

import { Readable } from 'stream';
import prisma from '#config/prisma';
import * as storageService from '#services/storage.service';
import { ProductCertificateStatus } from '#prisma';
import {
  listPublicProductCertificates,
  reviewCertificate,
  submitCertificate,
} from '../../src/services/product-certificate.service';

describe('product certificate service', () => {
  beforeEach(() => jest.clearAllMocks());

  it('rejects submissions for a product owned by another supplier', async () => {
    (prisma.product.findUnique as jest.Mock).mockResolvedValue({
      id: 'product-1',
      userId: 'owner-1',
      name: 'Produk',
    });

    await expect(
      submitCertificate('product-1', 'attacker', false, {
        title: 'Sertifikat',
        certificateType: 'SNI',
        storageKey: 'product-certificates/attacker/file.pdf',
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('rejects a storage path without a completed owned upload session', async () => {
    (prisma.product.findUnique as jest.Mock).mockResolvedValue({
      id: 'product-1',
      userId: 'owner-1',
      name: 'Produk',
    });
    (prisma.mediaUploadSession.findFirst as jest.Mock).mockResolvedValue(null);

    await expect(
      submitCertificate('product-1', 'owner-1', false, {
        title: 'Sertifikat',
        certificateType: 'SNI',
        storageKey: 'product-certificates/other-user/file.pdf',
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('computes and persists a streaming SHA-256 hash', async () => {
    (prisma.product.findUnique as jest.Mock).mockResolvedValue({
      id: 'product-1',
      userId: 'owner-1',
      name: 'Produk',
    });
    (prisma.mediaUploadSession.findFirst as jest.Mock).mockResolvedValue({
      fileName: 'certificate.pdf',
      mimeType: 'application/pdf',
      totalBytes: BigInt(3),
    });
    (prisma.productCertificate.count as jest.Mock).mockResolvedValue(0);
    (storageService.getFileStream as jest.Mock).mockResolvedValue({
      stream: Readable.from([Buffer.from('abc')]),
      contentType: 'application/pdf',
    });
    (prisma.productCertificate.create as jest.Mock).mockResolvedValue({ id: 'cert-1' });

    await submitCertificate('product-1', 'owner-1', false, {
      title: 'Sertifikat',
      certificateType: 'SNI',
      storageKey: 'product-certificates/owner-1/file.pdf',
    });

    expect(prisma.productCertificate.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          sha256: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
        }),
      }),
    );
  });

  it('filters public records to active approved certificates', async () => {
    (prisma.productCertificate.findMany as jest.Mock).mockResolvedValue([]);
    await listPublicProductCertificates('product-1');
    expect(prisma.productCertificate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          productId: 'product-1',
          status: ProductCertificateStatus.APPROVED,
        }),
      }),
    );
  });

  it('prevents a second admin from claiming an already-reviewed certificate', async () => {
    const tx = {
      productCertificate: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'cert-1',
          productId: 'product-1',
          status: ProductCertificateStatus.PENDING,
          product: { id: 'product-1', userId: 'supplier-1', name: 'Produk' },
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
    (prisma.$transaction as jest.Mock).mockImplementation(
      (callback: (client: typeof tx) => unknown) => callback(tx),
    );

    await expect(
      reviewCertificate('cert-1', 'admin-2', ProductCertificateStatus.APPROVED),
    ).rejects.toMatchObject({ statusCode: 409 });
  });
});
