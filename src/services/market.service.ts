import prisma from '#config/prisma';
import AppError from '#utils/appError';
import { TrendCategory } from '#prisma';
import { GOOGLE_GEMINI_API_KEY, FORECAST_ALPHA, FORECAST_STEPS } from '#utils/env.util';
import fetch from 'node-fetch';
import { withRetry } from '#utils/retry.util';
import { GeminiResponse } from '#types/ai.types';

/**
 * Get all market trends, optionally filtered by category
 */
export const getMarketTrends = async (category?: TrendCategory) => {
  const where = category ? { category } : {};
  return prisma.marketTrend.findMany({
    where,
    orderBy: { label: 'asc' },
  });
};

/**
 * Calculate Exponential Smoothing Forecasting
 * formula: S_t = alpha * Y_t + (1 - alpha) * S_{t-1}
 */
const calculateExponentialSmoothing = (data: number[], alpha = 0.5, steps = 3): number[] => {
  if (data.length === 0) return [];

  const smoothedData = [data[0]];
  for (let i = 1; i < data.length; i++) {
    const st = alpha * data[i] + (1 - alpha) * smoothedData[i - 1];
    smoothedData.push(st);
  }

  const lastSmoothed = smoothedData[smoothedData.length - 1];

  // Derive a simple trend component for forecasting
  const trend = (data[data.length - 1] - smoothedData[0]) / data.length;

  const forecasts = [];
  for (let i = 1; i <= steps; i++) {
    forecasts.push(lastSmoothed + trend * i);
  }

  return forecasts;
};

/**
 * Generate AI Insight for a market trend
 */
const generateMarketInsight = async (label: string, dataStr: string, projectionStr: string) => {
  if (!GOOGLE_GEMINI_API_KEY) {
    return 'Analisis cerdas tidak tersedia (API Key missing). Secara stastitik, perhatikan arah tren proyeksi nilai.';
  }

  const prompt = `Anda adalah Analis Pasar di platform BISA (Biochar Indonesia Sustainable Agriculture).
Kami memiliki komoditas: "${label}".
Berikut adalah trend data historis harganya dalam 12 bulan terakhir: ${dataStr}.
Berdasarkan Exponential Smoothing, proyeksi 3 bulan ke depan adalah: ${projectionStr}.

Tugas: Berikan 2-3 kalimat analisis pasar singkat (Bahasa Indonesia) yang profesional. Jelaskan apakah trennya naik/turun/stabil, dan berikan saran singkat kepada supplier/petani apakah mereka harus menahan stok atau segera menjual. Jangan sebutkan "Exponential Smoothing" atau teknis rumit, gunakan bahasa bisnis yang mudah dipahami.`;

  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.7, maxOutputTokens: 200 },
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
      if (!response.ok) {
        throw new Error(res.error?.message || 'Gagal menganalisis data pasar saat ini.');
      }
      return res;
    });

    return result.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || 'Insight tidak tersedia.';
  } catch (error) {
    console.error('[MARKET AI ERROR]', error);
    return 'Sistem analisis sedang sibuk.';
  }
};

/**
 * Get Price Prediction and Insight for a specific trend
 */
export const getPrediction = async (id: string) => {
  const trend = await prisma.marketTrend.findUnique({ where: { id } });
  if (!trend) throw new AppError('Tren pasar tidak ditemukan', 404);

  const historyData = trend.historyData as Array<{ x: string; y: number }> | null;
  if (!historyData || historyData.length === 0) {
    throw new AppError('Data historis tidak cukup untuk membuat prediksi', 400);
  }

  // Extract purely the numerical values
  const values = historyData.map((d) => d.y);

  // Forecast n periods ahead (dynamic)
  const rawForecasts = calculateExponentialSmoothing(values, FORECAST_ALPHA, FORECAST_STEPS);

  // Format the forecasts with dummy upcoming months
  const lastDateStr = historyData[historyData.length - 1].x; // e.g. "2023-12"
  const [yearStr, monthStr] = lastDateStr.split('-');
  let currentYear = parseInt(yearStr, 10);
  let currentMonth = parseInt(monthStr, 10);

  const projectedData = rawForecasts.map((val) => {
    currentMonth++;
    if (currentMonth > 12) {
      currentMonth = 1;
      currentYear++;
    }
    const mStr = currentMonth.toString().padStart(2, '0');
    return {
      x: `${currentYear}-${mStr}`,
      y: Math.round(val), // round to nearest integer for currency
    };
  });

  // Call Gemini for human-readable insight
  const historyString = JSON.stringify(values);
  const projectionString = JSON.stringify(projectedData.map((d) => d.y));

  const aiInsight = await generateMarketInsight(trend.label, historyString, projectionString);

  return {
    label: trend.label,
    currentValue: trend.currentValue,
    trendType: trend.trendType,
    historyData,
    projectedData,
    insight: aiInsight,
  };
};
