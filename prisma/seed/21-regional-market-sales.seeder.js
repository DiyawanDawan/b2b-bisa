import bcrypt from 'bcrypt';
import { faker } from '@faker-js/faker/locale/id_ID';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import logger from '../../src/config/logger.js';
import { recomputeAllSnapshots } from '#services/marketSupplyDemand.service';
import { avatarSeedPath } from '../../src/utils/loremFlickrMedia.util.ts';
import {
  backfillStaleProductMedia,
  buildProductMediaSlug,
  countRegionalSeedR2Paths,
  getRegionalSeedMediaUploadCount,
  resolveBiomassProductMediaForSeed,
} from './utils/seedProductMedia.util.ts';
import { hasStockPhotoApiKey } from './utils/stockPhotoApi.util.ts';

const ORDER_STATUSES = [
  'COMPLETED',
  'COMPLETED',
  'COMPLETED',
  'COMPLETED',
  'SHIPPED',
  'SHIPPED',
  'PROCESSING',
  'CONFIRMED',
  'PENDING',
  'PENDING',
  'CANCELLED',
  'DISPUTED',
];

const EXTRA_PROVINCES = [
  { name: 'Jawa Timur', code: '35' },
  { name: 'Bali', code: '51' },
  { name: 'Lampung', code: '18' },
  { name: 'Kalimantan Selatan', code: '63' },
  { name: 'Sulawesi Selatan', code: '73' },
];

const MARKET_PRODUCT_TEMPLATES = [
  {
    name: 'Biochar Grade A Premium',
    biomassaType: 'BIOCHAR',
    grade: 'A',
    priceKg: 4500,
    jitter: 400,
  },
  {
    name: 'Biochar Grade B Standard',
    biomassaType: 'BIOCHAR',
    grade: 'B',
    priceKg: 4050,
    jitter: 350,
  },
  {
    name: 'Biochar Grade C Ekonomis',
    biomassaType: 'BIOCHAR',
    grade: 'C',
    priceKg: 3500,
    jitter: 300,
  },
  {
    name: 'Sekam Padi Mentah Kering',
    biomassaType: 'SEKAM_PADI',
    grade: null,
    priceKg: 800,
    jitter: 120,
  },
  {
    name: 'Tongkol Jagung Kering',
    biomassaType: 'TONGKOL_JAGUNG',
    grade: null,
    priceKg: 650,
    jitter: 100,
  },
  {
    name: 'Tempurung Kelapa',
    biomassaType: 'TEMPURUNG_KELAPA',
    grade: null,
    priceKg: 950,
    jitter: 150,
  },
];

const PRODUCT_VARIANTS = [
  { suffix: 'Bulk Siap Supply', unit: 'TON', stockFactor: 1 },
  { suffix: 'Gudang Utama', unit: 'TON', stockFactor: 0.85 },
  { suffix: 'Lot Kontrak', unit: 'TON', stockFactor: 0.7 },
  { suffix: 'Stok Retail', unit: 'KG', stockFactor: 0.008 },
];

/** Stok siap supply (ton) per jenis biomassa — realistis untuk analitik. */
const STOCK_TON_RANGE = {
  BIOCHAR: { min: 8, max: 95 },
  SEKAM_PADI: { min: 20, max: 220 },
  TONGKOL_JAGUNG: { min: 12, max: 160 },
  TEMPURUNG_KELAPA: { min: 10, max: 130 },
};

const VARIANTS_PER_TEMPLATE = PRODUCT_VARIANTS.length;
const TARGET_PRODUCTS_PER_SUPPLIER = MARKET_PRODUCT_TEMPLATES.length * VARIANTS_PER_TEMPLATE;

/** Satu set gambar R2 per template komoditas (bukan per SKU) — hemat upload. */
const REGIONAL_MEDIA_LOCK_BY_TEMPLATE = {
  'BIOCHAR:A': 2101,
  'BIOCHAR:B': 2102,
  'BIOCHAR:C': 2103,
  SEKAM_PADI: 2201,
  TONGKOL_JAGUNG: 2202,
  TEMPURUNG_KELAPA: 2203,
};

function regionalMediaLockForTemplate(tpl) {
  if (tpl.biomassaType === 'BIOCHAR' && tpl.grade) {
    return REGIONAL_MEDIA_LOCK_BY_TEMPLATE[`BIOCHAR:${tpl.grade}`] ?? 2100;
  }
  return REGIONAL_MEDIA_LOCK_BY_TEMPLATE[tpl.biomassaType] ?? 2300;
}

const MARKET_SEED_BUNDLE_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../data/market_seed_bundles.json',
);

function normalizeLabel(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function extractCurrentValueKg(currentValue) {
  const raw = String(currentValue ?? '');
  const cleaned = raw.replace(/[^\d]/g, '');
  if (!cleaned) return null;
  const numeric = Number(cleaned);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

function loadCommoditySeedPriceKgMap() {
  try {
    const raw = readFileSync(MARKET_SEED_BUNDLE_PATH, 'utf-8');
    const bundle = JSON.parse(raw);
    const commodities = Array.isArray(bundle?.commodities) ? bundle.commodities : [];
    const map = new Map();

    for (const c of commodities) {
      const history = Array.isArray(c?.historyData) ? c.historyData : [];
      const last = history.at(-1);
      const fromHistory = Number(last?.y);
      const byHistory =
        Number.isFinite(fromHistory) && fromHistory > 0 ? Math.round(fromHistory) : null;
      const byCurrentValue = extractCurrentValueKg(c?.currentValue);
      const refPrice = byHistory ?? byCurrentValue;
      if (!refPrice) continue;
      map.set(normalizeLabel(c.label), refPrice);
    }
    return map;
  } catch (error) {
    console.warn('[SEED 21] Gagal membaca market_seed_bundles.json:', error?.message ?? error);
    return new Map();
  }
}

const COMMODITY_SEED_PRICE_KG = loadCommoditySeedPriceKgMap();

function resolveSeedPriceKg(tpl) {
  const queryOrder = [];
  if (tpl.biomassaType === 'BIOCHAR' && tpl.grade) {
    queryOrder.push(normalizeLabel(`biochar grade ${tpl.grade}`));
    queryOrder.push(normalizeLabel(`biochar grade ${tpl.grade} premium`));
  }
  if (tpl.biomassaType === 'SEKAM_PADI') queryOrder.push(normalizeLabel('sekam padi mentah'));
  if (tpl.biomassaType === 'TONGKOL_JAGUNG')
    queryOrder.push(normalizeLabel('tongkol jagung kering'));
  if (tpl.biomassaType === 'TEMPURUNG_KELAPA') queryOrder.push(normalizeLabel('tempurung kelapa'));
  queryOrder.push(normalizeLabel(tpl.name));

  for (const key of queryOrder) {
    for (const [seedLabel, price] of COMMODITY_SEED_PRICE_KG.entries()) {
      if (seedLabel.includes(key) || key.includes(seedLabel)) return price;
    }
  }
  return tpl.priceKg;
}

function txForOrderStatus(status) {
  switch (status) {
    case 'PENDING':
      return { status: 'PENDING', paymentStatus: 'PENDING', paidAt: null, escrowReleasedAt: null };
    case 'CONFIRMED':
    case 'PROCESSING':
    case 'SHIPPED':
    case 'DISPUTED':
      return {
        status: 'ESCROW_HELD',
        paymentStatus: 'SUCCESS',
        paidAt: new Date(),
        escrowReleasedAt: null,
      };
    case 'COMPLETED':
      return {
        status: 'RELEASED',
        paymentStatus: 'SUCCESS',
        paidAt: new Date(),
        escrowReleasedAt: new Date(),
      };
    case 'CANCELLED':
      return { status: 'REFUNDED', paymentStatus: 'FAILED', paidAt: null, escrowReleasedAt: null };
    default:
      return { status: 'PENDING', paymentStatus: 'PENDING', paidAt: null, escrowReleasedAt: null };
  }
}

function buildOrderFinancials(subtotal) {
  const platformFee = subtotal * 0.03;
  const logisticsFee = 150000;
  const vatAmount = subtotal * 0.11;
  const totalAmount = subtotal + platformFee + logisticsFee + vatAmount;
  return { subtotal, platformFee, logisticsFee, vatAmount, totalAmount };
}

function monthDate(year, month, day = 15) {
  return new Date(year, month - 1, day, 10, 0, 0);
}

/** Tanggal acak dalam N hari terakhir — agar analitik 30/90 hari terisi. */
function randomRecentDate(maxDaysAgo = 30) {
  const daysAgo = faker.number.int({ min: 0, max: Math.max(0, maxDaysAgo - 1) });
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(faker.number.int({ min: 7, max: 20 }), faker.number.int({ min: 0, max: 59 }), 0, 0);
  return d;
}

async function refreshRegionalOrderDates(prisma, marker, maxDaysAgo = 30) {
  const orders = await prisma.order.findMany({
    where: { orderNumber: { startsWith: marker } },
    select: {
      id: true,
      status: true,
      transaction: { select: { id: true } },
    },
  });
  if (orders.length === 0) return 0;

  let updated = 0;
  for (const order of orders) {
    const createdAt = randomRecentDate(maxDaysAgo);
    const isPaid = !['PENDING', 'CANCELLED'].includes(order.status);
    const isReleased = order.status === 'COMPLETED';

    await prisma.order.update({
      where: { id: order.id },
      data: { createdAt, updatedAt: createdAt },
    });

    if (order.transaction) {
      await prisma.transaction.update({
        where: { id: order.transaction.id },
        data: {
          createdAt,
          paidAt: isPaid ? createdAt : null,
          escrowReleasedAt: isReleased ? createdAt : null,
        },
      });
    }
    updated++;
  }
  return updated;
}

function slugProvince(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 12);
}

function stockTonForType(biomassaType, factor = 1) {
  const range = STOCK_TON_RANGE[biomassaType] ?? { min: 10, max: 80 };
  const base = faker.number.float({ min: range.min, max: range.max, fractionDigits: 1 });
  return Math.round(base * factor * 10) / 10;
}

async function ensureSupplierCatalog(
  prisma,
  supplier,
  province,
  regency,
  categoryFor,
  regionalProducts,
) {
  let created = 0;
  const mediaBySlug = new Map();

  for (const tpl of MARKET_PRODUCT_TEMPLATES) {
    const page = regionalMediaLockForTemplate(tpl);

    for (const variant of PRODUCT_VARIANTS) {
      const productName = `${tpl.name} ${variant.suffix} — ${province.name}`;
      const mediaSlug = buildProductMediaSlug(productName, tpl.biomassaType, tpl.grade);

      if (!mediaBySlug.has(mediaSlug)) {
        mediaBySlug.set(
          mediaSlug,
          await resolveBiomassProductMediaForSeed(faker, tpl.biomassaType, page, {
            productName,
            mediaSlug,
            includeVideo: true,
            grade: tpl.grade,
          }),
        );
      }
      const media = mediaBySlug.get(mediaSlug);

      const exists = await prisma.product.findFirst({
        where: { userId: supplier.id, name: productName },
        select: { id: true },
      });
      if (exists) {
        const found = await prisma.product.findUnique({
          where: { id: exists.id },
          include: {
            images: { select: { id: true } },
            video: { select: { id: true } },
          },
        });
        if (found && (!found.thumbnailUrl || found.images.length === 0 || !found.video)) {
          await prisma.product.update({
            where: { id: found.id },
            data: {
              thumbnailUrl: media.thumbnailUrl,
              ...(media.videoUrl &&
                !found.video && {
                  video: { create: { url: media.videoUrl } },
                }),
              ...(found.images.length === 0 && {
                images: { create: media.images },
              }),
            },
          });
          found.thumbnailUrl = media.thumbnailUrl;
          if (media.videoUrl && !found.video) found.video = { id: 'seed' };
        }
        if (found) regionalProducts.push(found);
        continue;
      }

      const seedPriceKg = resolveSeedPriceKg(tpl);
      const dynamicJitter = Math.max(20, Math.round(seedPriceKg * 0.06));
      const boundedJitter = Math.min(dynamicJitter, Math.max(80, tpl.jitter));
      const priceWithVariance = Math.max(
        50,
        seedPriceKg + faker.number.int({ min: -boundedJitter, max: boundedJitter }),
      );
      const isTon = variant.unit === 'TON';
      const stock = isTon
        ? stockTonForType(tpl.biomassaType, variant.stockFactor)
        : Math.round(stockTonForType(tpl.biomassaType, variant.stockFactor) * 1000);

      const product = await prisma.product.create({
        data: {
          userId: supplier.id,
          categoryId: categoryFor(tpl.biomassaType),
          name: productName,
          biomassaType: tpl.biomassaType,
          grade: tpl.grade,
          productMode: 'BIOMASS_MATERIAL',
          description: `Stok siap supply ${tpl.name} (${variant.suffix}) — ${province.name}.`,
          pricePerUnit: isTon ? priceWithVariance * 1000 : priceWithVariance,
          stock,
          unit: variant.unit,
          minOrder: isTon ? 1 : tpl.biomassaType === 'BIOCHAR' ? 100 : 500,
          province: province.name,
          regency: regency?.name,
          isCertified: tpl.grade === 'A',
          isIotMonitored: tpl.biomassaType === 'BIOCHAR',
          status: 'ACTIVE',
          thumbnailUrl: media.thumbnailUrl,
          ...(media.videoUrl && {
            video: { create: { url: media.videoUrl } },
          }),
          images: { create: media.images },
        },
      });
      regionalProducts.push(product);
      created++;
    }
  }

  return created;
}

async function backfillRegionalProductMedia(prisma) {
  const products = await prisma.product.findMany({
    where: {
      user: { email: { endsWith: '@bisa-seed.local' } },
      OR: [
        { thumbnailUrl: null },
        { thumbnailUrl: { startsWith: 'external/loremflickr' } },
        { thumbnailUrl: { contains: '/390928-' } },
        { video: { is: null } },
        { images: { none: {} } },
      ],
    },
    select: {
      id: true,
      name: true,
      biomassaType: true,
      grade: true,
      thumbnailUrl: true,
      video: { select: { id: true } },
      images: { select: { id: true } },
    },
  });

  if (products.length === 0) return 0;

  const mediaBySlug = new Map();
  let updated = 0;

  for (const product of products) {
    const page = regionalMediaLockForTemplate({
      biomassaType: product.biomassaType,
      grade: product.grade,
    });
    const mediaSlug = buildProductMediaSlug(product.name, product.biomassaType, product.grade);
    if (!mediaBySlug.has(mediaSlug)) {
      mediaBySlug.set(
        mediaSlug,
        await resolveBiomassProductMediaForSeed(faker, product.biomassaType, page, {
          productName: product.name,
          mediaSlug,
          includeVideo: true,
          grade: product.grade,
        }),
      );
    }
    const media = mediaBySlug.get(mediaSlug);
    const needsThumb =
      !product.thumbnailUrl ||
      product.thumbnailUrl.startsWith('external/loremflickr') ||
      product.thumbnailUrl.includes('/390928-');
    const needsImages = product.images.length === 0;
    const needsVideo = !product.video;
    if (!needsThumb && !needsImages && !needsVideo) continue;

    await prisma.product.update({
      where: { id: product.id },
      data: {
        ...(needsThumb && { thumbnailUrl: media.thumbnailUrl }),
        ...(needsVideo &&
          media.videoUrl && {
            video: { create: { url: media.videoUrl } },
          }),
        ...(needsImages && { images: { create: media.images } }),
      },
    });
    updated++;
  }

  return updated;
}

async function logSupplyByCommodity(prisma) {
  const products = await prisma.product.findMany({
    where: {
      status: 'ACTIVE',
      user: { email: { endsWith: '@bisa-seed.local' } },
    },
    select: { biomassaType: true, stock: true, unit: true, grade: true },
  });

  const byKey = new Map();
  for (const p of products) {
    const key = p.biomassaType === 'BIOCHAR' && p.grade ? `BIOCHAR_${p.grade}` : p.biomassaType;
    const stockKg = p.unit === 'TON' ? Number(p.stock) * 1000 : Number(p.stock);
    const cur = byKey.get(key) ?? { count: 0, kg: 0 };
    cur.count += 1;
    cur.kg += stockKg;
    byKey.set(key, cur);
  }

  for (const [key, val] of [...byKey.entries()].sort()) {
    logger.info(
      `   ↳ Supply seed ${key}: ${val.count} produk · ${(val.kg / 1000).toFixed(1)} ton siap`,
    );
  }
}

/**
 * Banyak pengguna + pesanan per provinsi untuk analitik pasar live.
 * Semua pesanan regional: tanggal dalam **30 hari terakhir** (bukan historis 2023).
 */
export async function seedRegionalMarketSales(prisma) {
  const MARKER = '#BISA-RGN-';
  if (hasStockPhotoApiKey()) {
    logger.info('   ↳ Stock photos: Pexels/Pixabay → R2');
  } else {
    logger.warn('   ↳ PEXELS_API_KEY / PIXABAY_API_KEY kosong — fallback loremflickr path.');
  }
  const ORDERS_TARGET = 2500;
  const ORDER_RECENT_DAYS = 30;
  const BUYERS_PER_PROV = 25;
  const SUPPLIERS_PER_PROV = 12;

  const existing = await prisma.order.count({
    where: { orderNumber: { startsWith: MARKER } },
  });
  const ordersToCreate = Math.max(0, ORDERS_TARGET - existing);
  if (ordersToCreate === 0) {
    const refreshed = await refreshRegionalOrderDates(prisma, MARKER, ORDER_RECENT_DAYS);
    const mediaFixed = await backfillRegionalProductMedia(prisma);
    const staleFixed = await backfillStaleProductMedia(prisma, faker);
    logger.info(
      `✅ [21] ${existing} pesanan regional — ${refreshed} di-refresh · media ${mediaFixed + staleFixed} produk`,
    );
    return { users: 0, orders: existing, refreshed, mediaFixed: mediaFixed + staleFixed };
  }

  logger.info('🌱 [21] Seeding regional users + bulk sales (per provinsi)...');

  const passwordHash = await bcrypt.hash('password123', 10);
  const country = await prisma.country.findFirst({ where: { code: 'ID' } });
  if (!country) {
    logger.warn('⚠️ [21] Country ID tidak ditemukan.');
    return { users: 0, orders: 0 };
  }

  for (const prov of EXTRA_PROVINCES) {
    await prisma.province.upsert({
      where: { name_countryId: { name: prov.name, countryId: country.id } },
      update: {},
      create: { name: prov.name, code: prov.code, countryId: country.id },
    });
  }

  const provinces = await prisma.province.findMany({ where: { countryId: country.id } });
  const catBiochar = await prisma.category.findFirst({
    where: { productMode: 'BIOMASS_MATERIAL', biomassaType: 'BIOCHAR' },
  });
  const catSekam = await prisma.category.findFirst({
    where: { productMode: 'BIOMASS_MATERIAL', biomassaType: 'SEKAM_PADI' },
  });
  const catJagung = await prisma.category.findFirst({
    where: { productMode: 'BIOMASS_MATERIAL', biomassaType: 'TONGKOL_JAGUNG' },
  });
  const catKelapa = await prisma.category.findFirst({
    where: { productMode: 'BIOMASS_MATERIAL', biomassaType: 'TEMPURUNG_KELAPA' },
  });
  const categoryFor = (biomassaType) => {
    if (biomassaType === 'BIOCHAR') return catBiochar?.id;
    if (biomassaType === 'SEKAM_PADI') return catSekam?.id;
    if (biomassaType === 'TONGKOL_JAGUNG') return catJagung?.id;
    if (biomassaType === 'TEMPURUNG_KELAPA') return catKelapa?.id;
    return catBiochar?.id;
  };

  const paymentChannel = await prisma.paymentChannel.findFirst({ where: { code: 'MANDIRI' } });

  const regionalBuyers = [];
  const regionalProducts = [];
  let avatarIdx = 800;

  for (const province of provinces) {
    const provSlug = slugProvince(province.name);
    const regency = await prisma.regency.findFirst({ where: { provinceId: province.id } });

    for (let s = 0; s < SUPPLIERS_PER_PROV; s++) {
      const email = `regional.supplier.${provSlug}.${String(s + 1).padStart(2, '0')}@bisa-seed.local`;
      const existingUser = await prisma.user.findUnique({ where: { email } });
      if (existingUser) {
        await ensureSupplierCatalog(
          prisma,
          existingUser,
          province,
          regency,
          categoryFor,
          regionalProducts,
        );
        continue;
      }

      const addr = await prisma.address.create({
        data: {
          countryId: country.id,
          provinceId: province.id,
          regencyId: regency?.id,
          fullAddress: `${faker.location.streetAddress()}, ${province.name}`,
          zipCode: faker.location.zipCode('#####'),
          latitude: -6 + Math.random() * 4,
          longitude: 106 + Math.random() * 5,
        },
      });
      await prisma.partner.create({ data: { addressId: addr.id } });

      const supplier = await prisma.user.create({
        data: {
          email,
          fullName: `Supplier ${province.name} ${s + 1}`,
          password: passwordHash,
          role: 'SUPPLIER',
          tier: s < 2 ? 'PRO' : 'FREE',
          isEmailVerified: true,
          province: province.name,
          regency: regency?.name ?? faker.location.city(),
          region: `${province.name}, Indonesia`,
          addressId: addr.id,
          avatarUrl: avatarSeedPath(avatarIdx++),
          profile: {
            create: {
              companyName: `Biochar ${province.name} ${s + 1}`,
              businessType: 'Supplier Biomassa',
              addressId: addr.id,
            },
          },
        },
      });

      await ensureSupplierCatalog(
        prisma,
        supplier,
        province,
        regency,
        categoryFor,
        regionalProducts,
      );
    }

    for (let b = 0; b < BUYERS_PER_PROV; b++) {
      const email = `regional.buyer.${provSlug}.${String(b + 1).padStart(2, '0')}@bisa-seed.local`;
      const existingBuyer = await prisma.user.findUnique({ where: { email } });
      if (existingBuyer) {
        regionalBuyers.push(existingBuyer);
        continue;
      }

      const addr = await prisma.address.create({
        data: {
          countryId: country.id,
          provinceId: province.id,
          regencyId: regency?.id,
          fullAddress: `${faker.location.streetAddress()}, ${province.name}`,
          zipCode: faker.location.zipCode('#####'),
          latitude: -6 + Math.random() * 4,
          longitude: 106 + Math.random() * 5,
        },
      });
      await prisma.partner.create({ data: { addressId: addr.id } });

      const buyer = await prisma.user.create({
        data: {
          email,
          fullName: `Buyer ${province.name} ${b + 1}`,
          password: passwordHash,
          role: 'BUYER',
          tier: b < 3 ? 'PRO' : 'FREE',
          isEmailVerified: true,
          province: province.name,
          regency: regency?.name,
          addressId: addr.id,
          avatarUrl: avatarSeedPath(avatarIdx++),
        },
      });
      regionalBuyers.push(buyer);
    }
  }

  const productPool = [...new Map(regionalProducts.map((p) => [p.id, p])).values()];

  if (productPool.length === 0 || regionalBuyers.length === 0) {
    logger.warn('⚠️ [21] Tidak ada produk/buyer regional.');
    return { users: regionalBuyers.length, orders: 0 };
  }

  let orderSeq = existing + 1;
  let createdOrders = 0;

  for (let i = 0; i < ordersToCreate; i++) {
    const createdAt = randomRecentDate(ORDER_RECENT_DAYS);
    const status = ORDER_STATUSES[i % ORDER_STATUSES.length];
    const buyer = regionalBuyers[i % regionalBuyers.length];
    const product = productPool[i % productPool.length];
    const sellerId = product.userId;

    const isTon = product.unit === 'TON';
    const qty = isTon
      ? faker.number.float({ min: 1, max: 18, fractionDigits: 2 })
      : faker.number.int({
          min: Number(product.minOrder) || 100,
          max: (Number(product.minOrder) || 100) + 2000,
        });
    const pricePerUnit = Number(product.pricePerUnit);
    const subtotal = qty * pricePerUnit;
    const fin = buildOrderFinancials(subtotal);
    const txMeta = txForOrderStatus(status);
    const provSlug = slugProvince(buyer.province ?? 'id');
    const orderNumber = `${MARKER}${provSlug}-${String(orderSeq++).padStart(4, '0')}`;

    const shippingAddressSnapshot = {
      recipient: buyer.fullName,
      phone: buyer.phone ?? '+6281234567890',
      email: buyer.email,
      address: buyer.province ?? 'Indonesia',
      province: buyer.province,
      regency: buyer.regency,
    };

    await prisma.order.create({
      data: {
        orderNumber,
        buyerId: buyer.id,
        sellerId,
        status,
        subtotal: fin.subtotal,
        platformFee: fin.platformFee,
        logisticsFee: fin.logisticsFee,
        vatAmount: fin.vatAmount,
        totalAmount: fin.totalAmount,
        totalQuantity: qty,
        specifications: `Seed penjualan regional ${buyer.province} — ${status}`,
        shippingAddressId: buyer.addressId,
        shippingAddressSnapshot,
        createdAt,
        updatedAt: createdAt,
        items: {
          create: [
            {
              productId: product.id,
              quantity: qty,
              pricePerUnit,
              subtotal: fin.subtotal,
            },
          ],
        },
        transaction: {
          create: {
            userId: buyer.id,
            amount: fin.totalAmount,
            platformFee: fin.platformFee,
            sellerAmount: fin.subtotal - fin.platformFee,
            status: txMeta.status,
            paymentStatus: txMeta.paymentStatus,
            type: 'SALES',
            paymentChannelId: paymentChannel?.id,
            paidAt: txMeta.paidAt ? createdAt : null,
            escrowReleasedAt: txMeta.escrowReleasedAt ? createdAt : null,
            externalId: `RGN-TXN-${orderNumber.replace(/#/g, '')}`,
            createdAt,
          },
        },
        ...(status === 'DISPUTED'
          ? {
              dispute: {
                create: {
                  raisedById: buyer.id,
                  reason: 'Seed: kualitas atau pengiriman tidak sesuai',
                  description: `Sengketa demo untuk ${orderNumber} (${buyer.province}).`,
                  evidenceUrls: [],
                  status: 'OPEN',
                },
              },
            }
          : {}),
      },
    });
    createdOrders++;
    if (createdOrders % 250 === 0) {
      logger.info(`   ↳ [21] ${createdOrders}/${ordersToCreate} pesanan regional...`);
    }
  }

  const refreshed = await refreshRegionalOrderDates(prisma, MARKER, ORDER_RECENT_DAYS);
  if (refreshed > 0) {
    logger.info(
      `   ↳ ${refreshed} pesanan regional dalam rentang ${ORDER_RECENT_DAYS} hari terakhir`,
    );
  }

  const statusCounts = await prisma.order.groupBy({
    by: ['status'],
    where: { orderNumber: { startsWith: MARKER } },
    _count: true,
  });

  logger.info(
    `✅ [21] Regional market: ${regionalBuyers.length} buyers, ${productPool.length} produk, ${createdOrders} pesanan.`,
  );
  logger.info(
    `   ↳ Katalog: ${TARGET_PRODUCTS_PER_SUPPLIER} SKU/supplier (${MARKET_PRODUCT_TEMPLATES.length} komoditas × ${VARIANTS_PER_TEMPLATE} varian, stok utama dalam ton)`,
  );
  await logSupplyByCommodity(prisma);
  logger.info(`   ↳ Status: ${statusCounts.map((s) => `${s.status}=${s._count}`).join(', ')}`);

  const mediaFixed = await backfillRegionalProductMedia(prisma);
  const staleFixed = await backfillStaleProductMedia(prisma, faker);
  logger.info(
    `   ↳ Media: ${mediaFixed + staleFixed} produk diperbarui · ${countRegionalSeedR2Paths()} file R2 · ${getRegionalSeedMediaUploadCount()} path cache`,
  );

  const snapshotCount = await recomputeAllSnapshots();
  logger.info(`   ↳ Supply/demand snapshots: ${snapshotCount} komoditas`);

  return {
    users: regionalBuyers.length,
    products: regionalProducts.length,
    orders: createdOrders,
  };
}
