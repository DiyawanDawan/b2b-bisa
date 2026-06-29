import prisma from '#config/prisma';
import { BiomassaType, BiocharGrade } from '#prisma';
import { GOOGLE_GEMINI_API_KEY, ML_PREDICT_ENABLED, ML_SERVICE_API_KEY, ML_SERVICE_URL } from '#utils/env.util';
import fetch from 'node-fetch';
import { withRetry } from '#utils/retry.util';
import { GeminiResponse } from '#types/ai.types';
import { retrieveRagContext } from '#services/knowledge.service';
import { isChromaConfigured } from '#services/chroma.service';

type MlPredictResponse = {
  predicted_grade: string;
  predicted_yield: number;
  c_organik: number;
  dosis_ton_ha: number;
  confidence?: number;
  model_version?: string;
  predicted_price_idr_per_ton?: number;
  price_min_idr_per_ton?: number;
  price_max_idr_per_ton?: number;
  predicted_total_idr?: number | null;
  price_benchmark_source?: string;
  price_model?: string;
  price_province?: string;
  raw_features?: Record<string, unknown>;
};

const ruleBasedPredict = (
  data: {
    suhuPirolisis: number;
    waktuPembakaran: number;
  },
  config: Awaited<ReturnType<typeof getAiRuntimeConfig>>,
) => {
  let predictedGrade: BiocharGrade = BiocharGrade.B;
  let yieldPercent = config.defaultYield;
  let cOrganik = config.defaultCOrganik;

  if (
    data.suhuPirolisis >= config.gradeATempMin &&
    data.waktuPembakaran >= config.gradeABurnTimeMin
  ) {
    predictedGrade = BiocharGrade.A;
    yieldPercent = config.gradeAYield;
    cOrganik = config.gradeACOrganik;
  } else if (data.suhuPirolisis < config.gradeCTempMax) {
    predictedGrade = BiocharGrade.C;
    yieldPercent = config.gradeCYield;
    cOrganik = config.gradeCCOrganik;
  }

  return {
    predictedGrade,
    predictedYield: yieldPercent,
    cOrganik,
    dosis: config.defaultDosis,
    rawOutput: JSON.stringify({ model: 'rule-based-fallback', version: '1.0.2' }),
  };
};

const callMlPredict = async (data: {
  biomassaType: BiomassaType;
  suhuPirolisis: number;
  waktuPembakaran: number;
  beratInput: number;
}): Promise<MlPredictResponse | null> => {
  if (!ML_PREDICT_ENABLED || !ML_SERVICE_URL) {
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (ML_SERVICE_API_KEY) {
      headers['X-ML-API-Key'] = ML_SERVICE_API_KEY;
    }

    const response = await fetch(`${ML_SERVICE_URL.replace(/\/$/, '')}/v1/predict/biochar`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        biomassa_type: data.biomassaType,
        suhu_pirolisis: Math.min(1000, Math.max(20, data.suhuPirolisis)),
        waktu_pembakaran: Math.min(1440, Math.max(1, data.waktuPembakaran)),
        berat_input: Math.min(100000, Math.max(1, data.beratInput)),
      }),
      signal: controller.signal as any,
    });

    if (!response.ok) {
      console.warn('[AI SERVICE] ML predict failed:', response.status, await response.text());
      return null;
    }

    return (await response.json()) as MlPredictResponse;
  } catch (error) {
    console.warn('[AI SERVICE] ML service unreachable:', error);
    return null;
  } finally {
    clearTimeout(timeout);
  }
};

const normalizeGrade = (grade: string): BiocharGrade => {
  const g = grade.trim().toUpperCase();
  if (g === 'A') return BiocharGrade.A;
  if (g === 'C') return BiocharGrade.C;
  return BiocharGrade.B;
};

const getAiRuntimeConfig = async () => {
  const keys = [
    'AI_TEMP_GRADE_A_MIN',
    'AI_BURN_TIME_GRADE_A_MIN',
    'AI_TEMP_GRADE_C_MAX',
    'AI_DEFAULT_YIELD',
    'AI_DEFAULT_C_ORGANIC',
    'AI_GRADE_A_YIELD',
    'AI_GRADE_A_C_ORGANIC',
    'AI_GRADE_C_YIELD',
    'AI_GRADE_C_C_ORGANIC',
    'AI_DEFAULT_DOSIS_TON_HA',
    'AI_ASSISTANT_TIMEOUT_MS',
  ] as const;

  const settings = await prisma.platformSetting.findMany({
    where: { key: { in: [...keys] } },
    select: { key: true, value: true },
  });
  const lookup = new Map(settings.map((item) => [item.key, item.value]));
  const getNumber = (key: (typeof keys)[number], fallback: number) => {
    const raw = Number(lookup.get(key));
    return Number.isFinite(raw) ? raw : fallback;
  };

  return {
    gradeATempMin: getNumber('AI_TEMP_GRADE_A_MIN', 450),
    gradeABurnTimeMin: getNumber('AI_BURN_TIME_GRADE_A_MIN', 120),
    gradeCTempMax: getNumber('AI_TEMP_GRADE_C_MAX', 300),
    defaultYield: getNumber('AI_DEFAULT_YIELD', 30.5),
    defaultCOrganik: getNumber('AI_DEFAULT_C_ORGANIC', 65),
    gradeAYield: getNumber('AI_GRADE_A_YIELD', 25),
    gradeACOrganik: getNumber('AI_GRADE_A_C_ORGANIC', 80),
    gradeCYield: getNumber('AI_GRADE_C_YIELD', 40),
    gradeCCOrganik: getNumber('AI_GRADE_C_C_ORGANIC', 45),
    defaultDosis: getNumber('AI_DEFAULT_DOSIS_TON_HA', 5),
    assistantTimeoutMs: getNumber('AI_ASSISTANT_TIMEOUT_MS', 10000),
  };
};
/**
 * Predict Biochar Quality based on pyrolysis parameters (XGBoost Logic Placeholder)
 */
export const predictBiocharQuality = async (
  userId: string,
  data: {
    biomassaType: BiomassaType;
    suhuPirolisis: number;
    waktuPembakaran: number;
    beratInput: number;
  },
  options: { meta?: Record<string, unknown> } = {},
) => {
  const config = await getAiRuntimeConfig();
  const mlResult = await callMlPredict(data);

  const resolved = mlResult
    ? {
        predictedGrade: normalizeGrade(mlResult.predicted_grade),
        predictedYield: mlResult.predicted_yield,
        cOrganik: mlResult.c_organik,
        dosis: mlResult.dosis_ton_ha ?? config.defaultDosis,
        rawOutput: JSON.stringify({
          model: mlResult.model_version ?? 'xgb-biochar-v1.2.0',
          inference_mode: (mlResult as MlPredictResponse & { inference_mode?: string }).inference_mode ?? 'xgb',
          models_used: (mlResult as MlPredictResponse & { models_used?: Record<string, boolean> }).models_used ?? null,
          confidence: mlResult.confidence ?? null,
          source: options.meta?.source ?? 'ml-service',
          predicted_price_idr_per_ton: mlResult.predicted_price_idr_per_ton ?? null,
          price_min_idr_per_ton: mlResult.price_min_idr_per_ton ?? null,
          price_max_idr_per_ton: mlResult.price_max_idr_per_ton ?? null,
          predicted_total_idr: mlResult.predicted_total_idr ?? null,
          price_benchmark_source: mlResult.price_benchmark_source ?? null,
          price_model: mlResult.price_model ?? null,
          price_province: mlResult.price_province ?? null,
          ...(options.meta ?? {}),
          raw_features: mlResult.raw_features ?? {},
        }),
      }
    : ruleBasedPredict(data, config);

  const fallbackRaw =
    resolved.rawOutput != null
      ? (() => {
          try {
            const parsed = JSON.parse(resolved.rawOutput) as Record<string, unknown>;
            return JSON.stringify({ ...parsed, ...(options.meta ?? {}) });
          } catch {
            return resolved.rawOutput;
          }
        })()
      : JSON.stringify({ model: 'rule-based-fallback', ...(options.meta ?? {}) });

  const prediction = await prisma.aIPrediction.create({
    data: {
      userId,
      biomassaType: data.biomassaType,
      suhuPirolisis: data.suhuPirolisis,
      waktuPembakaran: data.waktuPembakaran,
      beratInput: data.beratInput,
      predictedGrade: resolved.predictedGrade,
      predictedYield: resolved.predictedYield,
      cOrganik: resolved.cOrganik,
      dosis: resolved.dosis,
      rawOutput: mlResult ? resolved.rawOutput! : fallbackRaw,
    },
  });

  return prediction;
};

export const listRecentPredictions = async (
  userId: string,
  options: { limit?: number; iotOnly?: boolean } = {},
) => {
  const limit = Math.min(options.limit ?? 20, 50);
  const rows = await prisma.aIPrediction.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: options.iotOnly ? limit * 3 : limit,
  });

  const mapped = rows.map((row) => {
    let meta: Record<string, unknown> = {};
    try {
      meta = JSON.parse(row.rawOutput ?? '{}') as Record<string, unknown>;
    } catch {
      meta = {};
    }
    return {
      id: row.id,
      biomassaType: row.biomassaType,
      suhuPirolisis: row.suhuPirolisis != null ? Number(row.suhuPirolisis) : null,
      waktuPembakaran: row.waktuPembakaran,
      beratInput: row.beratInput != null ? Number(row.beratInput) : null,
      predictedGrade: row.predictedGrade,
      predictedYield: row.predictedYield != null ? Number(row.predictedYield) : null,
      cOrganik: row.cOrganik != null ? Number(row.cOrganik) : null,
      dosis: row.dosis != null ? Number(row.dosis) : null,
      source: (meta.source as string) ?? 'manual',
      iotDeviceId: (meta.deviceId as string) ?? null,
      iotDeviceName: (meta.deviceName as string) ?? null,
      createdAt: row.createdAt,
    };
  });

  if (options.iotOnly) {
    return mapped.filter((p) => p.source === 'iot-realtime').slice(0, limit);
  }
  return mapped.slice(0, limit);
};

/**
 * AI Assistant for Biomass queries using Google Gemini API
 */
export const askAssistant = async (question: string): Promise<string> => {
  if (!GOOGLE_GEMINI_API_KEY) {
    return 'Maaf, asisten AI sedang tidak aktif. Mohon hubungi administrator (API Key missing).';
  }
  const config = await getAiRuntimeConfig();

  let ragBlock = '';
  if (isChromaConfigured()) {
    try {
      const context = await retrieveRagContext(question);
      if (context) {
        ragBlock = `\n\nKONTEKS DOKUMEN INTERNAL BISA (gunakan sebagai referensi utama, jangan mengarang di luar konteks jika tidak yakin):\n${context}`;
      }
    } catch (error) {
      console.warn('[AI SERVICE] RAG retrieval failed:', error);
    }
  }

  const systemInstructions = `
    Anda adalah "BISA Assistant", pakar Biochar dan Pertanian Sirkular dari platform BISA (Biochar Indonesia Sirkular Agriculture).
    Tujuan Anda: Membantu pengguna memahami produksi biochar, manajemen limbah organik, dan praktik pertanian berkelanjutan di Indonesia.
    
    ATURAN KETAT:
    1. HANYA jawab pertanyaan seputar Biochar, Pertanian, Limbah Biomassa, dan Ekosistem BISA.
    2. Jika pengguna bertanya di luar topik tersebut (seperti politik, hiburan umum, atau teknologi lain), tolak dengan sopan menggunakan gaya bahasa BISA: "Maaf, sebagai asisten pakar biochar, saya hanya dapat membantu Anda dalam topik pertanian sirkular dan pengelolaan limbah organik."
    3. Gunakan Bahasa Indonesia yang ramah, profesional, dan mudah dipahami petani maupun pebisnis.
    4. Jawaban harus ringkas namun informatif.
    5. Jika ada konteks dokumen internal, prioritaskan informasi dari dokumen tersebut.
    ${ragBlock}
  `;

  const body = {
    contents: [
      {
        parts: [
          {
            text: `${systemInstructions}\n\nPertanyaan Pengguna: ${question}`,
          },
        ],
      },
    ],
  };

  try {
    const result = await withRetry(async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), config.assistantTimeoutMs);
      try {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GOOGLE_GEMINI_API_KEY}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal: controller.signal as any,
          },
        );

        const res = (await response.json()) as GeminiResponse;

        if (!response.ok) {
          console.error('[AI SERVICE] Gemini API Error:', res);
          throw new Error(res.error?.message || 'Gagal terhubung ke Gemini API');
        }
        return res;
      } finally {
        clearTimeout(timeout);
      }
    });

    const aiResponse = result.candidates?.[0]?.content?.parts?.[0]?.text;
    return aiResponse || 'Maaf, saya tidak dapat memproses jawaban saat ini.';
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[AI SERVICE] Assistant Error:', errMsg);
    return 'Maaf, terjadi gangguan saat menghubungi asisten AI kami.';
  }
};
