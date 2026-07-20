import prisma from '#config/prisma';
import AppError from '#utils/appError';
import { generateBisaExpressAwb, resolveAwbWilayahCode } from '#utils/bisa-express-awb.util';
import {
  BISA_EXPRESS_COURIER_CODE,
  BISA_EXPRESS_COURIER_LABEL,
  DEFAULT_SERVICE_RULE_SEEDS,
  STATUS_TRANSITIONS,
  VIP_EXPRESS_SERVICE,
  statusToDeliveryLabel,
  type BisaExpressServiceType,
} from '#constants/bisa-express.constants';
import {
  BisaExpressStatus,
  DeliveryAttemptResult,
  DriverStatus,
  DriverVehicleType,
  HubType,
  OrderStatus,
  Prisma,
  UnitStatus,
} from '#prisma';
import { convertUnit, formatQty, isWithinWeightBand } from '#utils/unit.util';

type Tx = Prisma.TransactionClient;

/** Alamat tunggal untuk ongkir/jarak BISA Express — wajib dari UserProfile.address + GIS. */
export type ProfileShippingAddress = {
  userId: string;
  fullAddress: string;
  contactName: string;
  phone: string;
  latitude: number;
  longitude: number;
  provinceId: string;
  regencyId: string | null;
  provinceName: string | null;
  regencyName: string | null;
  /** Kode BPS provinsi (mis. 33) */
  provinceCode: string | null;
  /** Kode BPS kab/kota (mis. 3374) */
  regencyCode: string | null;
  /** Kode wilayah untuk AWB: regency → province */
  wilayahCode: string;
  zoneLabel: string;
};

const toNum = (v: Prisma.Decimal | number | null | undefined): number | null => {
  if (v == null) return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Haversine — jarak km dari lat/lng di tabel addresses (profile). */
export const haversineKm = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 10) / 10;
};

/**
 * Resolve zona dari GIS: Address.provinceId/regencyId → bisa_express_coverage.
 * Prioritas: coverage per kabupaten, lalu fallback coverage per provinsi.
 */
export const resolveZoneFromGis = async (
  provinceId: string,
  regencyId?: string | null,
): Promise<string | null> => {
  if (regencyId) {
    const byRegency = await prisma.bisaExpressCoverage.findFirst({
      where: {
        provinceId,
        regencyId,
        isActive: true,
      },
      select: { zone: true },
    });
    if (byRegency?.zone) return byRegency.zone;
  }

  const byProvince = await prisma.bisaExpressCoverage.findFirst({
    where: {
      provinceId,
      regencyId: null,
      isActive: true,
    },
    select: { zone: true },
  });
  return byProvince?.zone ?? null;
};

/**
 * Satu sumber data: Address yang terhubung ke UserProfile (+ FK GIS wilayah).
 * Tanpa ini BISA Express tidak boleh dihitung / dipilih.
 */
export const requireProfileAddress = async (
  userId: string,
  who: 'seller' | 'buyer' = 'seller',
): Promise<ProfileShippingAddress> => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      fullName: true,
      phone: true,
      profile: {
        select: {
          addressId: true,
          address: {
            select: {
              fullAddress: true,
              phoneNumber: true,
              latitude: true,
              longitude: true,
              provinceId: true,
              regencyId: true,
              province: { select: { id: true, name: true, code: true } },
              regency: { select: { id: true, name: true, code: true } },
            },
          },
        },
      },
    },
  });

  if (!user) {
    throw new AppError('User tidak ditemukan.', 404);
  }

  const addr = user.profile?.address;
  const lat = toNum(addr?.latitude);
  const lng = toNum(addr?.longitude);
  const fullAddress = addr?.fullAddress?.trim() ?? '';
  const provinceId = addr?.provinceId ?? addr?.province?.id ?? null;
  const regencyId = addr?.regencyId ?? addr?.regency?.id ?? null;
  const provinceName = addr?.province?.name?.trim() || null;
  const regencyName = addr?.regency?.name?.trim() || null;
  const provinceCode = addr?.province?.code?.trim() || null;
  const regencyCode = addr?.regency?.code?.trim() || null;

  if (!user.profile?.addressId || !addr || fullAddress.length < 10 || lat == null || lng == null) {
    const roleMsg =
      who === 'seller'
        ? 'Seller wajib melengkapi Alamat di Profil (tabel Address + lat/lng + GIS wilayah). Tanpa itu BISA Express tidak bisa dipakai.'
        : 'Buyer wajib melengkapi Alamat di Profil (tabel Address + lat/lng + GIS wilayah). Tanpa itu BISA Express tidak bisa dipakai.';
    throw new AppError(roleMsg, 400);
  }

  if (!provinceId) {
    throw new AppError(
      `${who === 'seller' ? 'Seller' : 'Buyer'} wajib memilih Provinsi GIS pada Alamat Profil.`,
      400,
    );
  }

  if (!provinceCode && !regencyCode) {
    throw new AppError(
      `${who === 'seller' ? 'Seller' : 'Buyer'}: data GIS wilayah belum punya kode wilayah (province/regency.code).`,
      400,
    );
  }

  const wilayahCode = resolveAwbWilayahCode({ regencyCode, provinceCode });
  const zoneLabel = [regencyName, provinceName].filter(Boolean).join(', ');

  return {
    userId: user.id,
    fullAddress,
    contactName: user.fullName,
    phone: addr.phoneNumber?.trim() || user.phone?.trim() || '-',
    latitude: lat,
    longitude: lng,
    provinceId,
    regencyId,
    provinceName,
    regencyName,
    provinceCode,
    regencyCode,
    wilayahCode,
    zoneLabel,
  };
};

export const resolveZonesFromGisAddresses = async (params: {
  originZone?: string;
  destinationZone?: string;
  origin?: Pick<ProfileShippingAddress, 'provinceId' | 'regencyId'>;
  destination?: Pick<ProfileShippingAddress, 'provinceId' | 'regencyId'>;
}): Promise<{ originZone: string; destinationZone: string }> => {
  let originZone = params.originZone?.trim() || null;
  let destinationZone = params.destinationZone?.trim() || null;

  if (!originZone && params.origin) {
    originZone = await resolveZoneFromGis(params.origin.provinceId, params.origin.regencyId);
  }
  if (!destinationZone && params.destination) {
    destinationZone = await resolveZoneFromGis(
      params.destination.provinceId,
      params.destination.regencyId,
    );
  }

  if (!originZone && destinationZone) originZone = destinationZone;
  if (!destinationZone && originZone) destinationZone = originZone;

  if (!originZone || !destinationZone) {
    throw new AppError(
      'Zona BISA Express tidak ditemukan di coverage GIS. Pastikan provinsi/kabupaten Alamat Profil terdaftar di coverage admin.',
      400,
    );
  }
  return { originZone, destinationZone };
};

export const checkCoverage = async (params: {
  originZone?: string;
  destinationZone?: string;
  sellerId?: string;
  buyerId?: string;
  origin?: Pick<ProfileShippingAddress, 'provinceId' | 'regencyId'>;
  destination?: Pick<ProfileShippingAddress, 'provinceId' | 'regencyId'>;
}) => {
  let distanceKm: number | null = null;
  let originGis = params.origin;
  let destGis = params.destination;

  if (params.sellerId || params.buyerId) {
    if (!params.sellerId || !params.buyerId) {
      throw new AppError(
        'BISA Express wajib sellerId + buyerId agar zona/jarak dari Alamat Profil + GIS.',
        400,
      );
    }
    const [origin, dest] = await Promise.all([
      requireProfileAddress(params.sellerId, 'seller'),
      requireProfileAddress(params.buyerId, 'buyer'),
    ]);
    originGis = origin;
    destGis = dest;
    distanceKm = haversineKm(origin.latitude, origin.longitude, dest.latitude, dest.longitude);
  }

  let originZone: string | null = params.originZone?.trim() || null;
  let destinationZone: string | null = params.destinationZone?.trim() || null;

  try {
    const resolved = await resolveZonesFromGisAddresses({
      originZone: params.originZone,
      destinationZone: params.destinationZone,
      origin: originGis,
      destination: destGis,
    });
    originZone = resolved.originZone;
    destinationZone = resolved.destinationZone;
  } catch {
    return {
      covered: false,
      originZone,
      destinationZone,
      distanceKm,
      reason: 'ZONE_UNKNOWN',
      requiresProfileAddress: true,
    };
  }

  const [originOk, destOk] = await Promise.all([
    prisma.bisaExpressCoverage.findFirst({
      where: { zone: originZone!, isActive: true, isPickup: true },
    }),
    prisma.bisaExpressCoverage.findFirst({
      where: { zone: destinationZone!, isActive: true, isDelivery: true },
    }),
  ]);

  return {
    covered: Boolean(originOk && destOk),
    originZone,
    destinationZone,
    distanceKm,
    reason: !originOk ? 'ORIGIN_NOT_COVERED' : !destOk ? 'DESTINATION_NOT_COVERED' : null,
    requiresProfileAddress: true,
  };
};

/**
 * Ongkir = base + perUnitCost × ceil(berat dikonversi ke weightUnit rate).
 */
const calcCost = (
  baseCost: number,
  perUnitCost: number,
  weight: number,
  weightUnit: UnitStatus,
  rateUnit: UnitStatus,
) => {
  const qty = convertUnit(weight, weightUnit, rateUnit);
  const billableUnits = Math.max(1, Math.ceil(qty));
  return baseCost + perUnitCost * billableUnits;
};

/** Aturan layanan vs berat dari DB (admin setting). */
export const listServiceRules = async (activeOnly = true) => {
  return prisma.bisaExpressServiceRule.findMany({
    where: activeOnly ? { isActive: true } : undefined,
    orderBy: [{ sortOrder: 'asc' }, { serviceType: 'asc' }],
  });
};

const ruleMatchesWeight = (
  rule: {
    alwaysAvailable: boolean;
    minWeight: number | { toNumber?: () => number } | string;
    maxWeight: number | { toNumber?: () => number } | string;
    weightUnit: UnitStatus;
  },
  weight: number,
  weightUnit: UnitStatus,
): boolean => {
  if (rule.alwaysAvailable) return true;
  const minWeight = Number(rule.minWeight);
  const maxWeight = Number(rule.maxWeight);
  return isWithinWeightBand({
    quantity: weight,
    quantityUnit: weightUnit,
    minWeight,
    maxWeight,
    bandUnit: rule.weightUnit,
  });
};

export const getAllowedServicesForWeight = async (
  weight: number,
  weightUnit: UnitStatus,
): Promise<string[]> => {
  const rules = await listServiceRules(true);
  if (rules.length === 0) {
    return DEFAULT_SERVICE_RULE_SEEDS.filter((r) => ruleMatchesWeight(r, weight, weightUnit)).map(
      (r) => r.serviceType,
    );
  }

  return rules.filter((r) => ruleMatchesWeight(r, weight, weightUnit)).map((r) => r.serviceType);
};

export const isServiceAllowedForWeight = async (
  serviceType: string,
  weight: number,
  weightUnit: UnitStatus,
): Promise<boolean> => {
  const allowed = await getAllowedServicesForWeight(weight, weightUnit);
  return allowed.includes(serviceType.trim().toUpperCase());
};

export const serviceEligibilityHint = async (
  weight: number,
  weightUnit: UnitStatus,
): Promise<string> => {
  const allowed = await getAllowedServicesForWeight(weight, weightUnit);
  return `Berat ${formatQty(weight, weightUnit)}: layanan yang boleh dipilih = ${allowed.join(', ') || '(tidak ada — atur di admin service rules)'}.`;
};

export const calculateRates = async (params: {
  originZone?: string;
  destinationZone?: string;
  /** Qty produk dalam UnitStatus (bukan gram) */
  weight: number;
  weightUnit: UnitStatus;
  serviceType?: string;
  itemValue?: number;
  /** Wajib: zona dari GIS Alamat Profil + jarak lat/lng */
  sellerId?: string;
  buyerId?: string;
}) => {
  let distanceKm: number | null = null;
  let originAddr: ProfileShippingAddress | null = null;
  let destAddr: ProfileShippingAddress | null = null;
  const productUnit = params.weightUnit;
  const weight = params.weight;

  if (!params.sellerId || !params.buyerId) {
    if (!params.originZone || !params.destinationZone) {
      throw new AppError(
        'BISA Express wajib sellerId + buyerId (zona dari GIS Alamat Profil).',
        400,
      );
    }
  } else {
    originAddr = await requireProfileAddress(params.sellerId, 'seller');
    destAddr = await requireProfileAddress(params.buyerId, 'buyer');
    distanceKm = haversineKm(
      originAddr.latitude,
      originAddr.longitude,
      destAddr.latitude,
      destAddr.longitude,
    );
  }

  const coverage = await checkCoverage({
    originZone: params.originZone,
    destinationZone: params.destinationZone,
    sellerId: params.sellerId,
    buyerId: params.buyerId,
    origin: originAddr ?? undefined,
    destination: destAddr ?? undefined,
  });
  if (!coverage.covered || !coverage.originZone || !coverage.destinationZone) {
    return [];
  }
  if (distanceKm == null && coverage.distanceKm != null) {
    distanceKm = coverage.distanceKm;
  }

  const allowedServices = await getAllowedServicesForWeight(weight, productUnit);
  if (params.serviceType) {
    const wanted = params.serviceType.toUpperCase();
    if (!(await isServiceAllowedForWeight(wanted, weight, productUnit))) {
      throw new AppError(
        `Layanan ${wanted} tidak tersedia untuk berat ini. ${await serviceEligibilityHint(weight, productUnit)}`,
        400,
      );
    }
  }

  const serviceFilter = params.serviceType ? [params.serviceType.toUpperCase()] : allowedServices;

  const rates = await prisma.bisaExpressRate.findMany({
    where: {
      originZone: coverage.originZone,
      destinationZone: coverage.destinationZone,
      isActive: true,
      serviceType: { in: serviceFilter },
    },
    orderBy: [{ serviceType: 'asc' }, { baseCost: 'asc' }],
  });

  // Prefer tarif yang weightUnit-nya sama dengan unit produk
  const preferred = rates.filter((r) => r.weightUnit === productUnit);
  const ratePool = preferred.length > 0 ? preferred : rates;

  const inBand = ratePool.filter((rate) => {
    if (!allowedServices.includes(rate.serviceType)) return false;
    if (rate.serviceType === VIP_EXPRESS_SERVICE) return true;
    return isWithinWeightBand({
      quantity: weight,
      quantityUnit: productUnit,
      minWeight: Number(rate.minWeight),
      maxWeight: Number(rate.maxWeight),
      bandUnit: rate.weightUnit,
    });
  });

  const seen = new Set<string>();
  const filtered = inBand.filter((rate) => {
    if (seen.has(rate.serviceType)) return false;
    seen.add(rate.serviceType);
    return true;
  });

  const weightRuleHint = await serviceEligibilityHint(weight, productUnit);

  return filtered.map((rate) => {
    const base = Number(rate.baseCost);
    const perUnit = Number(rate.perUnitCost);
    const cost = calcCost(base, perUnit, weight, productUnit, rate.weightUnit);
    const billableQty = Math.max(1, Math.ceil(convertUnit(weight, productUnit, rate.weightUnit)));
    const insurance =
      params.itemValue && params.itemValue > 0 ? Math.round(params.itemValue * 0.002) : 0;
    const isVip = rate.serviceType === VIP_EXPRESS_SERVICE;
    return {
      code: BISA_EXPRESS_COURIER_CODE,
      name: BISA_EXPRESS_COURIER_LABEL,
      service: rate.serviceType,
      description: isVip
        ? 'VIP Express — prioritas ontime, armada khusus (tarif premium)'
        : `BISA Express ${rate.serviceType}`,
      cost: cost + insurance,
      etd: isVip ? 'Ontime (prioritas)' : `${rate.etdDays} hari`,
      etdDays: rate.etdDays,
      originZone: rate.originZone,
      destinationZone: rate.destinationZone,
      insuranceCost: insurance,
      alwaysAvailable: isVip,
      priority: isVip,
      allowedByWeight: true,
      weightRuleHint,
      weightUnit: rate.weightUnit,
      perUnitCost: perUnit,
      billableUnits: billableQty,
      productWeightUnit: productUnit,
      weight,
      distanceKm,
      originFromProfile: originAddr
        ? {
            fullAddress: originAddr.fullAddress,
            zoneLabel: originAddr.zoneLabel,
            latitude: originAddr.latitude,
            longitude: originAddr.longitude,
          }
        : null,
      destinationFromProfile: destAddr
        ? {
            fullAddress: destAddr.fullAddress,
            zoneLabel: destAddr.zoneLabel,
            latitude: destAddr.latitude,
            longitude: destAddr.longitude,
          }
        : null,
    };
  });
};

export const listServices = async () => {
  const rules = await listServiceRules(true);
  const source =
    rules.length > 0
      ? rules
      : DEFAULT_SERVICE_RULE_SEEDS.map((r) => ({
          serviceType: r.serviceType,
          label: r.label,
          note: r.note,
          minWeight: r.minWeight,
          maxWeight: r.maxWeight,
          weightUnit: r.weightUnit,
          alwaysAvailable: r.alwaysAvailable,
        }));

  return source.map((r) => ({
    code: r.serviceType,
    label: r.label ?? r.serviceType,
    note: r.note ?? undefined,
    minWeight: Number(r.minWeight),
    maxWeight: Number(r.maxWeight),
    weightUnit: r.weightUnit,
    alwaysAvailable: r.alwaysAvailable,
    priority: r.serviceType === VIP_EXPRESS_SERVICE,
  }));
};

export const verifyBisaExpressSelection = async (params: {
  originId: number;
  destinationId: number;
  weight: number;
  weightUnit: UnitStatus;
  courierCode: string;
  serviceCode?: string;
  serviceName?: string;
  expectedCost: number;
  destinationLabel?: string;
  originLabel?: string;
  sellerId: string;
  buyerId: string;
}) => {
  const serviceType = (params.serviceCode || params.serviceName || 'REGULER').toUpperCase();
  const { weight, weightUnit } = params;

  if (!(await isServiceAllowedForWeight(serviceType, weight, weightUnit))) {
    throw new AppError(
      `Tidak bisa memilih ${serviceType} untuk berat ini. ${await serviceEligibilityHint(weight, weightUnit)}`,
      400,
    );
  }

  // Wajib Alamat Profil seller + buyer (satu sumber jarak)
  await Promise.all([
    requireProfileAddress(params.sellerId, 'seller'),
    requireProfileAddress(params.buyerId, 'buyer'),
  ]);

  const options = await calculateRates({
    weight,
    weightUnit,
    serviceType,
    sellerId: params.sellerId,
    buyerId: params.buyerId,
  });

  if (options.length === 0) {
    throw new AppError(
      `Rute/layanan tidak tersedia. ${await serviceEligibilityHint(weight, weightUnit)}`,
      400,
    );
  }

  const match = options.find((o) => Math.abs(o.cost - params.expectedCost) <= 1);
  if (!match) {
    throw new AppError(
      `Biaya BISA Express tidak cocok. Perkiraan terbaru: Rp ${options[0].cost.toLocaleString('id-ID')}`,
      400,
    );
  }

  return {
    code: BISA_EXPRESS_COURIER_CODE,
    name: BISA_EXPRESS_COURIER_LABEL,
    service: match.service,
    description: match.description,
    cost: match.cost,
    etd: match.etd,
  };
};

const assertTransition = (from: BisaExpressStatus, to: BisaExpressStatus) => {
  const allowed = STATUS_TRANSITIONS[from] ?? [];
  if (!allowed.includes(to)) {
    throw new AppError(`Transisi status ${from} → ${to} tidak diizinkan.`, 400);
  }
};

const syncShipmentTracking = async (
  orderId: string,
  shipment: {
    awbNumber: string;
    status: BisaExpressStatus;
    serviceType: string;
  },
  driverLat?: number | null,
  driverLng?: number | null,
  client: Tx | typeof prisma = prisma,
) => {
  await client.shipmentTracking.updateMany({
    where: { orderId },
    data: {
      awbNumber: shipment.awbNumber,
      courierCode: BISA_EXPRESS_COURIER_CODE,
      deliveryStatus: statusToDeliveryLabel(shipment.status),
      vesselName: `BISA Express · ${shipment.serviceType}`,
      currentLat: driverLat != null ? new Prisma.Decimal(driverLat) : undefined,
      currentLng: driverLng != null ? new Prisma.Decimal(driverLng) : undefined,
      lastTrackedAt: new Date(),
    },
  });
};

const maybeMarkOrderShipped = async (
  orderId: string,
  status: BisaExpressStatus,
  client: Tx | typeof prisma = prisma,
) => {
  if (
    status === BisaExpressStatus.PICKED_UP ||
    status === BisaExpressStatus.IN_TRANSIT_TO_HUB ||
    status === BisaExpressStatus.OUT_FOR_DELIVERY ||
    status === BisaExpressStatus.DELIVERED
  ) {
    await client.order.updateMany({
      where: {
        id: orderId,
        status: { in: [OrderStatus.PROCESSING, OrderStatus.CONFIRMED] },
      },
      data: { status: OrderStatus.SHIPPED },
    });
  }
};

const appendStatusLog = async (
  client: Tx | typeof prisma,
  data: {
    shipmentId: string;
    status: BisaExpressStatus;
    description: string;
    actorId?: string;
    actorType?: string;
    latitude?: number;
    longitude?: number;
    location?: string;
    photoUrl?: string;
  },
) => {
  await client.shipmentStatusLog.create({
    data: {
      shipmentId: data.shipmentId,
      status: data.status,
      description: data.description,
      actorId: data.actorId,
      actorType: data.actorType,
      latitude: data.latitude != null ? new Prisma.Decimal(data.latitude) : undefined,
      longitude: data.longitude != null ? new Prisma.Decimal(data.longitude) : undefined,
      location: data.location,
      photoUrl: data.photoUrl,
    },
  });
};

export const createShipmentFromPaidOrder = async (orderId: string) => {
  const existing = await prisma.bisaExpressShipment.findUnique({ where: { orderId } });
  if (existing) return existing;

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      orderShipping: true,
      seller: { select: { id: true, fullName: true, phone: true } },
      buyer: { select: { id: true, fullName: true, phone: true } },
    },
  });

  if (!order?.orderShipping) return null;
  if (order.orderShipping.courierCode.toLowerCase() !== BISA_EXPRESS_COURIER_CODE) return null;

  // Pickup & delivery koordinat: selalu dari Alamat Profil (tabel addresses)
  const [sellerAddr, buyerAddr] = await Promise.all([
    requireProfileAddress(order.sellerId, 'seller'),
    requireProfileAddress(order.buyerId, 'buyer'),
  ]);

  const awbNumber = await generateBisaExpressAwb({
    originWilayahCode: sellerAddr.wilayahCode,
    destinationWilayahCode: buyerAddr.wilayahCode,
  });
  const serviceType = (
    order.orderShipping.serviceCode ||
    order.orderShipping.serviceName ||
    'REGULER'
  ).toUpperCase();

  const shipment = await prisma.$transaction(async (tx) => {
    const created = await tx.bisaExpressShipment.create({
      data: {
        orderId,
        awbNumber,
        status: BisaExpressStatus.AWAITING_PICKUP,
        pickupAddress: sellerAddr.fullAddress,
        pickupContact: sellerAddr.contactName,
        pickupPhone: sellerAddr.phone,
        pickupLat: new Prisma.Decimal(sellerAddr.latitude),
        pickupLng: new Prisma.Decimal(sellerAddr.longitude),
        deliveryAddress: buyerAddr.fullAddress,
        deliveryContact: buyerAddr.contactName,
        deliveryPhone: buyerAddr.phone,
        deliveryLat: new Prisma.Decimal(buyerAddr.latitude),
        deliveryLng: new Prisma.Decimal(buyerAddr.longitude),
        weight: Number(order.orderShipping!.weight),
        weightUnit: order.orderShipping!.weightUnit,
        shippingCost: order.orderShipping!.shippingCost,
        serviceType,
        etdDays: order.orderShipping!.etd
          ? Number.parseInt(String(order.orderShipping!.etd).replace(/\D/g, ''), 10) || null
          : null,
      },
    });

    await appendStatusLog(tx, {
      shipmentId: created.id,
      status: BisaExpressStatus.AWAITING_PICKUP,
      description: `Shipment BISA Express dibuat · jarak profil ${haversineKm(sellerAddr.latitude, sellerAddr.longitude, buyerAddr.latitude, buyerAddr.longitude)} km`,
      actorType: 'SYSTEM',
    });

    await syncShipmentTracking(orderId, created, null, null, tx);
    return created;
  });

  return shipment;
};

export const getShipmentByOrderId = async (orderId: string, userId: string) => {
  const shipment = await prisma.bisaExpressShipment.findUnique({
    where: { orderId },
    include: {
      statusLogs: { orderBy: { createdAt: 'desc' }, take: 50 },
      pickupDriver: { select: { id: true, employeeCode: true, status: true, vehiclePlate: true } },
      deliveryDriver: {
        select: { id: true, employeeCode: true, status: true, vehiclePlate: true },
      },
      order: { select: { buyerId: true, sellerId: true, orderNumber: true } },
    },
  });
  if (!shipment) throw new AppError('Shipment BISA Express tidak ditemukan', 404);
  if (shipment.order.buyerId !== userId && shipment.order.sellerId !== userId) {
    throw new AppError('Akses ditolak', 403);
  }
  return shipment;
};

export const trackByAwb = async (awb: string) => {
  const shipment = await prisma.bisaExpressShipment.findUnique({
    where: { awbNumber: awb },
    include: {
      statusLogs: { orderBy: { createdAt: 'asc' } },
      pickupDriver: {
        select: { currentLat: true, currentLng: true, lastLocationAt: true, status: true },
      },
      deliveryDriver: {
        select: { currentLat: true, currentLng: true, lastLocationAt: true, status: true },
      },
    },
  });
  if (!shipment) throw new AppError('AWB tidak ditemukan', 404);
  return shipment;
};

export const getTimeline = async (shipmentId: string) => {
  return prisma.shipmentStatusLog.findMany({
    where: { shipmentId },
    orderBy: { createdAt: 'asc' },
  });
};

export const getLiveLocation = async (shipmentId: string) => {
  const shipment = await prisma.bisaExpressShipment.findUnique({
    where: { id: shipmentId },
    include: {
      deliveryDriver: {
        select: { currentLat: true, currentLng: true, lastLocationAt: true, status: true },
      },
      pickupDriver: {
        select: { currentLat: true, currentLng: true, lastLocationAt: true, status: true },
      },
    },
  });
  if (!shipment) throw new AppError('Shipment tidak ditemukan', 404);
  const driver =
    shipment.status === BisaExpressStatus.OUT_FOR_DELIVERY ||
    shipment.status === BisaExpressStatus.DELIVERED
      ? shipment.deliveryDriver
      : (shipment.pickupDriver ?? shipment.deliveryDriver);
  return {
    shipmentId,
    status: shipment.status,
    driver,
  };
};

export const requestPickup = async (
  sellerId: string,
  data: { orderId: string; pickupScheduledAt?: Date; sellerNote?: string },
) => {
  const order = await prisma.order.findFirst({
    where: { id: data.orderId, sellerId },
    include: { bisaExpressShipment: true, orderShipping: true },
  });
  if (!order) throw new AppError('Pesanan tidak ditemukan', 404);
  if (order.orderShipping?.courierCode.toLowerCase() !== BISA_EXPRESS_COURIER_CODE) {
    throw new AppError('Pesanan ini tidak memakai BISA Express', 400);
  }

  let shipment = order.bisaExpressShipment;
  if (!shipment) {
    shipment = await createShipmentFromPaidOrder(order.id);
  }
  if (!shipment) throw new AppError('Gagal membuat shipment', 500);

  return prisma.bisaExpressShipment.update({
    where: { id: shipment.id },
    data: {
      pickupScheduledAt: data.pickupScheduledAt,
      sellerNote: data.sellerNote,
    },
  });
};

export const updateSellerNote = async (sellerId: string, shipmentId: string, note: string) => {
  const shipment = await prisma.bisaExpressShipment.findUnique({
    where: { id: shipmentId },
    include: { order: { select: { sellerId: true } } },
  });
  if (!shipment || shipment.order.sellerId !== sellerId) {
    throw new AppError('Shipment tidak ditemukan', 404);
  }
  return prisma.bisaExpressShipment.update({
    where: { id: shipmentId },
    data: { sellerNote: note },
  });
};

export const listSellerShipments = async (sellerId: string) => {
  return prisma.bisaExpressShipment.findMany({
    where: { order: { sellerId } },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
};

const getDriverOrThrow = async (userId: string) => {
  const driver = await prisma.bisaExpressDriver.findUnique({ where: { userId } });
  if (!driver || !driver.isActive || driver.status === DriverStatus.SUSPENDED) {
    throw new AppError('Akun driver BISA Express tidak aktif', 403);
  }
  return driver;
};

export const listDriverAssignments = async (userId: string) => {
  const driver = await getDriverOrThrow(userId);
  return prisma.bisaExpressShipment.findMany({
    where: {
      OR: [{ pickupDriverId: driver.id }, { deliveryDriverId: driver.id }],
      status: {
        notIn: [
          BisaExpressStatus.DELIVERED,
          BisaExpressStatus.CANCELLED,
          BisaExpressStatus.RETURNED,
        ],
      },
    },
    orderBy: { createdAt: 'desc' },
  });
};

export const acceptAssignment = async (userId: string, shipmentId: string) => {
  const driver = await getDriverOrThrow(userId);
  const shipment = await prisma.bisaExpressShipment.findUnique({ where: { id: shipmentId } });
  if (!shipment) throw new AppError('Shipment tidak ditemukan', 404);
  if (
    shipment.pickupDriverId !== driver.id &&
    shipment.deliveryDriverId !== driver.id &&
    shipment.status !== BisaExpressStatus.AWAITING_PICKUP
  ) {
    throw new AppError('Assignment tidak untuk driver ini', 403);
  }

  assertTransition(shipment.status, BisaExpressStatus.PICKUP_ASSIGNED);

  return prisma.$transaction(async (tx) => {
    const updated = await tx.bisaExpressShipment.update({
      where: { id: shipmentId },
      data: {
        status: BisaExpressStatus.PICKUP_ASSIGNED,
        pickupDriverId: shipment.pickupDriverId ?? driver.id,
      },
    });
    await tx.bisaExpressDriver.update({
      where: { id: driver.id },
      data: { status: DriverStatus.ON_PICKUP },
    });
    await appendStatusLog(tx, {
      shipmentId,
      status: BisaExpressStatus.PICKUP_ASSIGNED,
      description: `Driver ${driver.employeeCode} menerima assignment`,
      actorId: driver.id,
      actorType: 'DRIVER',
    });
    await syncShipmentTracking(shipment.orderId, updated, null, null, tx);
    return updated;
  });
};

export const confirmPickup = async (
  userId: string,
  shipmentId: string,
  data: { photoUrl?: string; note?: string; latitude?: number; longitude?: number },
) => {
  const driver = await getDriverOrThrow(userId);
  const shipment = await prisma.bisaExpressShipment.findUnique({ where: { id: shipmentId } });
  if (!shipment || shipment.pickupDriverId !== driver.id) {
    throw new AppError('Shipment tidak di-assign ke driver ini', 403);
  }
  assertTransition(shipment.status, BisaExpressStatus.PICKED_UP);

  return prisma.$transaction(async (tx) => {
    const updated = await tx.bisaExpressShipment.update({
      where: { id: shipmentId },
      data: {
        status: BisaExpressStatus.PICKED_UP,
        pickedUpAt: new Date(),
        driverNote: data.note,
      },
    });
    await tx.bisaExpressDriver.update({
      where: { id: driver.id },
      data: { totalPickups: { increment: 1 } },
    });
    await appendStatusLog(tx, {
      shipmentId,
      status: BisaExpressStatus.PICKED_UP,
      description: 'Barang berhasil dijemput dari seller',
      actorId: driver.id,
      actorType: 'DRIVER',
      latitude: data.latitude,
      longitude: data.longitude,
      photoUrl: data.photoUrl,
    });
    await syncShipmentTracking(shipment.orderId, updated, data.latitude, data.longitude, tx);
    await maybeMarkOrderShipped(shipment.orderId, BisaExpressStatus.PICKED_UP, tx);
    return updated;
  });
};

export const arriveHub = async (
  userId: string,
  shipmentId: string,
  data: { hubId: string; note?: string },
) => {
  const driver = await getDriverOrThrow(userId);
  const shipment = await prisma.bisaExpressShipment.findUnique({ where: { id: shipmentId } });
  if (!shipment) throw new AppError('Shipment tidak ditemukan', 404);
  if (shipment.pickupDriverId !== driver.id && shipment.deliveryDriverId !== driver.id) {
    throw new AppError('Akses ditolak', 403);
  }

  const next =
    shipment.status === BisaExpressStatus.PICKED_UP ||
    shipment.status === BisaExpressStatus.IN_TRANSIT_TO_HUB
      ? BisaExpressStatus.AT_ORIGIN_HUB
      : BisaExpressStatus.AT_DESTINATION_HUB;

  if (shipment.status === BisaExpressStatus.PICKED_UP) {
    assertTransition(shipment.status, BisaExpressStatus.IN_TRANSIT_TO_HUB);
  } else {
    assertTransition(shipment.status, next);
  }

  return prisma.$transaction(async (tx) => {
    let current = shipment;
    if (shipment.status === BisaExpressStatus.PICKED_UP) {
      current = await tx.bisaExpressShipment.update({
        where: { id: shipmentId },
        data: {
          status: BisaExpressStatus.IN_TRANSIT_TO_HUB,
          originHubId: data.hubId,
        },
      });
      await appendStatusLog(tx, {
        shipmentId,
        status: BisaExpressStatus.IN_TRANSIT_TO_HUB,
        description: 'Dalam perjalanan ke hub',
        actorId: driver.id,
        actorType: 'DRIVER',
      });
    }

    const updated = await tx.bisaExpressShipment.update({
      where: { id: shipmentId },
      data: {
        status:
          current.status === BisaExpressStatus.IN_TRANSIT
            ? BisaExpressStatus.AT_DESTINATION_HUB
            : BisaExpressStatus.AT_ORIGIN_HUB,
        originHubId: shipment.originHubId ?? data.hubId,
        destinationHubId:
          current.status === BisaExpressStatus.IN_TRANSIT ? data.hubId : shipment.destinationHubId,
      },
    });

    await tx.shipmentHubLog.create({
      data: {
        shipmentId,
        hubId: data.hubId,
        action: 'RECEIVED',
        note: data.note,
        scannedBy: driver.id,
      },
    });

    await appendStatusLog(tx, {
      shipmentId,
      status: updated.status,
      description: data.note || 'Scan masuk hub',
      actorId: driver.id,
      actorType: 'DRIVER',
      location: data.hubId,
    });
    await syncShipmentTracking(shipment.orderId, updated, null, null, tx);
    return updated;
  });
};

export const departHub = async (
  userId: string,
  shipmentId: string,
  data: { hubId: string; note?: string },
) => {
  const driver = await getDriverOrThrow(userId);
  const shipment = await prisma.bisaExpressShipment.findUnique({ where: { id: shipmentId } });
  if (!shipment) throw new AppError('Shipment tidak ditemukan', 404);

  const next =
    shipment.status === BisaExpressStatus.AT_ORIGIN_HUB
      ? BisaExpressStatus.IN_TRANSIT
      : BisaExpressStatus.OUT_FOR_DELIVERY;
  assertTransition(shipment.status, next);

  return prisma.$transaction(async (tx) => {
    const updated = await tx.bisaExpressShipment.update({
      where: { id: shipmentId },
      data: {
        status: next,
        deliveryDriverId:
          next === BisaExpressStatus.OUT_FOR_DELIVERY ? driver.id : shipment.deliveryDriverId,
      },
    });
    await tx.shipmentHubLog.create({
      data: {
        shipmentId,
        hubId: data.hubId,
        action: 'DISPATCHED',
        note: data.note,
        scannedBy: driver.id,
      },
    });
    await appendStatusLog(tx, {
      shipmentId,
      status: next,
      description: data.note || 'Scan keluar hub',
      actorId: driver.id,
      actorType: 'DRIVER',
    });
    await syncShipmentTracking(shipment.orderId, updated, null, null, tx);
    return updated;
  });
};

export const outForDelivery = async (userId: string, shipmentId: string) => {
  const driver = await getDriverOrThrow(userId);
  const shipment = await prisma.bisaExpressShipment.findUnique({ where: { id: shipmentId } });
  if (!shipment) throw new AppError('Shipment tidak ditemukan', 404);
  assertTransition(shipment.status, BisaExpressStatus.OUT_FOR_DELIVERY);

  return prisma.$transaction(async (tx) => {
    const updated = await tx.bisaExpressShipment.update({
      where: { id: shipmentId },
      data: {
        status: BisaExpressStatus.OUT_FOR_DELIVERY,
        deliveryDriverId: driver.id,
      },
    });
    await tx.bisaExpressDriver.update({
      where: { id: driver.id },
      data: { status: DriverStatus.ON_DELIVERY },
    });
    await appendStatusLog(tx, {
      shipmentId,
      status: BisaExpressStatus.OUT_FOR_DELIVERY,
      description: 'Kurir mulai antar ke penerima',
      actorId: driver.id,
      actorType: 'DRIVER',
    });
    await syncShipmentTracking(shipment.orderId, updated, null, null, tx);
    await maybeMarkOrderShipped(shipment.orderId, BisaExpressStatus.OUT_FOR_DELIVERY, tx);
    return updated;
  });
};

export const confirmDeliver = async (
  userId: string,
  shipmentId: string,
  data: {
    podPhotoUrl: string;
    podSignatureUrl: string;
    podReceivedBy: string;
    podNote?: string;
    latitude?: number;
    longitude?: number;
  },
) => {
  const driver = await getDriverOrThrow(userId);
  const shipment = await prisma.bisaExpressShipment.findUnique({ where: { id: shipmentId } });
  if (!shipment || shipment.deliveryDriverId !== driver.id) {
    throw new AppError('Shipment tidak di-assign ke driver ini', 403);
  }
  assertTransition(shipment.status, BisaExpressStatus.DELIVERED);

  return prisma.$transaction(async (tx) => {
    const updated = await tx.bisaExpressShipment.update({
      where: { id: shipmentId },
      data: {
        status: BisaExpressStatus.DELIVERED,
        deliveredAt: new Date(),
        podPhotoUrl: data.podPhotoUrl,
        podSignatureUrl: data.podSignatureUrl,
        podReceivedBy: data.podReceivedBy,
        podNote: data.podNote,
      },
    });
    await tx.bisaExpressDriver.update({
      where: { id: driver.id },
      data: {
        status: DriverStatus.AVAILABLE,
        totalDeliveries: { increment: 1 },
      },
    });
    await tx.deliveryAttempt.create({
      data: {
        shipmentId,
        driverId: driver.id,
        attemptNumber: 1,
        result: DeliveryAttemptResult.SUCCESS,
        note: data.podNote,
        photoUrl: data.podPhotoUrl,
        latitude: data.latitude != null ? new Prisma.Decimal(data.latitude) : undefined,
        longitude: data.longitude != null ? new Prisma.Decimal(data.longitude) : undefined,
      },
    });
    await appendStatusLog(tx, {
      shipmentId,
      status: BisaExpressStatus.DELIVERED,
      description: `POD diterima oleh ${data.podReceivedBy}`,
      actorId: driver.id,
      actorType: 'DRIVER',
      latitude: data.latitude,
      longitude: data.longitude,
      photoUrl: data.podPhotoUrl,
    });
    await syncShipmentTracking(shipment.orderId, updated, data.latitude, data.longitude, tx);
    return updated;
  });
};

export const reportFailedDelivery = async (
  userId: string,
  shipmentId: string,
  data: {
    result: DeliveryAttemptResult;
    note?: string;
    photoUrl?: string;
    latitude?: number;
    longitude?: number;
  },
) => {
  const driver = await getDriverOrThrow(userId);
  const shipment = await prisma.bisaExpressShipment.findUnique({
    where: { id: shipmentId },
    include: { attempts: true },
  });
  if (!shipment || shipment.deliveryDriverId !== driver.id) {
    throw new AppError('Shipment tidak di-assign ke driver ini', 403);
  }
  assertTransition(shipment.status, BisaExpressStatus.FAILED_DELIVERY);

  const attemptNumber = shipment.attempts.length + 1;

  return prisma.$transaction(async (tx) => {
    const updated = await tx.bisaExpressShipment.update({
      where: { id: shipmentId },
      data: {
        status: BisaExpressStatus.FAILED_DELIVERY,
        failReason: data.note || data.result,
      },
    });
    await tx.deliveryAttempt.create({
      data: {
        shipmentId,
        driverId: driver.id,
        attemptNumber,
        result: data.result,
        note: data.note,
        photoUrl: data.photoUrl,
        latitude: data.latitude != null ? new Prisma.Decimal(data.latitude) : undefined,
        longitude: data.longitude != null ? new Prisma.Decimal(data.longitude) : undefined,
      },
    });
    await appendStatusLog(tx, {
      shipmentId,
      status: BisaExpressStatus.FAILED_DELIVERY,
      description: `Gagal kirim (percobaan ${attemptNumber}): ${data.result}`,
      actorId: driver.id,
      actorType: 'DRIVER',
      latitude: data.latitude,
      longitude: data.longitude,
      photoUrl: data.photoUrl,
    });
    await syncShipmentTracking(shipment.orderId, updated, data.latitude, data.longitude, tx);
    return updated;
  });
};

export const updateDriverLocation = async (
  userId: string,
  points: Array<{
    latitude: number;
    longitude: number;
    speed?: number;
    heading?: number;
    accuracy?: number;
    capturedAt?: Date;
  }>,
) => {
  const driver = await getDriverOrThrow(userId);
  const last = points[points.length - 1];

  await prisma.$transaction(async (tx) => {
    await tx.driverLocationLog.createMany({
      data: points.map((p) => ({
        driverId: driver.id,
        latitude: new Prisma.Decimal(p.latitude),
        longitude: new Prisma.Decimal(p.longitude),
        speed: p.speed != null ? new Prisma.Decimal(p.speed) : undefined,
        heading: p.heading != null ? new Prisma.Decimal(p.heading) : undefined,
        accuracy: p.accuracy != null ? new Prisma.Decimal(p.accuracy) : undefined,
        capturedAt: p.capturedAt ?? new Date(),
      })),
    });
    await tx.bisaExpressDriver.update({
      where: { id: driver.id },
      data: {
        currentLat: new Prisma.Decimal(last.latitude),
        currentLng: new Prisma.Decimal(last.longitude),
        lastLocationAt: last.capturedAt ?? new Date(),
      },
    });
  });

  return { ok: true, points: points.length };
};

export const updateDriverDutyStatus = async (userId: string, status: DriverStatus) => {
  const driver = await getDriverOrThrow(userId);
  if (status === DriverStatus.SUSPENDED) {
    throw new AppError('Status SUSPENDED hanya bisa diubah admin', 400);
  }
  return prisma.bisaExpressDriver.update({
    where: { id: driver.id },
    data: { status },
  });
};

export const getDriverStats = async (userId: string) => {
  const driver = await getDriverOrThrow(userId);
  return {
    employeeCode: driver.employeeCode,
    status: driver.status,
    totalPickups: driver.totalPickups,
    totalDeliveries: driver.totalDeliveries,
    avgRating: Number(driver.avgRating),
    vehicleType: driver.vehicleType,
    vehiclePlate: driver.vehiclePlate,
  };
};

// ── Admin ───────────────────────────────────────────────────────────────────

export const adminListDrivers = () =>
  prisma.bisaExpressDriver.findMany({
    include: {
      user: { select: { id: true, fullName: true, email: true, phone: true } },
      homeHub: { select: { id: true, code: true, name: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

export const adminCreateDriver = async (data: {
  userId: string;
  employeeCode: string;
  vehicleType?: DriverVehicleType;
  vehiclePlate?: string;
  maxCapacityKg?: number;
  homeHubId?: string;
}) => {
  return prisma.bisaExpressDriver.create({
    data: {
      userId: data.userId,
      employeeCode: data.employeeCode,
      vehicleType: data.vehicleType ?? DriverVehicleType.PICKUP_TRUCK,
      vehiclePlate: data.vehiclePlate,
      maxCapacityKg: data.maxCapacityKg ?? 1000,
      homeHubId: data.homeHubId,
    },
  });
};

export const adminUpdateDriver = async (
  id: string,
  data: Partial<{
    vehicleType: DriverVehicleType;
    vehiclePlate: string;
    maxCapacityKg: number;
    homeHubId: string | null;
    isActive: boolean;
    status: DriverStatus;
  }>,
) => {
  return prisma.bisaExpressDriver.update({ where: { id }, data });
};

export const adminSuspendDriver = async (id: string, suspend: boolean) => {
  return prisma.bisaExpressDriver.update({
    where: { id },
    data: {
      status: suspend ? DriverStatus.SUSPENDED : DriverStatus.OFF_DUTY,
      isActive: !suspend,
    },
  });
};

export const adminListHubs = () =>
  prisma.bisaExpressHub.findMany({
    include: { address: true },
    orderBy: { code: 'asc' },
  });

export const adminCreateHub = async (data: {
  code: string;
  name: string;
  type?: HubType;
  addressId: string;
  coverageProvinces?: string[];
  coverageRegencies?: string[];
  contactPhone?: string;
  contactName?: string;
  operatingHours?: string;
  maxDailyCapacity?: number;
}) => {
  return prisma.bisaExpressHub.create({
    data: {
      code: data.code,
      name: data.name,
      type: data.type ?? HubType.MAIN_HUB,
      addressId: data.addressId,
      coverageProvinces: data.coverageProvinces ?? undefined,
      coverageRegencies: data.coverageRegencies ?? undefined,
      contactPhone: data.contactPhone,
      contactName: data.contactName,
      operatingHours: data.operatingHours,
      maxDailyCapacity: data.maxDailyCapacity,
    },
  });
};

export const adminUpdateHub = async (id: string, data: Record<string, unknown>) => {
  return prisma.bisaExpressHub.update({ where: { id }, data });
};

export const adminDeactivateHub = async (id: string) => {
  return prisma.bisaExpressHub.update({ where: { id }, data: { isActive: false } });
};

export const adminListRates = () =>
  prisma.bisaExpressRate.findMany({ orderBy: [{ originZone: 'asc' }, { destinationZone: 'asc' }] });

export const adminListServiceRules = () => listServiceRules(false);

export const adminUpsertServiceRule = async (data: {
  serviceType: string;
  label?: string | null;
  minWeight: number;
  maxWeight: number;
  weightUnit?: UnitStatus;
  alwaysAvailable?: boolean;
  isActive?: boolean;
  sortOrder?: number;
  note?: string | null;
}) => {
  const serviceType = data.serviceType.trim().toUpperCase();
  const weightUnit = data.weightUnit ?? UnitStatus.KG;
  return prisma.bisaExpressServiceRule.upsert({
    where: { serviceType },
    create: {
      serviceType,
      label: data.label ?? serviceType,
      minWeight: data.minWeight,
      maxWeight: data.maxWeight,
      weightUnit,
      alwaysAvailable: data.alwaysAvailable ?? false,
      isActive: data.isActive ?? true,
      sortOrder: data.sortOrder ?? 0,
      note: data.note ?? null,
    },
    update: {
      label: data.label ?? undefined,
      minWeight: data.minWeight,
      maxWeight: data.maxWeight,
      weightUnit,
      alwaysAvailable: data.alwaysAvailable,
      isActive: data.isActive,
      sortOrder: data.sortOrder,
      note: data.note,
    },
  });
};

export const adminUpdateServiceRule = async (id: string, data: Record<string, unknown>) => {
  const payload = { ...data };
  if (typeof payload.serviceType === 'string') {
    payload.serviceType = payload.serviceType.trim().toUpperCase();
  }
  return prisma.bisaExpressServiceRule.update({ where: { id }, data: payload });
};

export const adminDeleteServiceRule = async (id: string) => {
  return prisma.bisaExpressServiceRule.update({
    where: { id },
    data: { isActive: false },
  });
};

export const adminCreateRate = async (data: {
  originZone: string;
  destinationZone: string;
  serviceType: BisaExpressServiceType | string;
  minWeight: number;
  maxWeight: number;
  baseCost: number;
  perUnitCost: number;
  weightUnit?: UnitStatus;
  etdDays: number;
}) => {
  return prisma.bisaExpressRate.create({
    data: {
      originZone: data.originZone,
      destinationZone: data.destinationZone,
      serviceType: data.serviceType,
      minWeight: data.minWeight,
      maxWeight: data.maxWeight,
      baseCost: data.baseCost,
      perUnitCost: data.perUnitCost,
      weightUnit: data.weightUnit ?? UnitStatus.KG,
      etdDays: data.etdDays,
    },
  });
};

export const adminUpdateRate = async (id: string, data: Record<string, unknown>) => {
  return prisma.bisaExpressRate.update({ where: { id }, data });
};

export const adminDeleteRate = async (id: string) => {
  return prisma.bisaExpressRate.delete({ where: { id } });
};

export const adminListCoverage = () =>
  prisma.bisaExpressCoverage.findMany({ orderBy: { zone: 'asc' } });

export const adminCreateCoverage = async (data: {
  provinceId: string;
  regencyId?: string | null;
  zone: string;
  isPickup?: boolean;
  isDelivery?: boolean;
}) => {
  return prisma.bisaExpressCoverage.create({
    data: {
      provinceId: data.provinceId,
      regencyId: data.regencyId ?? null,
      zone: data.zone,
      isPickup: data.isPickup ?? true,
      isDelivery: data.isDelivery ?? true,
    },
  });
};

export const adminUpdateCoverage = async (id: string, data: Record<string, unknown>) => {
  return prisma.bisaExpressCoverage.update({ where: { id }, data });
};

export const adminListShipments = async (query: {
  page: number;
  limit: number;
  status?: BisaExpressStatus;
  search?: string;
}) => {
  const where: Prisma.BisaExpressShipmentWhereInput = {
    ...(query.status ? { status: query.status } : {}),
    ...(query.search
      ? {
          OR: [
            { awbNumber: { contains: query.search } },
            { order: { orderNumber: { contains: query.search } } },
          ],
        }
      : {}),
  };
  const [items, total] = await Promise.all([
    prisma.bisaExpressShipment.findMany({
      where,
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      orderBy: { createdAt: 'desc' },
      include: {
        order: { select: { orderNumber: true, buyerId: true, sellerId: true } },
        pickupDriver: { select: { employeeCode: true } },
        deliveryDriver: { select: { employeeCode: true } },
      },
    }),
    prisma.bisaExpressShipment.count({ where }),
  ]);
  return { items, total, page: query.page, limit: query.limit };
};

export const adminAssignDrivers = async (
  shipmentId: string,
  data: { pickupDriverId?: string; deliveryDriverId?: string },
) => {
  const shipment = await prisma.bisaExpressShipment.findUnique({ where: { id: shipmentId } });
  if (!shipment) throw new AppError('Shipment tidak ditemukan', 404);

  return prisma.$transaction(async (tx) => {
    const nextStatus =
      data.pickupDriverId && shipment.status === BisaExpressStatus.AWAITING_PICKUP
        ? BisaExpressStatus.PICKUP_ASSIGNED
        : shipment.status;

    const updated = await tx.bisaExpressShipment.update({
      where: { id: shipmentId },
      data: {
        pickupDriverId: data.pickupDriverId ?? shipment.pickupDriverId,
        deliveryDriverId: data.deliveryDriverId ?? shipment.deliveryDriverId,
        status: nextStatus,
      },
    });

    if (nextStatus !== shipment.status) {
      await appendStatusLog(tx, {
        shipmentId,
        status: nextStatus,
        description: 'Driver di-assign oleh admin',
        actorType: 'ADMIN',
      });
      await syncShipmentTracking(shipment.orderId, updated, null, null, tx);
    }
    return updated;
  });
};

export const adminOverrideStatus = async (
  shipmentId: string,
  data: { status: BisaExpressStatus; description?: string },
) => {
  const shipment = await prisma.bisaExpressShipment.findUnique({ where: { id: shipmentId } });
  if (!shipment) throw new AppError('Shipment tidak ditemukan', 404);

  return prisma.$transaction(async (tx) => {
    const updated = await tx.bisaExpressShipment.update({
      where: { id: shipmentId },
      data: { status: data.status },
    });
    await appendStatusLog(tx, {
      shipmentId,
      status: data.status,
      description: data.description || `Override status → ${data.status}`,
      actorType: 'ADMIN',
    });
    await syncShipmentTracking(shipment.orderId, updated, null, null, tx);
    await maybeMarkOrderShipped(shipment.orderId, data.status, tx);
    return updated;
  });
};

export const adminDashboard = async () => {
  const [byStatus, activeDrivers, todayCount] = await Promise.all([
    prisma.bisaExpressShipment.groupBy({
      by: ['status'],
      _count: { _all: true },
    }),
    prisma.bisaExpressDriver.count({
      where: { isActive: true, status: { not: DriverStatus.OFF_DUTY } },
    }),
    prisma.bisaExpressShipment.count({
      where: {
        createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
      },
    }),
  ]);
  return { byStatus, activeDrivers, todayCount };
};

export const adminLiveMap = async () => {
  return prisma.bisaExpressDriver.findMany({
    where: {
      isActive: true,
      status: { notIn: [DriverStatus.OFF_DUTY, DriverStatus.SUSPENDED] },
      currentLat: { not: null },
      currentLng: { not: null },
    },
    select: {
      id: true,
      employeeCode: true,
      status: true,
      vehicleType: true,
      vehiclePlate: true,
      currentLat: true,
      currentLng: true,
      lastLocationAt: true,
      user: { select: { fullName: true, phone: true } },
    },
  });
};

export const adminReports = async () => {
  const delivered = await prisma.bisaExpressShipment.count({
    where: { status: BisaExpressStatus.DELIVERED },
  });
  const failed = await prisma.bisaExpressShipment.count({
    where: { status: BisaExpressStatus.FAILED_DELIVERY },
  });
  const total = await prisma.bisaExpressShipment.count();
  return {
    total,
    delivered,
    failed,
    successRate: total > 0 ? delivered / total : 0,
  };
};
