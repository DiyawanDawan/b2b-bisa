import prisma from '#config/prisma';
import { BiomassaType, UserStatus, ProductStatus, DeviceStatus } from '#prisma';
import AppError from '#utils/appError';
import { CACHE_TTL } from '#constants/cache.constants';
import { cacheAside, cacheKeys } from '#utils/cache.util';

/** Pusat provinsi — fallback marker bila lat/lng waste_data masih null. */
const PROVINCE_CENTROIDS: Record<string, { lat: number; lng: number }> = {
  'Jawa Barat': { lat: -6.9, lng: 107.6 },
  'Jawa Tengah': { lat: -7.15, lng: 110.0 },
  'Jawa Timur': { lat: -7.25, lng: 112.75 },
  'DI Yogyakarta': { lat: -7.8, lng: 110.37 },
  'Daerah Istimewa Yogyakarta': { lat: -7.8, lng: 110.37 },
  Banten: { lat: -6.4, lng: 106.1 },
  'DKI Jakarta': { lat: -6.2, lng: 106.8 },
  Lampung: { lat: -4.9, lng: 105.3 },
  'Sumatera Selatan': { lat: -3.3, lng: 104.0 },
  'Sumatera Utara': { lat: 2.1, lng: 99.1 },
  'Sumatera Barat': { lat: -0.9, lng: 100.4 },
  Riau: { lat: 0.5, lng: 101.5 },
  Jambi: { lat: -1.6, lng: 103.6 },
  Bengkulu: { lat: -3.8, lng: 102.3 },
  Aceh: { lat: 4.7, lng: 96.7 },
  'Sulawesi Selatan': { lat: -4.4, lng: 119.9 },
  'Sulawesi Utara': { lat: 1.5, lng: 124.8 },
  'Sulawesi Tengah': { lat: -1.4, lng: 121.4 },
  'Kalimantan Selatan': { lat: -3.3, lng: 114.6 },
  'Kalimantan Barat': { lat: -0.3, lng: 111.5 },
  'Kalimantan Timur': { lat: 0.5, lng: 116.2 },
  'Kalimantan Tengah': { lat: -1.7, lng: 113.4 },
  Bali: { lat: -8.4, lng: 115.2 },
  'Nusa Tenggara Barat': { lat: -8.58, lng: 117.5 },
  'Nusa Tenggara Timur': { lat: -9.7, lng: 121.0 },
  Papua: { lat: -4.3, lng: 138.0 },
  Maluku: { lat: -3.2, lng: 129.0 },
};

const INDONESIA_CENTROID = { lat: -2.5, lng: 118.0 };

const resolveProvinceCentroid = (province: string) => {
  const direct = PROVINCE_CENTROIDS[province];
  if (direct) return direct;
  const lower = province.trim().toLowerCase();
  for (const [name, coords] of Object.entries(PROVINCE_CENTROIDS)) {
    if (name.toLowerCase() == lower) return coords;
  }
  return INDONESIA_CENTROID;
};

/**
 * Get distribution of biomass waste potential across regions
 */
export const getWasteDistributionMap = async (filters: {
  province?: string;
  type?: BiomassaType;
}) => {
  const rows = await prisma.wasteData.findMany({
    where: {
      ...(filters.province && { province: filters.province }),
      ...(filters.type && { biomassaType: filters.type }),
    },
    orderBy: { volumeTon: 'desc' },
  });

  return rows.map((row) => {
    const centroid = resolveProvinceCentroid(row.province);
    return {
      id: row.id,
      province: row.province,
      regency: row.regency ?? '',
      biomassaType: row.biomassaType,
      volumeTon: Number(row.volumeTon),
      year: row.year,
      source: row.source,
      lat: row.lat != null ? Number(row.lat) : centroid.lat,
      lng: row.lng != null ? Number(row.lng) : centroid.lng,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  });
};

const haversineKm = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const normalizeLoc = (s?: string | null) =>
  (s ?? '')
    .trim()
    .toLowerCase()
    .replace(/^(kabupaten|kab\.?|kota)\s+/i, '');

type LocationMatchInput = {
  lat: number;
  lng: number;
  radiusKm?: number;
  biomassaType?: BiomassaType;
  regency?: string;
  province?: string;
};

/**
 * Supply-Demand Matching — produk & supplier terdekat (GIS → marketplace).
 */
export const matchSupplyDemandByLocation = async (input: LocationMatchInput) => {
  const radius = Math.min(Math.max(input.radiusKm ?? 100, 5), 500);
  const regencyNorm = normalizeLoc(input.regency);
  const provinceNorm = normalizeLoc(input.province);

  const products = await prisma.product.findMany({
    where: {
      status: ProductStatus.ACTIVE,
      stock: { gt: 0 },
      ...(input.biomassaType ? { biomassaType: input.biomassaType } : {}),
      user: { role: 'SUPPLIER', status: UserStatus.ACTIVE },
    },
    select: {
      id: true,
      name: true,
      biomassaType: true,
      stock: true,
      pricePerUnit: true,
      province: true,
      regency: true,
      thumbnailUrl: true,
      userId: true,
      user: {
        select: {
          id: true,
          fullName: true,
          province: true,
          regency: true,
          profile: { select: { companyName: true } },
          iotDevices: {
            where: { status: DeviceStatus.ACTIVE, lat: { not: null }, lng: { not: null } },
            select: { lat: true, lng: true },
            take: 3,
          },
        },
      },
    },
    take: 120,
  });

  type MatchRow = {
    productId: string;
    productName: string;
    supplierId: string;
    supplierName: string;
    biomassType: string;
    distance: number;
    volume: number;
    pricePerUnit: number;
    thumbnailUrl: string | null;
  };

  const matches: MatchRow[] = [];

  for (const p of products) {
    let distance: number | null = null;

    for (const dev of p.user.iotDevices) {
      if (dev.lat == null || dev.lng == null) continue;
      const d = haversineKm(input.lat, input.lng, Number(dev.lat), Number(dev.lng));
      distance = distance == null ? d : Math.min(distance, d);
    }

    const productRegency = normalizeLoc(p.regency ?? p.user.regency);
    const productProvince = normalizeLoc(p.province ?? p.user.province);

    if (distance == null) {
      if (regencyNorm && productRegency && productRegency.includes(regencyNorm)) {
        distance = 25;
      } else if (provinceNorm && productProvince && productProvince.includes(provinceNorm)) {
        distance = 60;
      } else {
        continue;
      }
    }

    if (distance > radius) continue;

    matches.push({
      productId: p.id,
      productName: p.name,
      supplierId: p.userId,
      supplierName: p.user.profile?.companyName?.trim() || p.user.fullName || 'Supplier',
      biomassType: p.biomassaType,
      distance: Math.round(distance * 10) / 10,
      volume: Number(p.stock),
      pricePerUnit: Number(p.pricePerUnit),
      thumbnailUrl: p.thumbnailUrl,
    });
  }

  matches.sort((a, b) => a.distance - b.distance);

  return {
    radius,
    matches: matches.slice(0, 30),
  };
};

/** Legacy: match by biomass type + regency name */
export const matchSupplyDemand = async (type: BiomassaType, regency?: string) => {
  return prisma.user.findMany({
    where: {
      role: 'SUPPLIER',
      status: UserStatus.ACTIVE,
      ...(regency && { regency }),
      products: {
        some: {
          biomassaType: type,
          status: ProductStatus.ACTIVE,
          stock: { gt: 0 },
        },
      },
    },
    select: {
      id: true,
      fullName: true,
      province: true,
      regency: true,
      products: {
        where: { biomassaType: type, status: ProductStatus.ACTIVE },
        select: { id: true, name: true, stock: true, pricePerUnit: true },
      },
    },
  });
};

/**
 * Get regions based on level and parentId
 */
export const getRegions = async (level: string, parentId?: string, search?: string) => {
  const normalizedLevel = level.toLowerCase();
  return cacheAside(
    cacheKeys.gisRegions(normalizedLevel, parentId, search?.trim()),
    CACHE_TTL.GIS,
    () => fetchRegions(normalizedLevel, parentId, search),
  );
};

const fetchRegions = async (level: string, parentId?: string, search?: string) => {
  const select = { id: true, name: true };
  const where: {
    name?: { contains: string };
    countryId?: string;
    provinceId?: string;
    regencyId?: string;
    districtId?: string;
  } = {};
  if (search) where.name = { contains: search };

  switch (level.toLowerCase()) {
    case 'country':
      return prisma.country.findMany({ where, select });

    case 'province':
      if (parentId) where.countryId = parentId;
      return prisma.province.findMany({ where, select });

    case 'regency':
      if (parentId) where.provinceId = parentId;
      return prisma.regency.findMany({ where, select });

    case 'district':
      if (parentId) where.regencyId = parentId;
      return prisma.district.findMany({ where, select });

    case 'village':
      if (parentId) where.districtId = parentId;
      return prisma.village.findMany({ where, select });

    default:
      throw new AppError('Level wilayah tidak valid.', 400);
  }
};
