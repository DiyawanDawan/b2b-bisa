import prisma from '#config/prisma';
import type { LogisticsSnapshotMeta } from '#types/order-shipping';
import { Prisma } from '#prisma';
import AppError from '#utils/appError';
import * as rajaOngkirService from '#services/rajaongkir.service';

type Tx = Prisma.TransactionClient;

export const persistOrderShipping = async (
  orderId: string,
  meta: LogisticsSnapshotMeta,
  client: Tx | typeof prisma = prisma,
) => {
  await client.orderShipping.create({
    data: {
      orderId,
      originDestinationId: meta.originId,
      destinationDestinationId: meta.destinationId,
      originLabel: null,
      destinationLabel: meta.destinationLabel ?? null,
      weight: meta.weight,
      weightUnit: meta.weightUnit ?? 'KG',
      courierCode: meta.courierCode.toLowerCase(),
      courierName: meta.courierName ?? meta.courierCode,
      serviceCode: meta.serviceCode ?? meta.verifiedService ?? null,
      serviceName: meta.serviceName ?? meta.verifiedService ?? meta.courierCode,
      serviceDescription: meta.verifiedDescription ?? null,
      shippingCost: new Prisma.Decimal(meta.cost),
      etd: meta.etd ?? null,
    },
  });

  await client.shipmentTracking.update({
    where: { orderId },
    data: {
      courierCode: meta.courierCode.toLowerCase(),
      vesselName: `${meta.courierCode.toUpperCase()} · ${meta.verifiedService ?? meta.serviceName ?? 'Menunggu resi'}`,
    },
  });
};

export const syncTrackingToOrder = async (
  orderId: string,
  userId: string,
  params: { awb: string; courier: string; lastPhoneNumber?: string },
  trackData: Record<string, unknown>,
) => {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      buyerId: true,
      sellerId: true,
      shipment: { select: { orderId: true } },
      orderShipping: { select: { courierCode: true } },
    },
  });

  if (!order?.shipment) {
    throw new AppError('Data pengiriman pesanan tidak ditemukan.', 404);
  }
  if (order.buyerId !== userId && order.sellerId !== userId) {
    throw new AppError('Akses ditolak.', 403);
  }

  const summary = (trackData.summary ?? {}) as Record<string, string | undefined>;
  const deliveryStatus =
    (trackData.delivery_status as Record<string, string> | undefined)?.status ?? summary.status;

  return prisma.shipmentTracking.update({
    where: { orderId },
    data: {
      awbNumber: params.awb,
      courierCode: params.courier.toLowerCase(),
      recipientPhoneLast5: params.lastPhoneNumber ?? undefined,
      deliveryStatus: deliveryStatus ?? undefined,
      trackingSnapshot: trackData as Prisma.InputJsonValue,
      lastTrackedAt: new Date(),
    },
  });
};

export const updateSupplierShippingOrigin = async (
  userId: string,
  data: { originId: number; originLabel?: string },
) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });
  if (!user) throw new AppError('User tidak ditemukan.', 404);
  if (user.role !== 'SUPPLIER' && user.role !== 'ADMIN') {
    throw new AppError('Hanya supplier yang dapat mengatur asal pengiriman.', 403);
  }

  await prisma.userProfile.upsert({
    where: { userId },
    create: {
      userId,
      rajaongkirOriginId: data.originId,
      rajaongkirOriginLabel: data.originLabel ?? null,
    },
    update: {
      rajaongkirOriginId: data.originId,
      rajaongkirOriginLabel: data.originLabel ?? null,
    },
  });

  return prisma.userProfile.findUnique({
    where: { userId },
    select: {
      rajaongkirOriginId: true,
      rajaongkirOriginLabel: true,
    },
  });
};

export const getSupplierShippingOrigin = async (userId: string) => {
  const profile = await prisma.userProfile.findUnique({
    where: { userId },
    select: {
      rajaongkirOriginId: true,
      rajaongkirOriginLabel: true,
    },
  });
  return {
    originId: profile?.rajaongkirOriginId ?? null,
    originLabel: profile?.rajaongkirOriginLabel ?? null,
  };
};

/**
 * Isi rajaongkirOriginId otomatis dari alamat toko / Alamat Pengiriman utama
 * bila belum diatur manual di menu Asal Pengiriman.
 */
export const ensureSupplierShippingOriginFromAddresses = async (userId: string) => {
  const stored = await getSupplierShippingOrigin(userId);
  if (stored.originId != null && stored.originId > 0) {
    return stored;
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      role: true,
      province: true,
      regency: true,
      profile: {
        select: {
          address: {
            select: {
              fullAddress: true,
              province: { select: { name: true } },
              regency: { select: { name: true } },
            },
          },
        },
      },
      verification: {
        select: { businessAddress: true },
      },
      customerAddresses: {
        orderBy: [{ isPrimary: 'desc' }, { id: 'asc' }],
        take: 1,
        select: {
          address: {
            select: {
              fullAddress: true,
              province: { select: { name: true } },
              regency: { select: { name: true } },
            },
          },
        },
      },
    },
  });

  if (!user || (user.role !== 'SUPPLIER' && user.role !== 'ADMIN')) {
    return stored;
  }

  const profileAddr = user.profile?.address;
  const primaryAddr = user.customerAddresses[0]?.address;
  const queries = [
    profileAddr?.regency?.name?.trim() && profileAddr?.province?.name?.trim()
      ? `${profileAddr.regency.name.trim()}, ${profileAddr.province.name.trim()}`
      : null,
    primaryAddr?.regency?.name?.trim() && primaryAddr?.province?.name?.trim()
      ? `${primaryAddr.regency.name.trim()}, ${primaryAddr.province.name.trim()}`
      : null,
    profileAddr?.regency?.name?.trim(),
    primaryAddr?.regency?.name?.trim(),
    user.regency?.trim() && user.province?.trim()
      ? `${user.regency.trim()}, ${user.province.trim()}`
      : null,
    user.regency?.trim(),
    profileAddr?.fullAddress?.trim()?.slice(0, 80),
    primaryAddr?.fullAddress?.trim()?.slice(0, 80),
    user.verification?.businessAddress?.trim()?.slice(0, 80),
  ].filter((q): q is string => !!q && q.length >= 3);

  for (const search of queries) {
    try {
      const results = await rajaOngkirService.searchDomesticDestinations({
        search,
        limit: 8,
      });
      if (!results.length) continue;

      const first = results[0];
      const originId = Number(first.id);
      if (Number.isNaN(originId) || originId <= 0) continue;

      await updateSupplierShippingOrigin(userId, {
        originId,
        originLabel: first.label ?? search,
      });

      return {
        originId,
        originLabel: first.label ?? search,
      };
    } catch {
      // Coba query berikutnya jika API gagal / kuota.
    }
  }

  return stored;
};

export const saveCustomerAddressDestination = async (
  customerAddressId: string,
  userId: string,
  data: { destinationId: number; destinationLabel?: string },
) => {
  const row = await prisma.customerAddress.findFirst({
    where: { id: customerAddressId, userId },
  });
  if (!row) throw new AppError('Alamat tidak ditemukan.', 404);

  return prisma.customerAddress.update({
    where: { id: customerAddressId },
    data: {
      rajaongkirDestinationId: data.destinationId,
      rajaongkirDestinationLabel: data.destinationLabel ?? null,
    },
    select: {
      id: true,
      label: true,
      rajaongkirDestinationId: true,
      rajaongkirDestinationLabel: true,
    },
  });
};

/** Resolve & persist RajaOngkir destination ID from GIS alamat buyer (best-effort). */
export const syncCustomerAddressRajaOngkirDestination = async (
  customerAddressId: string,
  userId: string,
) => {
  const row = await prisma.customerAddress.findFirst({
    where: { id: customerAddressId, userId },
    select: {
      rajaongkirDestinationId: true,
      address: {
        select: {
          fullAddress: true,
          province: { select: { name: true } },
          regency: { select: { name: true } },
        },
      },
    },
  });

  if (!row?.address) return null;
  if (row.rajaongkirDestinationId != null) {
    return {
      id: customerAddressId,
      rajaongkirDestinationId: row.rajaongkirDestinationId,
      rajaongkirDestinationLabel: null,
    };
  }

  const { fullAddress, province, regency } = row.address;
  const queries = [
    regency?.name?.trim() && province?.name?.trim()
      ? `${regency.name.trim()}, ${province.name.trim()}`
      : null,
    regency?.name?.trim(),
    province?.name?.trim(),
    fullAddress?.trim().slice(0, 80),
  ].filter((q): q is string => !!q && q.length >= 3);

  for (const search of queries) {
    const results = await rajaOngkirService.searchDomesticDestinations({
      search,
      limit: 8,
    });
    if (!results.length) continue;

    const first = results[0];
    const destinationId = Number(first.id);
    if (Number.isNaN(destinationId) || destinationId <= 0) continue;

    return saveCustomerAddressDestination(customerAddressId, userId, {
      destinationId,
      destinationLabel: first.label ?? search,
    });
  }

  return null;
};
