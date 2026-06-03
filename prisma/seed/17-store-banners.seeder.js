import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import logger from '#config/logger';
import * as storageService from '#services/storage.service';
import {
  buildStoreBannerObjectKey,
  repairStoreBannerImageRefs,
} from '#services/storeBanner.service';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const BANNER_PRESETS = {
  harvest: {
    title: 'Panen Raya — Stok Organik Melimpah',
  },
  biochar: {
    title: 'Biochar Premium Grade A',
  },
  iot: {
    title: 'Smart Monitoring IoT PRO',
  },
  promo: {
    title: 'Diskon Grosir Bulan Ini',
  },
  green: {
    title: 'Green Earth — Karbon Negatif',
  },
  organic: {
    title: '100% Organik & Bebas Kimia',
  },
  store: {
    title: 'Selamat Datang di Toko Kami',
  },
  biomass: {
    title: 'Biomassa Berkualitas — Siap Kirim',
  },
};

const PRESET_KEYS = Object.keys(BANNER_PRESETS);

function bannerFallbackUrl(lock, sortOrder) {
  const seed = encodeURIComponent(`bisa-store-${lock}-${sortOrder}`);
  return `https://picsum.photos/seed/${seed}/1200/400`;
}

function resolveLocalBannerAsset(sortOrder) {
  const fileName = `banner${(sortOrder % 2) + 1}.png`;
  const candidates = [
    path.join(__dirname, 'assets', 'banners', fileName),
    path.join(__dirname, '../../../Mobile Apps/mobile_bisa/assets/images', fileName),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

async function resolveBannerImageRef(supplierId, sortOrder) {
  const assetPath = resolveLocalBannerAsset(sortOrder);
  if (!assetPath) {
    return bannerFallbackUrl(`${supplierId.slice(0, 8)}-${sortOrder}`, sortOrder);
  }

  const buffer = fs.readFileSync(assetPath);
  const ext = path.extname(assetPath).slice(1).toLowerCase() || 'png';
  const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : `image/${ext}`;
  const key = await buildStoreBannerObjectKey(supplierId, mime, sortOrder + 1);

  try {
    const storedKey = await storageService.uploadFile(buffer, key, mime);
    return storageService.normalizeStorageKey(storedKey) ?? storedKey;
  } catch (err) {
    logger.warn(
      `⚠️ [17] Upload banner seed gagal (${assetPath}): ${err?.message ?? err}. Pakai picsum.`,
    );
    return bannerFallbackUrl(`${supplierId.slice(0, 8)}-${sortOrder}`, sortOrder);
  }
}

function personalizedTitle(preset, supplier) {
  const company = supplier.profile?.companyName?.trim() || supplier.fullName?.trim() || 'Toko BISA';
  const base = preset.title;
  if (base.includes('Toko Kami')) {
    return `${company} — Toko Resmi`;
  }
  return `${company} · ${base}`;
}

function demoBannerPlan(supplierId, users) {
  if (users?.siti?.id === supplierId) {
    return [
      { preset: 'harvest', isActive: true },
      { preset: 'iot', isActive: true },
      { preset: 'biochar', isActive: true },
      { preset: 'promo', isActive: true },
    ];
  }
  if (users?.green?.id === supplierId) {
    return [
      { preset: 'green', isActive: true },
      { preset: 'organic', isActive: true },
      { preset: 'biochar', isActive: true },
    ];
  }
  return null;
}

function defaultBannerPlan(supplierIndex) {
  const first = PRESET_KEYS[supplierIndex % PRESET_KEYS.length];
  const second = PRESET_KEYS[(supplierIndex + 3) % PRESET_KEYS.length];
  const third = PRESET_KEYS[(supplierIndex + 5) % PRESET_KEYS.length];

  return [
    { preset: first, isActive: true },
    { preset: second, isActive: true },
    { preset: third, isActive: true },
  ];
}

export async function seedStoreBanners(prisma, users) {
  logger.info('🌱 [17] Seeding Store Banners (upload R2 + path relatif di DB)...');

  await prisma.storeBanner.deleteMany({});

  const suppliers = await prisma.user.findMany({
    where: { role: 'SUPPLIER' },
    include: { profile: true },
    orderBy: { createdAt: 'asc' },
  });

  if (suppliers.length === 0) {
    logger.warn('⚠️ [17] Tidak ada supplier — banner toko dilewati.');
    return { total: 0, suppliers: 0 };
  }

  let total = 0;
  let uploaded = 0;

  for (let index = 0; index < suppliers.length; index++) {
    const supplier = suppliers[index];
    const plan = demoBannerPlan(supplier.id, users) ?? defaultBannerPlan(index);

    for (let sortOrder = 0; sortOrder < plan.length; sortOrder++) {
      const item = plan[sortOrder];
      const preset = BANNER_PRESETS[item.preset] ?? BANNER_PRESETS.store;
      const imageRef = await resolveBannerImageRef(supplier.id, sortOrder);

      if (!imageRef.startsWith('http')) uploaded++;

      await prisma.storeBanner.create({
        data: {
          userId: supplier.id,
          imageUrl: imageRef,
          title: personalizedTitle(preset, supplier),
          sortOrder,
          isActive: item.isActive !== false,
        },
      });
      total++;
    }
  }

  const suppliersWithoutActiveBanner = await prisma.user.findMany({
    where: {
      role: 'SUPPLIER',
      storeBanners: { none: { isActive: true } },
    },
    select: { id: true, email: true, fullName: true },
  });

  if (suppliersWithoutActiveBanner.length > 0) {
    logger.warn(
      `⚠️ [17] ${suppliersWithoutActiveBanner.length} supplier tanpa banner aktif — menambahkan fallback...`,
    );

    for (const supplier of suppliersWithoutActiveBanner) {
      const imageRef = await resolveBannerImageRef(supplier.id, 99);
      if (!imageRef.startsWith('http')) uploaded++;

      await prisma.storeBanner.create({
        data: {
          userId: supplier.id,
          imageUrl: imageRef,
          title: `${supplier.fullName ?? 'Supplier'} · Banner Toko`,
          sortOrder: 0,
          isActive: true,
        },
      });
      total++;
    }
  }

  const repaired = await repairStoreBannerImageRefs();
  const activeBannerCount = await prisma.storeBanner.count({ where: { isActive: true } });

  logger.info(
    `✅ [17] ${total} banner (${uploaded} di R2, sisanya CDN fallback), ${repaired} URL diperbaiki, ${activeBannerCount} aktif.`,
  );

  return { total, suppliers: suppliers.length, activeBannerCount, uploaded, repaired };
}
