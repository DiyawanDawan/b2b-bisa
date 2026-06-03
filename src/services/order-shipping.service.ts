import prisma from '#config/prisma';
import type { LogisticsSnapshotMeta } from '#types/order-shipping';
import { Prisma } from '#prisma';
import AppError from '#utils/appError';

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
      weightGrams: meta.weightGrams,
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
