import { BiocharGrade, BiomassaType, ProductMode, TrendCategory } from '#prisma';
import { getMarketSeedBaselines } from '#config/marketSeedData';

export type MarketPriceDisplay = 'per_kg' | 'per_ton' | 'flat';

export type MarketSeedPoint = {
  x: string;
  y: number;
  source?: 'seed';
};

export type MarketCommoditySpec = {
  labelPattern: RegExp;
  category?: TrendCategory;
  grade?: BiocharGrade;
  biomassaTypes?: BiomassaType[];
  productMode?: ProductMode;
  /** Product name must contain this (case-insensitive) when set */
  nameContains?: string;
  priceDisplay: MarketPriceDisplay;
  liveDataEnabled?: boolean;
  /** Min normalized price (per_kg display) to accept listing/order signal */
  minPrice?: number;
  /** Max normalized price (per_kg display) */
  maxPrice?: number;
};

export const MARKET_COMMODITY_SPECS: MarketCommoditySpec[] = [
  {
    labelPattern: /biochar.*grade\s*a|grade\s*a.*biochar|grade\s*a.*premium/i,
    category: TrendCategory.CARBON,
    grade: BiocharGrade.A,
    productMode: ProductMode.BIOMASS_MATERIAL,
    nameContains: 'biochar',
    priceDisplay: 'per_kg',
    minPrice: 1_000,
    maxPrice: 50_000,
  },
  {
    labelPattern: /biochar.*grade\s*b|grade\s*b.*biochar/i,
    category: TrendCategory.CARBON,
    grade: BiocharGrade.B,
    productMode: ProductMode.BIOMASS_MATERIAL,
    nameContains: 'biochar',
    priceDisplay: 'per_kg',
    minPrice: 800,
    maxPrice: 45_000,
  },
  {
    labelPattern: /biochar.*grade\s*c|grade\s*c.*biochar/i,
    category: TrendCategory.CARBON,
    grade: BiocharGrade.C,
    productMode: ProductMode.BIOMASS_MATERIAL,
    nameContains: 'biochar',
    priceDisplay: 'per_kg',
    minPrice: 500,
    maxPrice: 35_000,
  },
  {
    labelPattern: /biochar/i,
    category: TrendCategory.CARBON,
    productMode: ProductMode.BIOMASS_MATERIAL,
    nameContains: 'biochar',
    priceDisplay: 'per_kg',
    minPrice: 500,
    maxPrice: 50_000,
  },
  {
    labelPattern: /sekam\s*padi|padi.*sekam/i,
    category: TrendCategory.BIOMASSA,
    biomassaTypes: [BiomassaType.SEKAM_PADI],
    productMode: ProductMode.BIOMASS_MATERIAL,
    priceDisplay: 'per_kg',
    minPrice: 200,
    maxPrice: 5_000,
  },
  {
    labelPattern: /jagung|tongkol/i,
    category: TrendCategory.BIOMASSA,
    biomassaTypes: [BiomassaType.TONGKOL_JAGUNG],
    productMode: ProductMode.BIOMASS_MATERIAL,
    priceDisplay: 'per_kg',
    minPrice: 200,
    maxPrice: 8_000,
  },
  {
    labelPattern: /kelapa|tempurung/i,
    category: TrendCategory.BIOMASSA,
    biomassaTypes: [BiomassaType.TEMPURUNG_KELAPA],
    productMode: ProductMode.BIOMASS_MATERIAL,
    priceDisplay: 'per_kg',
    minPrice: 200,
    maxPrice: 10_000,
  },
  {
    labelPattern: /kargo|logistik|truk|shipping/i,
    category: TrendCategory.LOGISTICS,
    priceDisplay: 'flat',
    liveDataEnabled: false,
  },
];

/** Canonical seed history — generated from ml-bisa training data (2022–2026). */
export const MARKET_SEED_BASELINES: Record<string, MarketSeedPoint[]> = getMarketSeedBaselines();

// Legacy inline seed (replaced by market_seed_bundles.json via build_market_seed_bundles.py):
// Biochar Grade A + Sekam Padi — 12 bulan 2023 only

export const resolveCommoditySpec = (label: string): MarketCommoditySpec => {
  for (const spec of MARKET_COMMODITY_SPECS) {
    if (spec.labelPattern.test(label)) return spec;
  }
  return {
    labelPattern: /.^/,
    priceDisplay: 'per_kg',
    liveDataEnabled: false,
  };
};

/** Trend faker dari seed analytics lama — bukan komoditas BISA. */
export const isFakerMarketTrend = (label: string): boolean => /^Trend\s+/i.test(label.trim());

export const isRecognizedCommodity = (label: string): boolean =>
  MARKET_COMMODITY_SPECS.some((spec) => spec.labelPattern.test(label));

export const isSupportedMarketTrend = (label: string): boolean =>
  !isFakerMarketTrend(label) &&
  (isRecognizedCommodity(label) || resolveSeedBaseline(label) != null);

export const resolveSeedBaseline = (label: string): MarketSeedPoint[] | null => {
  if (MARKET_SEED_BASELINES[label]) return MARKET_SEED_BASELINES[label];
  const key = Object.keys(MARKET_SEED_BASELINES).find((k) =>
    label.toLowerCase().includes(k.toLowerCase().slice(0, 12)),
  );
  return key ? MARKET_SEED_BASELINES[key] : null;
};
