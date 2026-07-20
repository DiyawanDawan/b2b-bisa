import {
  isKomshipDeliveryConfigured,
  KOMSHIP_DELIVERY_API_KEY,
  KOMSHIP_DELIVERY_BASE_URL,
  isRajaOngkirConfigured,
  RAJAONGKIR_BASE_URL,
  RAJAONGKIR_DEFAULT_COURIERS,
  SHIPPING_COST_API_KEY,
} from '#config/rajaongkir';
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

type RequestOpts = {
  method: 'GET' | 'POST';
  path: string;
  query?: Record<string, string | number | undefined>;
  body?: URLSearchParams;
};
// TODO: remove cast after running `prisma generate` for new Shipping* models.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

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

const loadActiveCouriersFromDb = async (): Promise<string[]> => {
  const rows = await db.shippingCourier.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
    select: { code: true },
  });
  const fromDb = normalizeCourierCodes(rows.map((r: { code: string }) => r.code));
  if (fromDb.length) return fromDb;
  return normalizeCourierCodes(RAJAONGKIR_DEFAULT_COURIERS);
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

const rajaDailyQuotaExceededUntil = 0;

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
  const activeCouriers = await loadActiveCouriersFromDb();
  if (!activeCouriers.length) {
    throw new AppError(
      'Ekspedisi aktif belum dikonfigurasi admin. Set terlebih dahulu di pengaturan shipping.',
      503,
    );
  }

  const body = new URLSearchParams();
  body.set('origin', String(params.originId));
  body.set('destination', String(params.destinationId));
  body.set('weight', String(weightGrams));
  body.set('courier', params.courier?.trim() || activeCouriers.join(':'));
  if (params.price) {
    body.set('price', params.price);
  }

  const data = await rajaRequest<RajaOngkirShippingOption[] | null>({
    method: 'POST',
    path: 'calculate/domestic-cost',
    body,
  });

  return Array.isArray(data) ? data : [];
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
  const options = await calculateDomesticCost({
    originId: params.originId,
    destinationId: params.destinationId,
    weight: params.weight,
    weightUnit: params.weightUnit,
    courier: params.courierCode,
  });

  if (options.length === 0) {
    throw new AppError(
      'Tidak ada layanan pengiriman untuk rute ini. Coba kurir atau tujuan lain.',
      400,
    );
  }

  const normalizedService = params.serviceCode?.trim() || params.serviceName?.trim();
  const match = options.find((o) => {
    const sameCourier = o.code.toLowerCase() === params.courierCode.toLowerCase();
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
      await txAny.shippingCourier.upsert({
        where: { code },
        update: {
          label: code.toUpperCase(),
          isActive: true,
          sortOrder: i,
        },
        create: {
          code,
          label: code.toUpperCase(),
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
