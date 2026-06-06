import prisma from '#config/prisma';
import {
  ALLOWED_PLATFORM_SETTING_KEYS,
  PLATFORM_SETTING_DEFINITIONS,
  type PlatformSettingDefinition,
} from '#constants/platformSettings.definitions';
import AppError from '#utils/appError';
import { CACHE_TTL } from '#constants/cache.constants';
import { cacheAside, cacheKeys, invalidateSysSupport } from '#utils/cache.util';

const resolveEnvFallback = (def: PlatformSettingDefinition): string | null => {
  if (!def.envFallback) return null;
  const fromEnv = process.env[def.envFallback]?.trim();
  if (fromEnv) return fromEnv;
  if (def.key === 'PUBLIC_VERIFY_BASE_URL') {
    return process.env.CLIENT_HOST?.trim() || null;
  }
  return null;
};

export const listPlatformSettingsForAdmin = async () => {
  const rows = await prisma.platformSetting.findMany({
    where: { key: { in: [...ALLOWED_PLATFORM_SETTING_KEYS] } },
    select: { key: true, value: true, updatedAt: true },
  });
  const valueByKey = new Map(rows.map((r) => [r.key, r]));

  return PLATFORM_SETTING_DEFINITIONS.map((def) => {
    const row = valueByKey.get(def.key);
    const envValue = resolveEnvFallback(def);
    return {
      key: def.key,
      label: def.label,
      description: def.description,
      type: def.type,
      placeholder: def.placeholder ?? '',
      value: row?.value?.trim() || envValue || '',
      source: row ? 'database' : envValue ? 'environment' : 'empty',
      updatedAt: row?.updatedAt ?? null,
    };
  });
};

/** Payload publik untuk GET /system/support (Tier A cache). */
export const getPublicSupportConfig = async () =>
  cacheAside(cacheKeys.sysSupport(), CACHE_TTL.SYS_SUPPORT, async () => {
    const items = await listPlatformSettingsForAdmin();
    const map = Object.fromEntries(items.map((i) => [i.key, i.value.trim()]));
    const publicVerifyBaseUrl = (map.PUBLIC_VERIFY_BASE_URL || 'http://localhost:3001').replace(
      /\/$/,
      '',
    );
    return {
      supportWhatsapp: map.SUPPORT_WHATSAPP || '6281234567890',
      supportEmail: map.SUPPORT_EMAIL || 'cs@bisa.id',
      publicVerifyBaseUrl,
    };
  });

export const upsertPlatformSettings = async (
  settings: Record<string, string>,
  updatedBy?: string,
) => {
  const entries = Object.entries(settings);
  if (entries.length === 0) {
    throw new AppError('Tidak ada pengaturan yang dikirim.', 400);
  }

  for (const [key, rawValue] of entries) {
    if (!ALLOWED_PLATFORM_SETTING_KEYS.has(key)) {
      throw new AppError(`Key pengaturan tidak diizinkan: ${key}`, 400);
    }
    const value = rawValue.trim();
    if (!value) {
      throw new AppError(`Nilai untuk ${key} tidak boleh kosong.`, 400);
    }

    if (key === 'SUPPORT_EMAIL' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      throw new AppError('Format email CS tidak valid.', 400);
    }
    if (key === 'PUBLIC_VERIFY_BASE_URL') {
      try {
        const u = new URL(value);
        if (!['http:', 'https:'].includes(u.protocol)) {
          throw new Error('invalid protocol');
        }
      } catch {
        throw new AppError('URL verifikasi publik harus http atau https yang valid.', 400);
      }
    }
    if (key === 'SUPPORT_WHATSAPP' && !/^\+?[0-9]{10,15}$/.test(value.replace(/\s/g, ''))) {
      throw new AppError('Format nomor WhatsApp tidak valid (10–15 digit).', 400);
    }
    if (key === 'XENDIT_INVOICE_DURATION_SECONDS') {
      const n = Number(value);
      if (!Number.isFinite(n) || n < 300 || n > 604800) {
        throw new AppError('Durasi invoice harus antara 300 dan 604800 detik.', 400);
      }
    }
  }

  await prisma.$transaction(
    entries.map(([key, value]) =>
      prisma.platformSetting.upsert({
        where: { key },
        create: { key, value: value.trim() },
        update: { value: value.trim() },
      }),
    ),
  );

  void updatedBy;
  void invalidateSysSupport();

  return listPlatformSettingsForAdmin();
};
