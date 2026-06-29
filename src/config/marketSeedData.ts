import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import type { MarketSeedPoint } from '#config/marketCommodity.config';

export type MarketSeedCommodity = {
  label: string;
  category: string;
  currentValue: string;
  trendType: string;
  historyData: MarketSeedPoint[];
  dataSources?: string[];
};

export type MarketSeedBundle = {
  version: string;
  generatedFrom: string[];
  periodRange: { from: string; to: string; months: number };
  commodities: MarketSeedCommodity[];
  harvestWaste: Array<{
    province: string;
    regency: string | null;
    biomassaType: string;
    volumeTon: number;
    year: number;
    source: string;
  }>;
};

const bundlePath = join(dirname(fileURLToPath(import.meta.url)), '../../data/market_seed_bundles.json');

let cached: MarketSeedBundle | null = null;

export const loadMarketSeedBundle = (): MarketSeedBundle => {
  if (cached) return cached;
  const raw = readFileSync(bundlePath, 'utf-8');
  cached = JSON.parse(raw) as MarketSeedBundle;
  return cached;
};

export const getMarketSeedBaselines = (): Record<string, MarketSeedPoint[]> => {
  const bundle = loadMarketSeedBundle();
  const out: Record<string, MarketSeedPoint[]> = {};
  for (const c of bundle.commodities) {
    out[c.label] = c.historyData.map((p) => ({ x: p.x, y: p.y, source: 'seed' as const }));
  }
  return out;
};

export const getMarketSeedCommodities = (): MarketSeedCommodity[] => loadMarketSeedBundle().commodities;

export const getHarvestWasteSeed = () => loadMarketSeedBundle().harvestWaste;
