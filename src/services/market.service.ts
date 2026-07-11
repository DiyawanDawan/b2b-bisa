import prisma from '#config/prisma';
import AppError from '#utils/appError';
import { TrendCategory } from '#prisma';
import {
  FORECAST_ALPHA,
  FORECAST_STEPS,
  ML_PREDICT_ENABLED,
  ML_SERVICE_API_KEY,
  ML_SERVICE_URL,
} from '#utils/env.util';
import {
  ensureMarketDataFresh,
  getLiveSnapshotForLabel,
  parseMarketHistory,
  syncAllMarketTrends,
} from '#services/marketAggregator.service';
import { isSupportedMarketTrend, resolveCommoditySpec } from '#config/marketCommodity.config';
import {
  resolveMarketInsight,
  MarketAnalyticsContext,
  inferProjectionTrendType,
} from '#utils/marketInsight.util';
import {
  getSupplyDemandForLabel,
  getSupplyDemandOverview,
} from '#services/marketSupplyDemand.service';

type HistoryPoint = { x: string; y: number };

type MlMarketForecastResponse = {
  projected_data: Array<{ x: string; y: number }>;
  model_version: string;
  confidence?: number | null;
};

const calculateExponentialSmoothing = (data: number[], alpha = 0.5, steps = 3): number[] => {
  if (data.length === 0) return [];

  const smoothedData = [data[0]];
  for (let i = 1; i < data.length; i++) {
    smoothedData.push(alpha * data[i] + (1 - alpha) * smoothedData[i - 1]);
  }

  const lastSmoothed = smoothedData[smoothedData.length - 1];
  const trend = (data[data.length - 1] - smoothedData[0]) / data.length;

  const forecasts: number[] = [];
  for (let i = 1; i <= steps; i++) {
    forecasts.push(lastSmoothed + trend * i);
  }
  return forecasts;
};

const projectMonths = (lastDateStr: string, steps: number): string[] => {
  const [yearStr, monthStr] = lastDateStr.split('-');
  let currentYear = parseInt(yearStr, 10);
  let currentMonth = parseInt(monthStr, 10);
  const months: string[] = [];

  for (let i = 0; i < steps; i++) {
    currentMonth++;
    if (currentMonth > 12) {
      currentMonth = 1;
      currentYear++;
    }
    months.push(`${currentYear}-${String(currentMonth).padStart(2, '0')}`);
  }
  return months;
};

const callMlMarketForecast = async (input: {
  label: string;
  history: HistoryPoint[];
  steps: number;
}): Promise<MlMarketForecastResponse | null> => {
  if (!ML_PREDICT_ENABLED || !ML_SERVICE_URL) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (ML_SERVICE_API_KEY) headers['X-ML-API-Key'] = ML_SERVICE_API_KEY;

    const response = await fetch(`${ML_SERVICE_URL.replace(/\/$/, '')}/v1/predict/market`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        label: input.label,
        history: input.history,
        steps: input.steps,
      }),
      signal: controller.signal as AbortSignal,
    });

    if (!response.ok) {
      console.warn('[MARKET] ML forecast failed:', response.status, await response.text());
      return null;
    }
    return (await response.json()) as MlMarketForecastResponse;
  } catch (error) {
    console.warn('[MARKET] ML service unreachable:', error);
    return null;
  } finally {
    clearTimeout(timeout);
  }
};

const buildProjectedData = (
  historyData: HistoryPoint[],
  steps: number,
  mlResult: MlMarketForecastResponse | null,
): { projectedData: HistoryPoint[]; forecastModel: string } => {
  if (mlResult?.projected_data?.length) {
    return {
      projectedData: mlResult.projected_data.map((d) => ({
        x: d.x,
        y: Math.round(d.y),
      })),
      forecastModel: mlResult.model_version ?? 'market_ml_v1',
    };
  }

  const values = historyData.map((d) => d.y);
  const rawForecasts = calculateExponentialSmoothing(values, FORECAST_ALPHA, steps);
  const lastDateStr = historyData[historyData.length - 1].x;
  const monthLabels = projectMonths(lastDateStr, steps);

  return {
    projectedData: rawForecasts.map((val, idx) => ({
      x: monthLabels[idx],
      y: Math.round(val),
    })),
    forecastModel: 'exponential_smoothing_v1',
  };
};

export const getMarketTrends = async (category?: TrendCategory) => {
  await ensureMarketDataFresh();
  const where = category ? { category } : {};
  const rows = await prisma.marketTrend.findMany({
    where,
    orderBy: { label: 'asc' },
  });
  return rows.filter((t) => isSupportedMarketTrend(t.label));
};

export const syncMarketData = () => syncAllMarketTrends();

export const getSupplyDemandAnalytics = () => getSupplyDemandOverview();

export const getPrediction = async (id: string) => {
  await ensureMarketDataFresh();

  const trend = await prisma.marketTrend.findUnique({ where: { id } });
  if (!trend) throw new AppError('Tren pasar tidak ditemukan', 404);
  if (!isSupportedMarketTrend(trend.label)) {
    throw new AppError('Komoditas pasar ini belum didukung untuk prediksi AI', 400);
  }

  const historyPoints = parseMarketHistory(trend.historyData).filter((p) => p.x);
  if (historyPoints.length === 0) {
    throw new AppError('Data historis tidak cukup untuk membuat prediksi', 400);
  }

  const historyData: HistoryPoint[] = historyPoints.map((p) => ({ x: p.x, y: p.y }));
  const live = await getLiveSnapshotForLabel(trend.label);
  const spec = resolveCommoditySpec(trend.label);

  const mlResult = await callMlMarketForecast({
    label: trend.label,
    history: historyData,
    steps: FORECAST_STEPS,
  });

  const { projectedData, forecastModel } = buildProjectedData(
    historyData,
    FORECAST_STEPS,
    mlResult,
  );

  const historyValues = historyData.map((d) => d.y);
  const projectedValues = projectedData.map((d) => d.y);
  const projectionTrendType = inferProjectionTrendType(historyValues, projectedValues);

  const insightCtx: MarketAnalyticsContext = {
    label: trend.label,
    trendType: projectionTrendType,
    historyValues,
    projectedValues,
    projectedMonths: projectedData.map((d) => d.x),
    ordersLast30Days: live.ordersLast30Days,
    ordersLast90Days: live.ordersLast90Days,
    activeListings: live.activeListings,
    medianListingPrice: live.medianListingPrice,
    momGrowthPct: live.momGrowthPct,
    forecastModel,
    dataSources: live.dataSources,
    lastSyncedAt: new Date().toISOString(),
  };

  const { insight, insightSource } = await resolveMarketInsight(insightCtx, spec.priceDisplay);
  const supplyDemand = await getSupplyDemandForLabel(trend.label, trend.category);

  return {
    id: trend.id,
    label: trend.label,
    category: trend.category,
    currentValue: trend.currentValue,
    trendType: projectionTrendType,
    historyData,
    projectedData,
    insight,
    analytics: {
      ordersLast30Days: live.ordersLast30Days,
      ordersLast90Days: live.ordersLast90Days,
      activeListings: live.activeListings,
      medianListingPrice: live.medianListingPrice,
      momGrowthPct: live.momGrowthPct,
      forecastModel,
      insightSource,
      dataSources: live.dataSources,
      lastSyncedAt: insightCtx.lastSyncedAt,
      mlConfidence: mlResult?.confidence ?? null,
      supplyDemand,
    },
  };
};
