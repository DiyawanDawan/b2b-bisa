import prisma from '#config/prisma';
import { OrderStatus, ProductStatus, TrendType } from '#prisma';
import {
  MarketCommoditySpec,
  MarketPriceDisplay,
  isSupportedMarketTrend,
  resolveCommoditySpec,
  resolveSeedBaseline,
} from '#config/marketCommodity.config';

export type MarketHistoryPoint = {
  x: string;
  y: number;
  orderCount?: number;
  listingCount?: number;
  source?: 'bisa_live' | 'seed' | 'blended';
};

export type MarketLiveSnapshot = {
  ordersLast30Days: number;
  ordersLast90Days: number;
  activeListings: number;
  medianListingPrice: number | null;
  momGrowthPct: number | null;
  dataSources: string[];
  monthlyLive: Map<string, { medianY: number; orderCount: number; listingCount: number }>;
};

const SYNC_TTL_MS = 15 * 60 * 1000;
let lastSyncAt: Date | null = null;
let syncInFlight: Promise<Date> | null = null;

const toNumber = (value: unknown): number => {
  if (value == null) return 0;
  if (typeof value === 'number') return value;
  if (typeof value === 'object' && value !== null && 'toNumber' in value) {
    return (value as { toNumber: () => number }).toNumber();
  }
  return Number(value) || 0;
};

const monthKey = (date: Date): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
};

const parseHistory = (raw: unknown): MarketHistoryPoint[] => {
  if (!raw) return [];
  let data = raw;
  if (typeof raw === 'string') {
    try {
      data = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(data)) return [];

  return data
    .map((item): MarketHistoryPoint | null => {
      if (typeof item === 'number') {
        return { x: '', y: item, source: 'seed' };
      }
      if (item && typeof item === 'object' && 'y' in item) {
        const row = item as Record<string, unknown>;
        return {
          x: String(row.x ?? ''),
          y: toNumber(row.y),
          orderCount: row.orderCount != null ? Number(row.orderCount) : undefined,
          listingCount: row.listingCount != null ? Number(row.listingCount) : undefined,
          source: (row.source as MarketHistoryPoint['source']) ?? 'seed',
        };
      }
      return null;
    })
    .filter((p): p is MarketHistoryPoint => p != null && Number.isFinite(p.y));
};

const normalizeToDisplayPrice = (
  price: number,
  unit: string,
  display: MarketPriceDisplay,
): number => {
  if (display === 'flat') return price;
  if (display === 'per_ton') {
    return unit === 'KG' ? price * 1000 : price;
  }
  return unit === 'TON' ? price / 1000 : price;
};

const median = (values: number[]): number | null => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
};

const buildProductWhere = (spec: MarketCommoditySpec) => {
  const where: Record<string, unknown> = {
    status: ProductStatus.ACTIVE,
  };
  if (spec.productMode) where.productMode = spec.productMode;
  if (spec.grade) where.grade = spec.grade;
  if (spec.biomassaTypes?.length) where.biomassaType = { in: spec.biomassaTypes };
  if (spec.nameContains) {
    where.name = { contains: spec.nameContains };
  }
  return where;
};

const isPriceInBand = (price: number, spec: MarketCommoditySpec): boolean => {
  if (price <= 0) return false;
  if (spec.minPrice != null && price < spec.minPrice) return false;
  if (spec.maxPrice != null && price > spec.maxPrice) return false;
  return true;
};

const filterPrices = (prices: number[], spec: MarketCommoditySpec): number[] =>
  prices.filter((p) => isPriceInBand(p, spec));

export const collectLiveMarketSnapshot = async (
  spec: MarketCommoditySpec,
  priceDisplay: MarketPriceDisplay,
): Promise<MarketLiveSnapshot> => {
  if (spec.liveDataEnabled === false) {
    return {
      ordersLast30Days: 0,
      ordersLast90Days: 0,
      activeListings: 0,
      medianListingPrice: null,
      momGrowthPct: null,
      dataSources: ['benchmark_seed'],
      monthlyLive: new Map(),
    };
  }

  const now = new Date();
  const d30 = new Date(now);
  d30.setDate(d30.getDate() - 30);
  const d90 = new Date(now);
  d90.setDate(d90.getDate() - 90);
  const d12m = new Date(now);
  d12m.setMonth(d12m.getMonth() - 12);

  const productWhere = buildProductWhere(spec);

  const [listings, orderItems30, orderItems90, orderItems12m] = await Promise.all([
    prisma.product.findMany({
      where: productWhere,
      select: { pricePerUnit: true, unit: true },
    }),
    prisma.orderItem.findMany({
      where: {
        order: { status: OrderStatus.COMPLETED, createdAt: { gte: d30 } },
        product: productWhere,
      },
      select: { id: true },
    }),
    prisma.orderItem.findMany({
      where: {
        order: { status: OrderStatus.COMPLETED, createdAt: { gte: d90 } },
        product: productWhere,
      },
      select: { id: true },
    }),
    prisma.orderItem.findMany({
      where: {
        order: { status: OrderStatus.COMPLETED, createdAt: { gte: d12m } },
        product: productWhere,
      },
      select: {
        pricePerUnit: true,
        order: { select: { createdAt: true } },
        product: { select: { unit: true } },
      },
    }),
  ]);

  const listingPrices = filterPrices(
    listings.map((p) => normalizeToDisplayPrice(toNumber(p.pricePerUnit), p.unit, priceDisplay)),
    spec,
  );

  const dataSources: string[] = [];
  if (listingPrices.length > 0) dataSources.push('bisa_listings');
  if (orderItems90.length > 0) dataSources.push('bisa_orders');
  if (dataSources.length === 0) dataSources.push('historical_seed');

  const monthlyLive = new Map<
    string,
    { prices: number[]; orderCount: number; listingCount: number }
  >();

  for (const item of orderItems12m) {
    const key = monthKey(item.order.createdAt);
    const y = normalizeToDisplayPrice(toNumber(item.pricePerUnit), item.product.unit, priceDisplay);
    if (!isPriceInBand(y, spec)) continue;
    const bucket = monthlyLive.get(key) ?? { prices: [], orderCount: 0, listingCount: 0 };
    bucket.prices.push(y);
    bucket.orderCount += 1;
    monthlyLive.set(key, bucket);
  }

  const currentMonth = monthKey(now);
  const currentBucket = monthlyLive.get(currentMonth) ?? {
    prices: [],
    orderCount: 0,
    listingCount: 0,
  };
  currentBucket.listingCount = listingPrices.length;
  // Listing hanya dipakai jika belum ada order bulan ini DAN median masuk band harga wajar
  if (listingPrices.length > 0 && currentBucket.prices.length === 0) {
    currentBucket.prices.push(...listingPrices);
  }
  if (currentBucket.prices.length > 0 || currentBucket.orderCount > 0) {
    monthlyLive.set(currentMonth, currentBucket);
  }

  const monthlyResolved = new Map<
    string,
    { medianY: number; orderCount: number; listingCount: number }
  >();
  for (const [key, bucket] of monthlyLive.entries()) {
    const med = median(bucket.prices);
    if (med == null) continue;
    monthlyResolved.set(key, {
      medianY: med,
      orderCount: bucket.orderCount,
      listingCount: bucket.listingCount,
    });
  }

  const thisMonth = monthlyResolved.get(currentMonth)?.medianY ?? null;
  const prevMonthDate = new Date(now);
  prevMonthDate.setMonth(prevMonthDate.getMonth() - 1);
  const prevMonth = monthlyResolved.get(monthKey(prevMonthDate))?.medianY ?? null;
  const momGrowthPct =
    thisMonth != null && prevMonth != null && prevMonth > 0
      ? Math.round(((thisMonth - prevMonth) / prevMonth) * 1000) / 10
      : null;

  return {
    ordersLast30Days: orderItems30.length,
    ordersLast90Days: orderItems90.length,
    activeListings: listingPrices.length,
    medianListingPrice: median(listingPrices),
    momGrowthPct,
    dataSources,
    monthlyLive: monthlyResolved,
  };
};

const historyBaseline = (points: MarketHistoryPoint[]): number => {
  const values = points.map((p) => p.y).filter((y) => y > 0);
  if (values.length === 0) return 0;
  const tail = values.slice(-6);
  return median(tail) ?? tail[tail.length - 1] ?? 0;
};

const isPlausibleLivePrice = (candidate: number, baseline: number, orderCount: number): boolean => {
  if (candidate <= 0) return false;
  if (orderCount > 0) return true;
  if (baseline <= 0) return true;
  return candidate >= baseline * 0.35 && candidate <= baseline * 2.5;
};

const sanitizeHistoryTail = (points: MarketHistoryPoint[]): MarketHistoryPoint[] => {
  if (points.length < 4) return points;
  const baseline = historyBaseline(points.slice(0, -1));
  const last = points[points.length - 1];
  if (baseline > 0 && !isPlausibleLivePrice(last.y, baseline, last.orderCount ?? 0)) {
    return points.slice(0, -1);
  }
  return points;
};

const mergeHistoryWithLive = (
  seedHistory: MarketHistoryPoint[],
  live: MarketLiveSnapshot,
  spec: MarketCommoditySpec,
): MarketHistoryPoint[] => {
  const baseline = historyBaseline(seedHistory);
  const byMonth = new Map<string, MarketHistoryPoint>();

  for (const point of seedHistory) {
    if (point.x) byMonth.set(point.x, { ...point, source: point.source ?? 'seed' });
  }

  for (const [x, bucket] of live.monthlyLive.entries()) {
    const y = Math.round(bucket.medianY);
    if (!isPriceInBand(y, spec)) continue;
    if (!isPlausibleLivePrice(y, baseline, bucket.orderCount)) continue;

    byMonth.set(x, {
      x,
      y,
      orderCount: bucket.orderCount,
      listingCount: bucket.listingCount,
      source: bucket.orderCount > 0 ? 'bisa_live' : 'blended',
    });
  }

  const merged = [...byMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-18)
    .map(([, p]) => p);

  return sanitizeHistoryTail(merged);
};

const inferTrendType = (history: MarketHistoryPoint[]): TrendType => {
  if (history.length < 2) return TrendType.STABLE;
  const values = history.map((h) => h.y);
  const baseline = historyBaseline(history);
  const last = values[values.length - 1];
  const compareBase = baseline > 0 ? baseline : values[Math.max(0, values.length - 3)];
  if (last > compareBase * 1.03) return TrendType.UP;
  if (last < compareBase * 0.97) return TrendType.DOWN;
  return TrendType.STABLE;
};

export const formatMarketCurrentValue = (y: number, display: MarketPriceDisplay): string => {
  const rounded = Math.round(y);
  const formatted = rounded.toLocaleString('id-ID');
  if (display === 'flat') return `Rp ${formatted}`;
  if (display === 'per_ton') return `Rp ${formatted}/ton`;
  return `Rp ${formatted}/kg`;
};

export const syncMarketTrendRecord = async (trend: {
  id: string;
  label: string;
  historyData: unknown;
}) => {
  const spec = resolveCommoditySpec(trend.label);
  const priceDisplay = spec.priceDisplay;
  const seedFromConfig = resolveSeedBaseline(trend.label);
  const parsed = sanitizeHistoryTail(parseHistory(trend.historyData));
  const seedHistory: MarketHistoryPoint[] = seedFromConfig
    ? seedFromConfig.map((p) => ({ ...p, source: 'seed' as const }))
    : parsed;
  const live = await collectLiveMarketSnapshot(spec, priceDisplay);
  const merged = mergeHistoryWithLive(seedHistory, live, spec);

  if (merged.length === 0) return { trend, live };

  const lastY = merged[merged.length - 1].y;
  const trendType = inferTrendType(merged);

  await prisma.marketTrend.update({
    where: { id: trend.id },
    data: {
      historyData: merged,
      currentValue: formatMarketCurrentValue(lastY, priceDisplay),
      trendType,
    },
  });

  return {
    trend: {
      ...trend,
      historyData: merged,
      currentValue: formatMarketCurrentValue(lastY, priceDisplay),
      trendType,
    },
    live,
  };
};

export const syncAllMarketTrends = async (): Promise<{ synced: number; syncedAt: Date }> => {
  const trends = await prisma.marketTrend.findMany();
  let synced = 0;
  for (const trend of trends) {
    if (!isSupportedMarketTrend(trend.label)) continue;
    await syncMarketTrendRecord(trend);
    synced += 1;
  }
  const syncedAt = new Date();
  lastSyncAt = syncedAt;
  return { synced, syncedAt };
};

export const invalidateMarketSyncCache = (): void => {
  lastSyncAt = null;
};

export const ensureMarketDataFresh = async (): Promise<Date | null> => {
  if (lastSyncAt && Date.now() - lastSyncAt.getTime() < SYNC_TTL_MS) {
    return lastSyncAt;
  }
  if (syncInFlight) return syncInFlight;

  syncInFlight = syncAllMarketTrends()
    .then((r) => r.syncedAt)
    .finally(() => {
      syncInFlight = null;
    });

  return syncInFlight;
};

export const getLiveSnapshotForLabel = async (label: string) => {
  const spec = resolveCommoditySpec(label);
  return collectLiveMarketSnapshot(spec, spec.priceDisplay);
};

export const parseMarketHistory = parseHistory;
