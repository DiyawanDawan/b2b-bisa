import { GOOGLE_GEMINI_API_KEY } from '#utils/env.util';
import fetch from 'node-fetch';
import { withRetry } from '#utils/retry.util';
import { GeminiResponse } from '#types/ai.types';

export type MarketAnalyticsContext = {
  label: string;
  trendType: string;
  historyValues: number[];
  projectedValues: number[];
  projectedMonths: string[];
  ordersLast30Days: number;
  ordersLast90Days: number;
  activeListings: number;
  medianListingPrice: number | null;
  momGrowthPct: number | null;
  forecastModel: string;
  dataSources: string[];
  lastSyncedAt: string;
};

const formatIdr = (value: number, mode: 'per_kg' | 'per_ton' | 'flat'): string => {
  const rounded = Math.round(value);
  const formatted = rounded.toLocaleString('id-ID');
  if (mode === 'flat') return `Rp ${formatted}`;
  if (mode === 'per_ton') return `Rp ${formatted}/ton`;
  return `Rp ${formatted}/kg`;
};

const medianOf = (values: number[]): number | null => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
};

const referencePrice = (historyValues: number[]): number => {
  if (historyValues.length === 0) return 0;
  const last = historyValues[historyValues.length - 1];
  const baseline = medianOf(historyValues.slice(-6)) ?? last;
  if (baseline > 0 && last < baseline * 0.35) return baseline;
  return last;
};

const projectionChangePct = (historyValues: number[], projectedValues: number[]): number => {
  const ref = referencePrice(historyValues);
  const projLast = projectedValues.at(-1) ?? ref;
  const rawChange = ref > 0 ? ((projLast - ref) / ref) * 100 : 0;
  return Math.round(Math.max(-99, Math.min(200, rawChange)) * 10) / 10;
};

/** Aligns list/detail badge with smart insight direction (±3% over 3-month projection). */
export const inferProjectionTrendType = (
  historyValues: number[],
  projectedValues: number[],
): 'UP' | 'DOWN' | 'STABLE' => {
  const changePct = projectionChangePct(historyValues, projectedValues);
  if (changePct >= 3) return 'UP';
  if (changePct <= -3) return 'DOWN';
  return 'STABLE';
};

export const buildSmartMarketInsight = (
  ctx: MarketAnalyticsContext,
  priceDisplay: 'per_kg' | 'per_ton' | 'flat',
): string => {
  const ref = referencePrice(ctx.historyValues);
  const changePct = projectionChangePct(ctx.historyValues, ctx.projectedValues);

  const direction = changePct >= 3 ? 'naik' : changePct <= -3 ? 'turun' : 'relatif stabil';

  const sourceNote =
    ctx.dataSources.includes('bisa_orders') || ctx.dataSources.includes('bisa_listings')
      ? `Data BISA live: ${ctx.ordersLast90Days} transaksi (90 hari), ${ctx.activeListings} listing aktif.`
      : 'Data referensi pasar + historis platform (belum ada transaksi BISA cukup untuk komoditas ini).';

  const priceNote = ref > 0 ? `Harga referensi saat ini ${formatIdr(ref, priceDisplay)}.` : '';

  let action = 'Pantau tren 2–4 minggu sebelum keputusan besar.';
  if (changePct >= 5) {
    action =
      'Proyeksi menunjukkan kenaikan — supplier dapat menahan stok berkualitas; petani perhatikan timing jual.';
  } else if (changePct <= -5) {
    action =
      'Tekanan harga diproyeksikan turun — pertimbangkan jual bertahap atau bundling nilai tambah (sertifikasi/IoT).';
  } else if (Math.abs(changePct) < 3) {
    action = 'Pasar stabil — fokus pada kualitas konsisten dan respons negosiasi cepat.';
  }

  if (ctx.momGrowthPct != null && ctx.momGrowthPct >= 10) {
    action += ' Momentum bulan-ini positif vs bulan lalu.';
  }

  const modelNote =
    ctx.forecastModel.startsWith('xgb') || ctx.forecastModel.startsWith('market_ml')
      ? 'Proyeksi dari model ML BISA.'
      : 'Proyeksi statistik dari historis.';

  return (
    `${ctx.label}: tren ${direction} (${changePct >= 0 ? '+' : ''}${changePct}% proyeksi 3 bulan). ` +
    `${priceNote} ${sourceNote} ${modelNote} ${action}`
  ).replace(/\s+/g, ' ').trim();
};

export const generateGeminiMarketInsight = async (
  ctx: MarketAnalyticsContext,
): Promise<string | null> => {
  if (!GOOGLE_GEMINI_API_KEY) return null;

  const prompt = `Anda analis pasar BISA (Biochar Indonesia Sustainable Agriculture).
Komoditas: "${ctx.label}"
Tren: ${ctx.trendType}
Historis harga (12 bln): ${JSON.stringify(ctx.historyValues)}
Proyeksi 3 bulan (${ctx.projectedMonths.join(', ')}): ${JSON.stringify(ctx.projectedValues)}
Transaksi BISA 30 hari: ${ctx.ordersLast30Days}, 90 hari: ${ctx.ordersLast90Days}
Listing aktif: ${ctx.activeListings}
Median listing: ${ctx.medianListingPrice ?? 'n/a'}
Pertumbuhan MoM: ${ctx.momGrowthPct ?? 'n/a'}%
Model forecast: ${ctx.forecastModel}
Sumber data: ${ctx.dataSources.join(', ')}

Tulis 2-3 kalimat analisis bisnis Bahasa Indonesia (profesional, mudah dipahami petani/supplier).
Sebutkan arah tren, sinyal dari data BISA jika ada, dan saran jual/tahan stok. Tanpa istilah teknis ML.`;

  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.5, maxOutputTokens: 220 },
  };

  try {
    const result = await withRetry(async () => {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GOOGLE_GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
      );
      const res = (await response.json()) as GeminiResponse;
      if (!response.ok) throw new Error(res.error?.message || 'Gemini market insight failed');
      return res;
    });
    return result.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? null;
  } catch (error) {
    console.error('[MARKET INSIGHT] Gemini error:', error);
    return null;
  }
};

export const resolveMarketInsight = async (
  ctx: MarketAnalyticsContext,
  priceDisplay: 'per_kg' | 'per_ton' | 'flat',
): Promise<{ insight: string; insightSource: 'gemini' | 'smart_rules' }> => {
  const gemini = await generateGeminiMarketInsight(ctx);
  if (gemini) return { insight: gemini, insightSource: 'gemini' };
  return {
    insight: buildSmartMarketInsight(ctx, priceDisplay),
    insightSource: 'smart_rules',
  };
};

export { formatIdr };
