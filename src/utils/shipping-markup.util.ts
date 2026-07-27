import prisma from '#config/prisma';

export type ShippingMarkupConfig = {
  markupPercent: number;
  markupFlat: number;
};

export type ShippingMarkupResult = {
  /** Tarif final untuk pembeli (dibulatkan ke rupiah). */
  cost: number;
  /** Tarif dasar sebelum markup. */
  baseCost: number;
  /** Selisih markup (cost - baseCost), selalu ≥ 0. */
  markupAmount: number;
};

const toNonNegNumber = (value: unknown): number => {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
};

export const normalizeMarkupConfig = (
  row?: {
    markupPercent?: unknown;
    markupFlat?: unknown;
  } | null,
): ShippingMarkupConfig => ({
  markupPercent: toNonNegNumber(row?.markupPercent),
  markupFlat: toNonNegNumber(row?.markupFlat),
});

/**
 * final = round(base * (1 + percent/100) + flat)
 * Null/negatif diperlakukan sebagai 0; hasil tidak pernah di bawah base.
 */
export const applyShippingMarkup = (
  baseCost: number,
  config?: ShippingMarkupConfig | null,
): ShippingMarkupResult => {
  const base = Math.max(0, Number(baseCost) || 0);
  const percent = toNonNegNumber(config?.markupPercent);
  const flat = toNonNegNumber(config?.markupFlat);
  const raw = base * (1 + percent / 100) + flat;
  const cost = Math.max(base, Math.round(raw));
  return {
    cost,
    baseCost: base,
    markupAmount: cost - base,
  };
};

/** Muat markup per kode kurir (lowercase). Kode tanpa baris → 0/0. */
export const loadCourierMarkupMap = async (
  codes?: string[],
): Promise<Map<string, ShippingMarkupConfig>> => {
  const normalized = codes?.length
    ? Array.from(new Set(codes.map((c) => c.trim().toLowerCase()).filter((c) => c.length >= 2)))
    : undefined;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = prisma as any;
  const rows = await db.shippingCourier.findMany({
    where: normalized?.length ? { code: { in: normalized } } : undefined,
    select: { code: true, markupPercent: true, markupFlat: true },
  });

  const map = new Map<string, ShippingMarkupConfig>();
  for (const row of rows as Array<{
    code: string;
    markupPercent: unknown;
    markupFlat: unknown;
  }>) {
    map.set(row.code.trim().toLowerCase(), normalizeMarkupConfig(row));
  }
  return map;
};

export const loadCourierMarkup = async (code: string): Promise<ShippingMarkupConfig> => {
  const normalized = code.trim().toLowerCase();
  if (!normalized) return { markupPercent: 0, markupFlat: 0 };
  const map = await loadCourierMarkupMap([normalized]);
  return map.get(normalized) ?? { markupPercent: 0, markupFlat: 0 };
};
