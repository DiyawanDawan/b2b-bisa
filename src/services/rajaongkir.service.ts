import {
  isKomshipDeliveryConfigured,
  KOMSHIP_DELIVERY_API_KEY,
  KOMSHIP_DELIVERY_BASE_URL,
  isRajaOngkirConfigured,
  RAJAONGKIR_BASE_URL,
  RAJAONGKIR_DEFAULT_COURIERS,
  SHIPPING_COST_API_KEY,
} from '#config/rajaongkir';
import { BISA_EXPRESS_COURIER_CODE } from '#constants/bisa-express.constants';
import type {
  RajaOngkirApiResponse,
  KomshipPickupRequestBody,
  KomshipPickupResultItem,
  KomshipPickupVehicleOption,
  RajaOngkirDestination,
  RajaOngkirShippingOption,
  RajaOngkirWaybillData,
} from '#types/rajaongkir';
import AppError from '#utils/appError';
import fetch from 'node-fetch';
import prisma from '#config/prisma';
import { UnitStatus } from '#prisma';
import { toGrams } from '#utils/unit.util';
import { CACHE_TTL } from '#constants/cache.constants';
import { cacheAside, cacheKeys, invalidateShippingConfig } from '#utils/cache.util';
import {
  applyShippingMarkup,
  loadCourierMarkupMap,
  normalizeMarkupConfig,
} from '#utils/shipping-markup.util';
import logger from '#config/logger';

type RequestOpts = {
  method: 'GET' | 'POST';
  path: string;
  query?: Record<string, string | number | undefined>;
  body?: URLSearchParams;
};
// TODO: remove cast after running `prisma generate` for new Shipping* models.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

/** Kurir lokal (tarif DB) — tidak dikirim ke RajaOngkir. */
const LOCAL_COURIER_CODES = new Set([BISA_EXPRESS_COURIER_CODE]);

export type ShippingCourierProvider = 'rajaongkir' | 'local';

export type ShippingCourierRow = {
  id: string;
  code: string;
  label: string | null;
  isActive: boolean;
  sortOrder: number;
  /** Markup % di atas tarif dasar (null/0 = tanpa %). */
  markupPercent: number | null;
  /** Markup flat IDR di atas tarif dasar (null/0 = tanpa flat). */
  markupFlat: number | null;
  provider: ShippingCourierProvider;
  updatedAt: Date;
};

const isLocalCourierCode = (code: string): boolean =>
  LOCAL_COURIER_CODES.has(code.trim().toLowerCase());

const courierProvider = (code: string): ShippingCourierProvider =>
  isLocalCourierCode(code) ? 'local' : 'rajaongkir';

const mapCourierRow = (row: {
  id: string;
  code: string;
  label: string | null;
  isActive: boolean;
  sortOrder: number;
  markupPercent?: unknown;
  markupFlat?: unknown;
  updatedAt: Date;
}): ShippingCourierRow => {
  const markup = normalizeMarkupConfig(row);
  return {
    id: row.id,
    code: row.code,
    label: row.label,
    isActive: row.isActive,
    sortOrder: row.sortOrder,
    markupPercent: markup.markupPercent > 0 ? markup.markupPercent : null,
    markupFlat: markup.markupFlat > 0 ? markup.markupFlat : null,
    provider: courierProvider(row.code),
    updatedAt: row.updatedAt,
  };
};

const normalizeCourierCodes = (raw: unknown): string[] => {
  if (Array.isArray(raw)) {
    return Array.from(
      new Set(
        raw
          .map((it) => it?.toString().trim().toLowerCase())
          .filter((it): it is string => Boolean(it && it.length >= 2)),
      ),
    );
  }
  if (typeof raw === 'string') {
    return Array.from(
      new Set(
        raw
          .split(':')
          .map((it) => it.trim().toLowerCase())
          .filter((it) => it.length >= 2),
      ),
    );
  }
  return [];
};

/**
 * Kode kurir aktif dari DB. Fallback env hanya jika tabel masih kosong (belum di-seed).
 * Jika admin menonaktifkan semua kurir → kembalikan [] (jangan paksa default env).
 */
const loadActiveCouriersFromDb = async (): Promise<string[]> => {
  const rows = await db.shippingCourier.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
    select: { code: true },
  });
  const fromDb = normalizeCourierCodes(rows.map((r: { code: string }) => r.code));
  if (fromDb.length) return fromDb;

  const total = await db.shippingCourier.count();
  if (total === 0) {
    return normalizeCourierCodes(RAJAONGKIR_DEFAULT_COURIERS);
  }
  return [];
};

/** Kurir aktif yang boleh dihitung via RajaOngkir (exclude BISA Express dll.). */
const loadActiveRajaOngkirCourierCodes = async (): Promise<string[]> => {
  const active = await loadActiveCouriersFromDb();
  return active.filter((code) => !isLocalCourierCode(code));
};

export const isShippingCourierActive = async (code: string): Promise<boolean> => {
  const normalized = code.trim().toLowerCase();
  if (!normalized) return false;
  const row = await db.shippingCourier.findUnique({
    where: { code: normalized },
    select: { isActive: true },
  });
  if (row) return Boolean(row.isActive);
  // Tabel kosong / belum di-seed: izinkan default RajaOngkir saja
  const total = await db.shippingCourier.count();
  if (total === 0 && !isLocalCourierCode(normalized)) {
    return normalizeCourierCodes(RAJAONGKIR_DEFAULT_COURIERS).includes(normalized);
  }
  return false;
};

const normalizePickupVehicleOptions = (raw: unknown): KomshipPickupVehicleOption[] | null => {
  if (!Array.isArray(raw)) return null;

  const normalized: KomshipPickupVehicleOption[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const code = row.code?.toString() as 'Motor' | 'Mobil' | 'Truk' | undefined;
    if (!code || !['Motor', 'Mobil', 'Truk'].includes(code)) continue;
    const minTotalWeight = Number(row.minTotalWeight ?? 0);
    const parsedMax =
      row.maxPerOrderWeight === undefined || row.maxPerOrderWeight === null
        ? undefined
        : Number(row.maxPerOrderWeight);
    const weightUnitRaw = row.weightUnit?.toString().toUpperCase();
    const option: KomshipPickupVehicleOption = {
      code,
      label: row.label?.toString() || code,
      minTotalWeight: Number.isFinite(minTotalWeight) ? minTotalWeight : 0,
      weightUnit: weightUnitRaw === 'TON' ? 'TON' : 'KG',
      notes: row.notes?.toString() || '',
    };
    if (parsedMax !== undefined && Number.isFinite(parsedMax)) {
      option.maxPerOrderWeight = parsedMax;
    }
    normalized.push(option);
  }

  return normalized.length ? normalized : null;
};

const loadPickupVehicleOptionsFromDb = async (): Promise<KomshipPickupVehicleOption[] | null> => {
  const rows = await db.shippingPickupVehicle.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
    select: {
      id: true,
      code: true,
      label: true,
      minTotalWeight: true,
      maxPerOrderWeight: true,
      weightUnit: true,
      notes: true,
    },
  });
  if (!rows.length) return null;
  return normalizePickupVehicleOptions(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rows.map((row: any) => ({
      code: row.code,
      label: row.label,
      minTotalWeight: Number(row.minTotalWeight),
      maxPerOrderWeight: row.maxPerOrderWeight === null ? undefined : Number(row.maxPerOrderWeight),
      weightUnit: row.weightUnit === 'TON' ? 'TON' : 'KG',
      notes: row.notes ?? '',
    })),
  );
};

let rajaDailyQuotaExceededUntil = 0;

const isDailyQuotaError = (message: string): boolean =>
  /daily\s+limit/i.test(message) || /limit\s+exceeded/i.test(message);

const normalizeDestinationKeyword = (raw: string): string => {
  let keyword = raw.trim().replace(/\s+/g, ' ');
  keyword = keyword.replace(/^(kabupaten|kab\.?|kota)\s+/i, '');
  return keyword;
};

const isBlockedDestinationKeyword = (keyword: string): boolean => {
  const lower = keyword.toLowerCase();
  if (lower.length < 3) return true;
  const blocked = new Set(['indonesia', 'nusa tenggara barat', 'nusa tenggara', 'ntb', 'ntt']);
  if (blocked.has(lower)) return true;
  // Satu kata tanpa petunjuk administratif — biasanya provinsi/nama orang, boros kuota.
  if (!lower.includes(',') && !/(kab|kota|kec|kel|desa|prov)/i.test(lower)) {
    const words = lower.split(/\s+/).filter(Boolean);
    if (words.length <= 2) return true;
  }
  return false;
};

const rajaRequest = async <T>(opts: RequestOpts): Promise<T> => {
  if (Date.now() < rajaDailyQuotaExceededUntil) {
    throw new AppError(
      'Kuota harian API ongkir (RajaOngkir) sudah habis. Coba lagi besok atau hubungi admin.',
      429,
    );
  }
  if (!isRajaOngkirConfigured()) {
    throw new AppError(
      'Layanan ongkir belum dikonfigurasi. Set SHIPPING_COST_API_KEY di environment backend.',
      503,
    );
  }

  const url = new URL(`${RAJAONGKIR_BASE_URL}/${opts.path.replace(/^\//, '')}`);
  if (opts.query) {
    for (const [key, value] of Object.entries(opts.query)) {
      if (value !== undefined && value !== '') {
        url.searchParams.set(key, String(value));
      }
    }
  }

  const response = await fetch(url.toString(), {
    method: opts.method,
    headers: {
      key: SHIPPING_COST_API_KEY!,
      Authorization: `Bearer ${SHIPPING_COST_API_KEY!}`,
      ...(opts.body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
    },
    body: opts.body?.toString(),
  });

  const json = (await response.json()) as RajaOngkirApiResponse<T>;
  const meta = json?.meta;

  if (!response.ok || meta?.status === 'error') {
    const message =
      meta?.message ||
      `Permintaan RajaOngkir gagal (HTTP ${response.status}). Periksa parameter atau kuota API.`;
    if (isDailyQuotaError(message)) {
      const tomorrow = new Date();
      tomorrow.setHours(24, 0, 0, 0);
      rajaDailyQuotaExceededUntil = tomorrow.getTime();
      throw new AppError(
        'Kuota harian API ongkir (RajaOngkir) sudah habis. Coba lagi besok atau hubungi admin.',
        429,
      );
    }
    const code = meta?.code === 404 ? 404 : response.status >= 500 ? 502 : 400;
    throw new AppError(message, code);
  }

  return json.data;
};

/**
 * GET destination/domestic-destination — [Search Domestic Destination](https://www.rajaongkir.com/docs/shipping-cost/endpoint-rajaongkir-for-search-base/search-destination-rajaongkir)
 */
export const searchDomesticDestinations = async (params: {
  search: string;
  limit?: number;
  offset?: number;
}): Promise<RajaOngkirDestination[]> => {
  const keyword = normalizeDestinationKeyword(params.search);
  if (keyword.length < 2) {
    throw new AppError('Kata kunci pencarian minimal 2 karakter.', 400);
  }
  if (isBlockedDestinationKeyword(keyword)) {
    return [];
  }

  const cacheKey = cacheKeys.shipDest(keyword.toLowerCase(), params.limit, params.offset);

  return cacheAside(cacheKey, CACHE_TTL.SHIP_DEST, async () => {
    try {
      const data = await rajaRequest<RajaOngkirDestination[] | null>({
        method: 'GET',
        path: 'destination/domestic-destination',
        query: {
          search: keyword,
          limit: params.limit ?? 20,
          offset: params.offset ?? 0,
        },
      });

      return Array.isArray(data) ? data : [];
    } catch (error) {
      if (error instanceof AppError && error.statusCode === 404) {
        return [];
      }
      throw error;
    }
  });
};

/**
 * POST calculate/domestic-cost — [Calculate Domestic Cost](https://www.rajaongkir.com/docs/shipping-cost/endpoint-rajaongkir-for-search-base/calculate-domestic-cost)
 *
 * Hanya kurir aktif non-lokal. Jika RajaOngkir tidak dikonfigurasi / gagal → []
 * (graceful degrade; caller bisa tetap merge BISA Express dari DB).
 */
export const calculateDomesticCost = async (params: {
  originId: number;
  destinationId: number;
  weight: number;
  weightUnit: UnitStatus;
  courier?: string;
  price?: 'lowest' | 'highest';
}): Promise<RajaOngkirShippingOption[]> => {
  // RajaOngkir API only accepts grams — convert at boundary only
  const weightGrams = toGrams(params.weight, params.weightUnit);
  if (weightGrams < 1) {
    throw new AppError('Berat paket tidak valid.', 400);
  }

  const activeRaja = await loadActiveRajaOngkirCourierCodes();
  const requestedRaw = params.courier?.trim()
    ? normalizeCourierCodes(params.courier)
    : activeRaja;
  const courierCodes = requestedRaw.filter(
    (code) => activeRaja.includes(code) && !isLocalCourierCode(code),
  );

  if (!courierCodes.length) {
    return [];
  }

  if (!isRajaOngkirConfigured()) {
    logger.warn(
      'calculateDomesticCost: SHIPPING_COST_API_KEY belum di-set — skip RajaOngkir, lanjut opsi lokal jika ada.',
    );
    return [];
  }

  const body = new URLSearchParams();
  body.set('origin', String(params.originId));
  body.set('destination', String(params.destinationId));
  body.set('weight', String(weightGrams));
  body.set('courier', courierCodes.join(':'));
  if (params.price) {
    body.set('price', params.price);
  }

  try {
    const data = await rajaRequest<RajaOngkirShippingOption[] | null>({
      method: 'POST',
      path: 'calculate/domestic-cost',
      body,
    });

    const options = Array.isArray(data) ? data : [];
    const filtered = options.filter((o) =>
      courierCodes.includes(o.code?.toLowerCase?.() ?? ''),
    );
    if (!filtered.length) return [];

    const markupMap = await loadCourierMarkupMap(
      filtered.map((o) => o.code?.toLowerCase?.() ?? ''),
    );

    return filtered.map((o) => {
      const code = o.code?.toLowerCase?.() ?? '';
      const marked = applyShippingMarkup(Number(o.cost) || 0, markupMap.get(code));
      return {
        ...o,
        cost: marked.cost,
        baseCost: marked.baseCost,
        markupAmount: marked.markupAmount,
      };
    });
  } catch (error) {
    logger.warn(
      `calculateDomesticCost: RajaOngkir gagal — graceful degrade ke opsi lokal (${
        error instanceof Error ? error.message : String(error)
      })`,
    );
    return [];
  }
};

/**
 * Verifikasi pilihan ongkir saat checkout — hitung ulang dan cocokkan layanan + biaya.
 */
export const verifyShippingSelection = async (params: {
  originId: number;
  destinationId: number;
  weight: number;
  weightUnit: UnitStatus;
  courierCode: string;
  serviceCode?: string;
  serviceName?: string;
  expectedCost: number;
}): Promise<RajaOngkirShippingOption> => {
  const courierCode = params.courierCode.trim().toLowerCase();
  if (isLocalCourierCode(courierCode)) {
    throw new AppError('Kurir lokal harus diverifikasi lewat layanan lokal.', 400);
  }
  if (!(await isShippingCourierActive(courierCode))) {
    throw new AppError(
      'Kurir ini dinonaktifkan admin. Pilih ekspedisi lain atau hitung ulang ongkir.',
      400,
    );
  }

  const options = await calculateDomesticCost({
    originId: params.originId,
    destinationId: params.destinationId,
    weight: params.weight,
    weightUnit: params.weightUnit,
    courier: courierCode,
  });

  if (options.length === 0) {
    throw new AppError(
      'Tidak ada layanan pengiriman untuk rute ini. Coba kurir atau tujuan lain.',
      400,
    );
  }

  const normalizedService = params.serviceCode?.trim() || params.serviceName?.trim();
  const match = options.find((o) => {
    const sameCourier = o.code.toLowerCase() === courierCode;
    const sameService = normalizedService
      ? o.service === normalizedService || o.description === normalizedService
      : true;
    const sameCost = Math.abs(o.cost - params.expectedCost) <= 1;
    return sameCourier && sameService && sameCost;
  });

  if (!match) {
    throw new AppError(
      'Tarif ongkir tidak valid atau sudah berubah. Hitung ulang ongkir sebelum checkout.',
      400,
    );
  }

  return match;
};

/**
 * POST track/waybill — [Tracking AWB](https://www.rajaongkir.com/docs/shipping-cost/tracking)
 */
export const trackWaybill = async (params: {
  awb: string;
  courier: string;
  lastPhoneNumber?: string;
}): Promise<RajaOngkirWaybillData> => {
  const body = new URLSearchParams();
  body.set('awb', params.awb.trim());
  body.set('courier', params.courier.trim().toLowerCase());
  if (params.lastPhoneNumber?.trim()) {
    body.set('last_phone_number', params.lastPhoneNumber.trim());
  }

  const data = await rajaRequest<RajaOngkirWaybillData>({
    method: 'POST',
    path: 'track/waybill',
    query: {
      awb: params.awb.trim(),
      courier: params.courier.trim().toLowerCase(),
    },
    body,
  });

  return data ?? {};
};

export const getPickupVehicleOptions = async (): Promise<KomshipPickupVehicleOption[]> =>
  cacheAside(cacheKeys.shipVehicles(), CACHE_TTL.SHIP_VEHICLES, async () => {
    const fromDb = await loadPickupVehicleOptionsFromDb();
    if (!fromDb) {
      throw new AppError(
        'Konfigurasi pickup vehicle belum diatur admin. Simpan dulu via PUT /api/v1/shipping/pickup/vehicles.',
        503,
      );
    }
    return fromDb;
  });

export const setPickupVehicleOptions = async (
  options: KomshipPickupVehicleOption[],
): Promise<KomshipPickupVehicleOption[]> => {
  const normalized = normalizePickupVehicleOptions(options);
  if (!normalized) {
    throw new AppError('Format vehicle options tidak valid.', 400);
  }

  await prisma.$transaction(async (tx) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const txAny = tx as any;
    const activeCodes = normalized.map((it) => it.code);
    await txAny.shippingPickupVehicle.updateMany({
      where: { code: { notIn: activeCodes } },
      data: { isActive: false },
    });

    for (let i = 0; i < normalized.length; i += 1) {
      const item = normalized[i];
      await txAny.shippingPickupVehicle.upsert({
        where: { code: item.code },
        update: {
          label: item.label,
          minTotalWeight: item.minTotalWeight,
          maxPerOrderWeight: item.maxPerOrderWeight ?? null,
          weightUnit: item.weightUnit,
          notes: item.notes,
          sortOrder: i,
          isActive: true,
        },
        create: {
          code: item.code,
          label: item.label,
          minTotalWeight: item.minTotalWeight,
          maxPerOrderWeight: item.maxPerOrderWeight ?? null,
          weightUnit: item.weightUnit,
          notes: item.notes,
          sortOrder: i,
          isActive: true,
        },
      });
    }
  });
  void invalidateShippingConfig();
  return normalized;
};

export const getActiveCouriers = async (): Promise<string[]> =>
  cacheAside(cacheKeys.shipCouriers(), CACHE_TTL.SHIP_COURIERS, loadActiveCouriersFromDb);

/** Katalog lengkap (aktif + nonaktif) untuk admin — tanpa cache agar toggle langsung terlihat. */
export const listShippingCouriers = async (): Promise<ShippingCourierRow[]> => {
  // Pastikan BISA Express selalu ada di daftar manajemen
  await db.shippingCourier.upsert({
    where: { code: BISA_EXPRESS_COURIER_CODE },
    update: {},
    create: {
      code: BISA_EXPRESS_COURIER_CODE,
      label: 'BISA Express',
      isActive: true,
      sortOrder: 0,
    },
  });

  const rows = await db.shippingCourier.findMany({
    orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
    select: {
      id: true,
      code: true,
      label: true,
      isActive: true,
      sortOrder: true,
      markupPercent: true,
      markupFlat: true,
      updatedAt: true,
    },
  });

  return rows.map(mapCourierRow);
};

const clampMarkupPercent = (value: number | null | undefined): number | null => {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.min(999.99, Math.round(n * 100) / 100);
};

const clampMarkupFlat = (value: number | null | undefined): number | null => {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n);
};

export const updateShippingCourier = async (
  code: string,
  data: {
    isActive?: boolean;
    label?: string | null;
    sortOrder?: number;
    markupPercent?: number | null;
    markupFlat?: number | null;
  },
): Promise<ShippingCourierRow> => {
  const normalized = code.trim().toLowerCase();
  if (!normalized || normalized.length < 2) {
    throw new AppError('Kode kurir tidak valid.', 400);
  }

  const existing = await db.shippingCourier.findUnique({
    where: { code: normalized },
    select: { id: true },
  });
  if (!existing) {
    throw new AppError(`Kurir "${normalized}" tidak ditemukan.`, 404);
  }

  if (
    data.isActive === undefined &&
    data.label === undefined &&
    data.sortOrder === undefined &&
    data.markupPercent === undefined &&
    data.markupFlat === undefined
  ) {
    throw new AppError('Tidak ada field yang diubah.', 400);
  }

  const updated = await db.shippingCourier.update({
    where: { code: normalized },
    data: {
      ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
      ...(data.label !== undefined
        ? { label: data.label?.trim() || (isLocalCourierCode(normalized) ? 'BISA Express' : normalized.toUpperCase()) }
        : {}),
      ...(data.sortOrder !== undefined ? { sortOrder: data.sortOrder } : {}),
      ...(data.markupPercent !== undefined
        ? { markupPercent: clampMarkupPercent(data.markupPercent) }
        : {}),
      ...(data.markupFlat !== undefined ? { markupFlat: clampMarkupFlat(data.markupFlat) } : {}),
    },
    select: {
      id: true,
      code: true,
      label: true,
      isActive: true,
      sortOrder: true,
      markupPercent: true,
      markupFlat: true,
      updatedAt: true,
    },
  });

  void invalidateShippingConfig();
  return mapCourierRow(updated);
};

export const setActiveCouriers = async (couriers: string[]): Promise<string[]> => {
  const normalized = normalizeCourierCodes(couriers);
  if (!normalized.length) {
    throw new AppError('Minimal satu ekspedisi aktif wajib diisi.', 400);
  }

  await prisma.$transaction(async (tx) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const txAny = tx as any;
    await txAny.shippingCourier.updateMany({
      where: { code: { notIn: normalized } },
      data: { isActive: false },
    });

    for (let i = 0; i < normalized.length; i += 1) {
      const code = normalized[i];
      const label = isLocalCourierCode(code) ? 'BISA Express' : code.toUpperCase();
      await txAny.shippingCourier.upsert({
        where: { code },
        update: {
          label,
          isActive: true,
          sortOrder: i,
        },
        create: {
          code,
          label,
          isActive: true,
          sortOrder: i,
        },
      });
    }
  });
  void invalidateShippingConfig();
  return normalized;
};

export const requestCourierPickup = async (params: {
  pickupDate: string;
  pickupTime: string;
  pickupVehicle: 'Motor' | 'Mobil' | 'Truk';
  orders: { orderNo: string }[];
}): Promise<KomshipPickupResultItem[]> => {
  if (!isKomshipDeliveryConfigured()) {
    throw new AppError(
      'Layanan pickup belum dikonfigurasi. Set KOMSHIP_DELIVERY_API_KEY di environment backend.',
      503,
    );
  }

  const now = new Date();
  const requested = new Date(`${params.pickupDate}T${params.pickupTime}:00`);
  if (Number.isNaN(requested.getTime())) {
    throw new AppError('Format tanggal/jam pickup tidak valid.', 400);
  }
  const minAllowed = new Date(now.getTime() + 90 * 60 * 1000);
  if (requested < minAllowed) {
    throw new AppError('Pickup time minimal 90 menit dari waktu saat ini.', 400);
  }

  const payload: KomshipPickupRequestBody = {
    pickup_date: params.pickupDate,
    pickup_time: params.pickupTime,
    pickup_vehicle: params.pickupVehicle,
    orders: params.orders.map((it) => ({ order_no: it.orderNo })),
  };

  const response = await fetch(`${KOMSHIP_DELIVERY_BASE_URL}/pickup/request`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'x-api-key': KOMSHIP_DELIVERY_API_KEY!,
    },
    body: JSON.stringify(payload),
  });

  const json = (await response.json()) as RajaOngkirApiResponse<KomshipPickupResultItem[]>;
  if (!response.ok || json?.meta?.status === 'error') {
    const message =
      json?.meta?.message || `Request pickup gagal (HTTP ${response.status}). Periksa payload.`;
    throw new AppError(message, response.status >= 500 ? 502 : 400);
  }

  return Array.isArray(json.data) ? json.data : [];
};
