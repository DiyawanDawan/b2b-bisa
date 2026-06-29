import crypto from 'crypto';
import bcrypt from 'bcrypt';
import prisma from '#config/prisma';
import AppError from '#utils/appError';
import { ProductStatus } from '#prisma';

const BCRYPT_ROUNDS = 10;

const generateRawKey = () => `bisa_erp_${crypto.randomBytes(24).toString('hex')}`;

export const createSupplierApiKey = async (userId: string, name: string) => {
  const trimmed = name?.trim();
  if (!trimmed) throw new AppError('Nama API key wajib diisi.', 400);

  const rawKey = generateRawKey();
  const keyHash = await bcrypt.hash(rawKey, BCRYPT_ROUNDS);
  const keyPrefix = rawKey.slice(0, 16);

  const record = await prisma.supplierApiKey.create({
    data: {
      userId,
      name: trimmed,
      keyHash,
      keyPrefix,
    },
    select: {
      id: true,
      name: true,
      keyPrefix: true,
      createdAt: true,
    },
  });

  return { ...record, apiKey: rawKey };
};

export const listSupplierApiKeys = async (userId: string) =>
  prisma.supplierApiKey.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      keyPrefix: true,
      lastUsedAt: true,
      isActive: true,
      createdAt: true,
    },
  });

export const revokeSupplierApiKey = async (userId: string, keyId: string) => {
  const key = await prisma.supplierApiKey.findFirst({
    where: { id: keyId, userId },
  });
  if (!key) throw new AppError('API key tidak ditemukan.', 404);
  await prisma.supplierApiKey.update({
    where: { id: keyId },
    data: { isActive: false },
  });
};

export const resolveSupplierFromApiKey = async (rawKey: string) => {
  if (!rawKey?.startsWith('bisa_erp_')) return null;
  const prefix = rawKey.slice(0, 16);
  const candidates = await prisma.supplierApiKey.findMany({
    where: { keyPrefix: prefix, isActive: true },
    select: { id: true, userId: true, keyHash: true },
    take: 5,
  });

  for (const candidate of candidates) {
    const match = await bcrypt.compare(rawKey, candidate.keyHash);
    if (match) {
      await prisma.supplierApiKey.update({
        where: { id: candidate.id },
        data: { lastUsedAt: new Date() },
      });
      return candidate.userId;
    }
  }
  return null;
};

export const exportSupplierProducts = async (supplierId: string) => {
  const products = await prisma.product.findMany({
    where: { userId: supplierId, status: { not: ProductStatus.DELETED } },
    select: {
      id: true,
      name: true,
      stock: true,
      pricePerUnit: true,
      unit: true,
      status: true,
      biomassaType: true,
      updatedAt: true,
    },
    orderBy: { updatedAt: 'desc' },
  });
  return products;
};

export const bulkSyncInventory = async (
  supplierId: string,
  items: { productId: string; stock: number }[],
) => {
  if (!items?.length) throw new AppError('Daftar stok kosong.', 400);
  if (items.length > 200) throw new AppError('Maksimal 200 produk per sinkronisasi.', 400);

  const productIds = items.map((i) => i.productId);
  const owned = await prisma.product.findMany({
    where: { userId: supplierId, id: { in: productIds } },
    select: { id: true },
  });
  const ownedSet = new Set(owned.map((p) => p.id));

  const updates: { productId: string; stock: number; updated: boolean; reason?: string }[] = [];

  for (const item of items) {
    if (!ownedSet.has(item.productId)) {
      updates.push({ productId: item.productId, stock: item.stock, updated: false, reason: 'NOT_OWNED' });
      continue;
    }
    if (item.stock < 0) {
      updates.push({ productId: item.productId, stock: item.stock, updated: false, reason: 'NEGATIVE_STOCK' });
      continue;
    }
    await prisma.product.update({
      where: { id: item.productId },
      data: {
        stock: item.stock,
        status: item.stock === 0 ? ProductStatus.OUT_OF_STOCK : ProductStatus.ACTIVE,
      },
    });
    updates.push({ productId: item.productId, stock: item.stock, updated: true });
  }

  return {
    total: items.length,
    updated: updates.filter((u) => u.updated).length,
    results: updates,
  };
};
