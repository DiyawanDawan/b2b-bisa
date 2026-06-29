import prisma from '#config/prisma';
import logger from '#config/logger';
import { OrderStatus, ProductStatus, Prisma } from '#prisma';
import {
  MarketCommoditySpec,
  isSupportedMarketTrend,
  resolveCommoditySpec,
} from '#config/marketCommodity.config';
import { buildCacheKey, cacheAside, hashQuery, invalidateByPrefix } from '#utils/cache.util';

export type SupplyDemandMetrics = {
  label: string;
  category: string;
  biomassaType: string | null;
  grade: string | null;
  supply: {
    productCount: number;
    listingCount: number;
    totalStockKg: number;
    totalStockTon: number;
    readySupplyTon: number;
    provinceCount: number;
  };
  demand: {
    orderCount30d: number;
    orderCount90d: number;
    openOrderCount: number;
    quantityKg30d: number;
    quantityKg90d: number;
    quantityTon90d: number;
    completedQuantityKg90d: number;
    completedQuantityTon90d: number;
  };
  /** supply kg / demand kg (90 hari); >1 = oversupply */
  supplyDemandRatio: number | null;
  balance: 'oversupply' | 'balanced' | 'high_demand' | 'unknown';
};

const REFRESH_DEBOUNCE_MS = 5000;

let refreshTimer: ReturnType<typeof setTimeout> | null = null;
let refreshRunning = false;

const toNum = (v: unknown): number => {
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  if (typeof v === 'object' && v !== null && 'toNumber' in v) {
    return (v as { toNumber: () => number }).toNumber();
  }
  return Number(v) || 0;
};

const qtyToKg = (qty: number, unit: string): number => {
  const u = (unit ?? 'KG').toUpperCase();
  return u === 'TON' ? qty * 1000 : qty;
};

const stockToKg = (stock: number, unit: string): number => qtyToKg(stock, unit);

const buildProductWhere = (spec: MarketCommoditySpec) => {
  const where: Record<string, unknown> = { status: ProductStatus.ACTIVE };
  if (spec.productMode) where.productMode = spec.productMode;
  if (spec.grade) where.grade = spec.grade;
  if (spec.biomassaTypes?.length) where.biomassaType = { in: spec.biomassaTypes };
  if (spec.nameContains) where.name = { contains: spec.nameContains };
  return where;
};

const OPEN_ORDER_STATUSES: OrderStatus[] = [
  OrderStatus.PENDING,
  OrderStatus.CONFIRMED,
  OrderStatus.PROCESSING,
  OrderStatus.SHIPPED,
  OrderStatus.DISPUTED,
];

const kgToTon = (kg: number): number => Math.round((kg / 1000) * 10) / 10;

const aggregateSupply = async (spec: MarketCommoditySpec) => {
  const products = await prisma.product.findMany({
    where: buildProductWhere(spec),
    select: { id: true, stock: true, unit: true, province: true },
  });

  let totalStockKg = 0;
  const provinces = new Set<string>();
  for (const p of products) {
    totalStockKg += stockToKg(toNum(p.stock), p.unit);
    if (p.province) provinces.add(p.province);
  }

  return {
    productCount: products.length,
    listingCount: products.filter((p) => toNum(p.stock) > 0).length,
    totalStockKg: Math.round(totalStockKg),
    totalStockTon: kgToTon(totalStockKg),
    readySupplyTon: kgToTon(totalStockKg),
    provinceCount: provinces.size,
  };
};

const aggregateDemand = async (spec: MarketCommoditySpec) => {
  const productWhere = buildProductWhere(spec);
  const now = new Date();
  const d30 = new Date(now);
  d30.setDate(d30.getDate() - 30);
  const d90 = new Date(now);
  d90.setDate(d90.getDate() - 90);

  const items = await prisma.orderItem.findMany({
    where: {
      product: productWhere,
      order: {
        status: { not: OrderStatus.CANCELLED },
        createdAt: { gte: d90 },
      },
    },
    select: {
      quantity: true,
      orderId: true,
      product: { select: { unit: true } },
      order: { select: { status: true, createdAt: true } },
    },
  });

  let quantityKg30d = 0;
  let quantityKg90d = 0;
  let completedQuantityKg90d = 0;

  const orders30 = new Set<string>();
  const orders90 = new Set<string>();
  const ordersOpen = new Set<string>();

  for (const item of items) {
    const kg = qtyToKg(toNum(item.quantity), item.product.unit);
    quantityKg90d += kg;
    orders90.add(item.orderId);

    if (item.order.createdAt >= d30) {
      quantityKg30d += kg;
      orders30.add(item.orderId);
    }

    if (item.order.status === OrderStatus.COMPLETED) {
      completedQuantityKg90d += kg;
    }
    if (OPEN_ORDER_STATUSES.includes(item.order.status)) {
      ordersOpen.add(item.orderId);
    }
  }

  return {
    orderCount30d: orders30.size,
    orderCount90d: orders90.size,
    openOrderCount: ordersOpen.size,
    quantityKg30d: Math.round(quantityKg30d),
    quantityKg90d: Math.round(quantityKg90d),
    quantityTon90d: kgToTon(quantityKg90d),
    completedQuantityKg90d: Math.round(completedQuantityKg90d),
    completedQuantityTon90d: kgToTon(completedQuantityKg90d),
  };
};

const resolveBalance = (supplyKg: number, demandKg: number): SupplyDemandMetrics['balance'] => {
  if (demandKg <= 0 && supplyKg <= 0) return 'unknown';
  if (demandKg <= 0) return 'oversupply';
  const ratio = supplyKg / demandKg;
  if (ratio >= 1.35) return 'oversupply';
  if (ratio <= 0.65) return 'high_demand';
  return 'balanced';
};

type SnapshotRow = {
  label: string;
  category: string;
  biomassaType: string | null;
  grade: string | null;
  productCount: number;
  listingCount: number;
  totalStockKg: number;
  totalStockTon: Prisma.Decimal;
  provinceCount: number;
  orderCount30d: number;
  orderCount90d: number;
  openOrderCount: number;
  quantityKg30d: number;
  quantityKg90d: number;
  quantityTon90d: Prisma.Decimal;
  completedQuantityKg90d: number;
  supplyDemandRatio: Prisma.Decimal | null;
  balance: string;
  computedAt?: Date;
};

const snapshotToMetrics = (row: SnapshotRow): SupplyDemandMetrics => ({
  label: row.label,
  category: row.category,
  biomassaType: row.biomassaType,
  grade: row.grade,
  supply: {
    productCount: row.productCount,
    listingCount: row.listingCount,
    totalStockKg: row.totalStockKg,
    totalStockTon: toNum(row.totalStockTon),
    readySupplyTon: toNum(row.totalStockTon),
    provinceCount: row.provinceCount,
  },
  demand: {
    orderCount30d: row.orderCount30d,
    orderCount90d: row.orderCount90d,
    openOrderCount: row.openOrderCount,
    quantityKg30d: row.quantityKg30d,
    quantityKg90d: row.quantityKg90d,
    quantityTon90d: toNum(row.quantityTon90d),
    completedQuantityKg90d: row.completedQuantityKg90d,
    completedQuantityTon90d: kgToTon(row.completedQuantityKg90d),
  },
  supplyDemandRatio: row.supplyDemandRatio != null ? toNum(row.supplyDemandRatio) : null,
  balance: row.balance as SupplyDemandMetrics['balance'],
});

const computeMetricsForLabel = async (
  label: string,
  category?: string,
): Promise<SupplyDemandMetrics> => {
  const spec = resolveCommoditySpec(label);
  const [supply, demand] = await Promise.all([aggregateSupply(spec), aggregateDemand(spec)]);
  const ratio =
    demand.quantityKg90d > 0
      ? Math.round((supply.totalStockKg / demand.quantityKg90d) * 100) / 100
      : null;

  return {
    label,
    category: category ?? 'BIOMASSA',
    biomassaType: spec.biomassaTypes?.[0] ?? (spec.nameContains ? 'BIOCHAR' : null),
    grade: spec.grade ?? null,
    supply,
    demand,
    supplyDemandRatio: ratio,
    balance: resolveBalance(supply.totalStockKg, demand.quantityKg90d),
  };
};

const metricsToSnapshotData = (metrics: SupplyDemandMetrics) => ({
  label: metrics.label,
  category: metrics.category,
  biomassaType: metrics.biomassaType,
  grade: metrics.grade,
  productCount: metrics.supply.productCount,
  listingCount: metrics.supply.listingCount,
  totalStockKg: metrics.supply.totalStockKg,
  totalStockTon: new Prisma.Decimal(metrics.supply.totalStockTon),
  provinceCount: metrics.supply.provinceCount,
  orderCount30d: metrics.demand.orderCount30d,
  orderCount90d: metrics.demand.orderCount90d,
  openOrderCount: metrics.demand.openOrderCount,
  quantityKg30d: metrics.demand.quantityKg30d,
  quantityKg90d: metrics.demand.quantityKg90d,
  quantityTon90d: new Prisma.Decimal(metrics.demand.quantityTon90d),
  completedQuantityKg90d: metrics.demand.completedQuantityKg90d,
  supplyDemandRatio:
    metrics.supplyDemandRatio != null ? new Prisma.Decimal(metrics.supplyDemandRatio) : null,
  balance: metrics.balance,
  computedAt: new Date(),
});

/** Hitung ulang satu komoditas dan simpan ke tabel snapshot. */
export const recomputeSnapshotForLabel = async (
  label: string,
  category?: string,
): Promise<SupplyDemandMetrics> => {
  const metrics = await computeMetricsForLabel(label, category);
  const data = metricsToSnapshotData(metrics);

  const row = await prisma.marketSupplyDemandSnapshot.upsert({
    where: { label },
    create: data,
    update: data,
  });

  return snapshotToMetrics(row);
};

/** Rebuild semua snapshot komoditas yang didukung market trend. */
export const recomputeAllSnapshots = async (): Promise<number> => {
  const trends = await prisma.marketTrend.findMany({ orderBy: { label: 'asc' } });
  const supported = trends.filter((t) => isSupportedMarketTrend(t.label));

  await Promise.all(
    supported.map((trend) => recomputeSnapshotForLabel(trend.label, trend.category)),
  );

  await invalidateByPrefix('market:supply-demand');
  logger.info(`[SupplyDemand] ${supported.length} snapshot(s) diperbarui`);
  return supported.length;
};

/**
 * Jadwalkan refresh async (debounce) — dipanggil setelah create/update produk atau pesanan.
 * Tidak memblokir response API.
 */
export const scheduleSupplyDemandRefresh = (): void => {
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => {
    if (refreshRunning) return;
    refreshRunning = true;
    void recomputeAllSnapshots()
      .catch((err) => logger.warn('[SupplyDemand] async refresh gagal:', err))
      .finally(() => {
        refreshRunning = false;
      });
  }, REFRESH_DEBOUNCE_MS);
};

export const getSupplyDemandForLabel = async (
  label: string,
  category?: string,
): Promise<SupplyDemandMetrics> => {
  const cacheKey = buildCacheKey(
    'market',
    'supply-demand',
    'label',
    hashQuery({ label, category }),
  );
  return cacheAside(cacheKey, 120, async () => {
    const row = await prisma.marketSupplyDemandSnapshot.findUnique({ where: { label } });
    if (row) return snapshotToMetrics(row);
    return recomputeSnapshotForLabel(label, category);
  });
};

export const getSupplyDemandOverview = async (): Promise<{
  generatedAt: string;
  totals: {
    productCount: number;
    totalStockKg: number;
    totalStockTon: number;
    orderCount90d: number;
    totalDemandKg90d: number;
    totalDemandTon90d: number;
  };
  commodities: SupplyDemandMetrics[];
}> => {
  const cacheKey = buildCacheKey('market', 'supply-demand', 'overview');
  return cacheAside(cacheKey, 120, async () => {
    const trends = await prisma.marketTrend.findMany({ orderBy: { label: 'asc' } });
    const supported = trends.filter((t) => isSupportedMarketTrend(t.label));
    const labels = supported.map((t) => t.label);

    const existing = (await prisma.marketSupplyDemandSnapshot.findMany({
      where: { label: { in: labels } },
    })) as SnapshotRow[];
    const byLabel = new Map(existing.map((row) => [row.label, row]));

    const commodities = await Promise.all(
      supported.map(async (trend) => {
        const row = byLabel.get(trend.label);
        if (row) return snapshotToMetrics(row);
        return recomputeSnapshotForLabel(trend.label, trend.category);
      }),
    );

    const totals = commodities.reduce(
      (acc, row) => ({
        productCount: acc.productCount + row.supply.productCount,
        totalStockKg: acc.totalStockKg + row.supply.totalStockKg,
        totalStockTon: Math.round((acc.totalStockTon + row.supply.totalStockTon) * 10) / 10,
        orderCount90d: acc.orderCount90d + row.demand.orderCount90d,
        totalDemandKg90d: acc.totalDemandKg90d + row.demand.quantityKg90d,
        totalDemandTon90d:
          Math.round((acc.totalDemandTon90d + row.demand.quantityTon90d) * 10) / 10,
      }),
      {
        productCount: 0,
        totalStockKg: 0,
        totalStockTon: 0,
        orderCount90d: 0,
        totalDemandKg90d: 0,
        totalDemandTon90d: 0,
      },
    );

    const latestComputed = existing.reduce<Date | null>((max, row) => {
      if (!max || (row.computedAt && row.computedAt > max)) return row.computedAt ?? max;
      return max;
    }, null);

    return {
      generatedAt: (latestComputed ?? new Date()).toISOString(),
      totals,
      commodities,
    };
  });
};
