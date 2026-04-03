import prisma from '#config/prisma';
import { BiomassaType, BiocharGrade } from '#prisma';
import { GOOGLE_GEMINI_API_KEY } from '#utils/env.util';
import fetch from 'node-fetch';
import { withRetry } from '#utils/retry.util';
import { GeminiResponse } from '#types/ai.types';

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
) => {
  // Logic simulate XGBoost prediction
  const config = await getAiRuntimeConfig();

  // Factors: High Temp (>450) + Long Time (>120) -> Grade A
  let predictedGrade: BiocharGrade = BiocharGrade.B;
  let yieldPercent = config.defaultYield;
  let cOrganik = config.defaultCOrganik;

  if (
    data.suhuPirolisis >= config.gradeATempMin &&
    data.waktuPembakaran >= config.gradeABurnTimeMin
  ) {
    predictedGrade = BiocharGrade.A;
    yieldPercent = config.gradeAYield; // Higher quality usually means lower yield due to more carbonization
    cOrganik = config.gradeACOrganik;
  } else if (data.suhuPirolisis < config.gradeCTempMax) {
    predictedGrade = BiocharGrade.C;
    yieldPercent = config.gradeCYield;
    cOrganik = config.gradeCCOrganik;
  }

  const prediction = await prisma.aIPrediction.create({
    data: {
      userId,
      biomassaType: data.biomassaType,
      suhuPirolisis: data.suhuPirolisis,
      waktuPembakaran: data.waktuPembakaran,
      beratInput: data.beratInput,
      predictedGrade,
      predictedYield: yieldPercent,
      cOrganik,
      dosis: config.defaultDosis,
      rawOutput: JSON.stringify({ model: 'XGBoost-V1', version: '1.0.2' }),
    },
  });

  return prediction;
};

/**
 * AI Assistant for Biomass queries using Google Gemini API
 */
export const askAssistant = async (question: string): Promise<string> => {
  if (!GOOGLE_GEMINI_API_KEY) {
    return 'Maaf, asisten AI sedang tidak aktif. Mohon hubungi administrator (API Key missing).';
  }
  const config = await getAiRuntimeConfig();

  const systemInstructions = `
    Anda adalah "BISA Assistant", pakar Biochar dan Pertanian Sirkular dari platform BISA (Biochar Indonesia Sirkular Agriculture).
    Tujuan Anda: Membantu pengguna memahami produksi biochar, manajemen limbah organik, dan praktik pertanian berkelanjutan di Indonesia.
    
    ATURAN KETAT:
    1. HANYA jawab pertanyaan seputar Biochar, Pertanian, Limbah Biomassa, dan Ekosistem BISA.
    2. Jika pengguna bertanya di luar topik tersebut (seperti politik, hiburan umum, atau teknologi lain), tolak dengan sopan menggunakan gaya bahasa BISA: "Maaf, sebagai asisten pakar biochar, saya hanya dapat membantu Anda dalam topik pertanian sirkular dan pengelolaan limbah organik."
    3. Gunakan Bahasa Indonesia yang ramah, profesional, dan mudah dipahami petani maupun pebisnis.
    4. Jawaban harus ringkas namun informatif.
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
