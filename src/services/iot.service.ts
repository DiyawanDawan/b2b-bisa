import { randomBytes } from 'crypto';
import prisma from '#config/prisma';
import AppError from '#utils/appError';
import { sealProviderActions } from '#utils/encryption.util';
import { createNotification } from '#services/notification.service';
import {
  NotificationType,
  NotificationPriority,
  IoTAlertType,
  TransactionType,
  PaymentStatus,
  TransactionStatus,
  PlatformFeeType,
  PaymentMethod,
  UserRole,
  Prisma,
  DeviceStatus,
} from '#prisma';
import { IOT_ONLINE_TIMEOUT_MS, IOT_COOLDOWN_MS } from '#utils/env.util';
import { createPaymentRequest } from '#config/xendit';

const CURRENT_STATUS_WINDOW_MS = 30 * 60 * 1000;
const DEVICE_SECRET_BYTES = 32;

const generateDeviceSecret = () => randomBytes(DEVICE_SECRET_BYTES).toString('hex');

const buildDeviceQrPayload = (serialNumber: string, deviceSecret: string) => ({
  serialNumber,
  deviceSecret,
});

type DeviceWithTelemetry = {
  id: string;
  deviceId: string;
  name: string | null;
  status: DeviceStatus;
  thresholdMin: Prisma.Decimal | null;
  thresholdMax: Prisma.Decimal | null;
  readings: Array<{
    temperature: Prisma.Decimal;
    humidity: Prisma.Decimal | null;
    co2Level: Prisma.Decimal | null;
    recordedAt: Date;
  }>;
  alerts: Array<{ id: string }>;
};

/** Map DB device + latest reading into mobile-friendly payload */
export const formatDeviceForClient = (device: DeviceWithTelemetry) => {
  const last = device.readings[0];
  const isMonitoringEnabled = device.status === DeviceStatus.ACTIVE;
  const lastSeen = last?.recordedAt;
  const isOnline =
    isMonitoringEnabled && !!lastSeen && Date.now() - lastSeen.getTime() < IOT_ONLINE_TIMEOUT_MS;
  const hasActiveAlert = isMonitoringEnabled && device.alerts.length > 0;

  let liveStatus: 'DISABLED' | 'MAINTENANCE' | 'ALERT' | 'ONLINE' | 'OFFLINE';
  if (device.status === DeviceStatus.INACTIVE) {
    liveStatus = 'DISABLED';
  } else if (device.status === DeviceStatus.MAINTENANCE) {
    liveStatus = 'MAINTENANCE';
  } else if (hasActiveAlert) {
    liveStatus = 'ALERT';
  } else if (isOnline) {
    liveStatus = 'ONLINE';
  } else {
    liveStatus = 'OFFLINE';
  }

  return {
    id: device.id,
    deviceId: device.deviceId,
    name: device.name || device.deviceId,
    status: liveStatus,
    monitoringStatus: device.status,
    isMonitoringEnabled,
    lastTemp: last ? Number(last.temperature) : null,
    lastHum: last?.humidity != null ? Number(last.humidity) : null,
    lastCo2: last?.co2Level != null ? Number(last.co2Level) : null,
    lastReadingAt: lastSeen ?? null,
    thresholdMin: device.thresholdMin != null ? Number(device.thresholdMin) : null,
    thresholdMax: device.thresholdMax != null ? Number(device.thresholdMax) : null,
  };
};

/**
 * Admin: provision a new IoT device before shipment.
 */
export const createAdminIotDevice = async (serialNumber: string, name?: string) => {
  const normalizedSerialNumber = serialNumber.trim();
  const existing = await prisma.iotDevice.findUnique({
    where: { deviceId: normalizedSerialNumber },
  });
  if (existing) throw new AppError('Serial number sudah terdaftar.', 409);

  const deviceSecret = generateDeviceSecret();
  const device = await prisma.iotDevice.create({
    data: {
      deviceId: normalizedSerialNumber,
      deviceSecret,
      name: name?.trim() || null,
      userId: null,
      ownedAt: null,
    },
    select: {
      id: true,
      deviceId: true,
      name: true,
      deviceSecret: true,
      createdAt: true,
    },
  });

  const qrPayload = buildDeviceQrPayload(device.deviceId, device.deviceSecret);

  return {
    id: device.id,
    serialNumber: device.deviceId,
    name: device.name,
    deviceSecret: device.deviceSecret,
    qrPayload,
    qrData: JSON.stringify(qrPayload),
    createdAt: device.createdAt,
  };
};

/**
 * Supplier: claim a provisioned device by scanning QR payload.
 */
export const claimDevice = async (userId: string, deviceSecret: string, name?: string) => {
  const device = await prisma.iotDevice.findUnique({
    where: { deviceSecret },
    select: {
      id: true,
      userId: true,
      deviceId: true,
      name: true,
      status: true,
      thresholdMin: true,
      thresholdMax: true,
      readings: { orderBy: { recordedAt: 'desc' }, take: 1 },
      alerts: { where: { isRead: false }, take: 1, select: { id: true } },
    },
  });

  if (!device)
    throw new AppError('QR perangkat tidak valid atau deviceSecret tidak ditemukan.', 404);
  if (device.userId) {
    throw new AppError('Perangkat ini sudah di-claim oleh pengguna lain.', 409);
  }

  const claimedDevice = await prisma.iotDevice.update({
    where: { id: device.id },
    data: {
      userId,
      ownedAt: new Date(),
      ...(name?.trim() ? { name: name.trim() } : {}),
    },
    select: {
      id: true,
      deviceId: true,
      name: true,
      status: true,
      thresholdMin: true,
      thresholdMax: true,
      readings: { orderBy: { recordedAt: 'desc' }, take: 1 },
      alerts: { where: { isRead: false }, take: 1, select: { id: true } },
    },
  });

  return formatDeviceForClient(claimedDevice);
};

/**
 * Log reading from IoT Device using permanent X-Device-Token.
 */
export const logReading = async (
  deviceSecret: string,
  data: { temp: number; hum?: number; co2?: number },
) => {
  const device = await prisma.iotDevice.findUnique({
    where: { deviceSecret },
    select: {
      id: true,
      userId: true,
      name: true,
      deviceId: true,
      status: true,
      thresholdMax: true,
      thresholdMin: true,
    },
  });
  if (!device) throw new AppError('X-Device-Token tidak valid.', 401);
  if (!device.userId) {
    throw new AppError('Perangkat belum di-claim oleh petani. Telemetri ditolak.', 409);
  }
  if (device.status !== DeviceStatus.ACTIVE) {
    throw new AppError(
      'Monitoring perangkat dinonaktifkan. Aktifkan kembali untuk menerima data sensor.',
      403,
    );
  }

  const reading = await prisma.iotReading.create({
    data: {
      deviceId: device.id,
      temperature: data.temp,
      humidity: data.hum,
      co2Level: data.co2,
    },
  });

  // 1. Alert logic: Check Cooldown
  const lastAlert = await prisma.iotAlert.findFirst({
    where: { deviceId: device.id },
    orderBy: { createdAt: 'desc' },
  });

  const shouldAlert = !lastAlert || Date.now() - lastAlert.createdAt.getTime() > IOT_COOLDOWN_MS;

  if (shouldAlert) {
    const tMax = device.thresholdMax ? Number(device.thresholdMax) : 600;
    const tMin = device.thresholdMin ? Number(device.thresholdMin) : 200;

    if (data.temp > tMax) {
      const alert = await prisma.iotAlert.create({
        data: {
          deviceId: device.id,
          alertType: IoTAlertType.OVERHEATING,
          message: `BAHAYA: Suhu tungku terdeteksi sangat tinggi (${data.temp}°C)! Melewati batas aman ${tMax}°C.`,
          temperature: data.temp,
        },
      });

      await createNotification({
        userId: device.userId,
        title: 'ALERT: Overheating Tungku!',
        body: `Suhu tungku ${device.name || device.deviceId} mencapai ${data.temp}°C. Segera cek lokasi!`,
        type: NotificationType.IOT_ALERT,
        priority: NotificationPriority.HIGH,
        refId: alert.id,
      });
    } else if (data.temp < tMin) {
      const alert = await prisma.iotAlert.create({
        data: {
          deviceId: device.id,
          alertType: IoTAlertType.TEMP_TOO_LOW,
          message: `PERINGATAN: Suhu tungku menurun drastis (${data.temp}°C). Di bawah batas operasional ${tMin}°C.`,
          temperature: data.temp,
        },
      });

      await createNotification({
        userId: device.userId,
        title: 'INFO: Suhu Tungku Menurun',
        body: `Suhu tungku ${device.name || device.deviceId} di bawah ${tMin}°C (${data.temp}°C). Pastikan api tetap menyala.`,
        type: NotificationType.IOT_ALERT,
        priority: NotificationPriority.MEDIUM,
        refId: alert.id,
      });
    }
  }

  return reading;
};

/**
 * Get device history with pagination
 */
export const getDeviceHistory = async (
  deviceId: string,
  userId: string,
  userRole: UserRole,
  page = 1,
  limit = 100,
) => {
  const skip = (page - 1) * limit;

  const device = await prisma.iotDevice.findUnique({
    where: { id: deviceId },
    select: {
      id: true,
      userId: true,
      deviceId: true,
      name: true,
      status: true,
      thresholdMin: true,
      thresholdMax: true,
      createdAt: true,
      updatedAt: true,
      readings: {
        select: {
          id: true,
          temperature: true,
          humidity: true,
          co2Level: true,
          recordedAt: true,
        },
        orderBy: { recordedAt: 'desc' },
        take: limit,
        skip: skip,
      },
      alerts: {
        select: {
          id: true,
          alertType: true,
          message: true,
          temperature: true,
          isRead: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
      },
    },
  });

  if (!device) throw new AppError('Perangkat tidak ditemukan.', 404);
  if (userRole !== UserRole.ADMIN && device.userId !== userId) {
    throw new AppError('Perangkat bukan milik Anda.', 403);
  }
  return device;
};

/**
 * List all devices for a user with pagination
 */
export const listDevices = async (
  userId: string,
  params: {
    page?: number;
    limit?: number;
    search?: string;
    status?: DeviceStatus;
  } = {},
) => {
  const { page = 1, limit = 20, search, status } = params;
  const skip = (page - 1) * limit;

  const where: Prisma.IotDeviceWhereInput = {
    userId,
    ...(status && { status }),
    ...(search && {
      OR: [{ name: { contains: search } }, { deviceId: { contains: search } }],
    }),
  };

  const [devices, total] = await Promise.all([
    prisma.iotDevice.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: skip,
      select: {
        id: true,
        deviceId: true,
        name: true,
        status: true,
        thresholdMin: true,
        thresholdMax: true,
        readings: { orderBy: { recordedAt: 'desc' }, take: 1 },
        alerts: { where: { isRead: false }, take: 1, select: { id: true } },
      },
    }),
    prisma.iotDevice.count({ where }),
  ]);

  return {
    devices: devices.map(formatDeviceForClient),
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
};

/**
 * Update device details (including thresholds)
 */
export const updateDevice = async (
  deviceId: string,
  userId: string,
  data: {
    name?: string;
    thresholdMin?: number;
    thresholdMax?: number;
    status?: DeviceStatus;
  },
) => {
  const device = await prisma.iotDevice.findFirst({
    where: { id: deviceId, userId },
  });
  if (!device) throw new AppError('Perangkat tidak ditemukan atau bukan milik Anda.', 404);

  const updated = await prisma.iotDevice.update({
    where: { id: deviceId },
    data,
    select: {
      id: true,
      deviceId: true,
      name: true,
      status: true,
      thresholdMin: true,
      thresholdMax: true,
      readings: { orderBy: { recordedAt: 'desc' }, take: 1 },
      alerts: { where: { isRead: false }, take: 1, select: { id: true } },
    },
  });

  return formatDeviceForClient(updated);
};

/**
 * Get status summary for all user's devices
 */
export const getDeviceStatusSummary = async (userId: string, page = 1, limit = 10) => {
  const skip = (page - 1) * limit;

  // 1. Get Aggregate Counts (All Devices)
  const [totalDevices, allDevices] = await Promise.all([
    prisma.iotDevice.count({ where: { userId } }),
    prisma.iotDevice.findMany({
      where: { userId },
      select: {
        status: true,
        readings: { orderBy: { recordedAt: 'desc' }, take: 1 },
        alerts: { where: { isRead: false }, take: 1 },
      },
    }),
  ]);

  const onlineCount = allDevices.filter((d) => {
    if (d.status !== DeviceStatus.ACTIVE) return false;
    const lastSeen = d.readings[0]?.recordedAt;
    return lastSeen ? Date.now() - lastSeen.getTime() < IOT_ONLINE_TIMEOUT_MS : false;
  }).length;

  const alertingCount = allDevices.filter(
    (d) => d.status === DeviceStatus.ACTIVE && d.alerts.length > 0,
  ).length;

  // 2. Get Paginated Device List
  const devices = await prisma.iotDevice.findMany({
    where: { userId },
    select: {
      id: true,
      deviceId: true,
      name: true,
      status: true,
      thresholdMin: true,
      thresholdMax: true,
      readings: { orderBy: { recordedAt: 'desc' }, take: 1 },
      alerts: { where: { isRead: false }, take: 1, select: { id: true } },
    },
    skip,
    take: limit,
    orderBy: { createdAt: 'desc' },
  });

  const summary = devices.map((d) => {
    const formatted = formatDeviceForClient(d);
    return {
      id: formatted.id,
      deviceId: formatted.deviceId,
      name: formatted.name,
      status: formatted.monitoringStatus,
      liveStatus: formatted.status,
      isMonitoringEnabled: formatted.isMonitoringEnabled,
      isOnline: formatted.status === 'ONLINE',
      hasActiveAlert: formatted.status === 'ALERT',
      lastSeen: formatted.lastReadingAt,
    };
  });

  return {
    totalDevices,
    onlineCount,
    alertingCount,
    devices: summary,
    pagination: {
      total: totalDevices,
      page,
      limit,
      totalPages: Math.ceil(totalDevices / limit),
    },
  };
};

/**
 * Mark alert as read
 */
export const markAlertAsRead = async (alertId: string, userId: string) => {
  const alert = await prisma.iotAlert.findFirst({
    where: { id: alertId, device: { userId } },
  });
  if (!alert) throw new AppError('Peringatan tidak ditemukan.', 404);

  return prisma.iotAlert.update({
    where: { id: alertId },
    data: { isRead: true },
  });
};

/**
 * Delete a device
 */
export const deleteDevice = async (deviceId: string, userId: string) => {
  const device = await prisma.iotDevice.findFirst({
    where: { id: deviceId, userId },
  });
  if (!device) throw new AppError('Perangkat tidak ditemukan atau bukan milik Anda.', 404);

  return prisma.iotDevice.delete({ where: { id: deviceId } });
};

/**
 * Initiate IoT PRO Subscription via Xendit
 */
export const initiateSubscription = async (
  userId: string,
  paymentMethod: { type: PaymentMethod; channel: string },
) => {
  // 1. Get Subscription Fee
  const feeSetting = await prisma.platformFeeSetting.findUnique({
    where: { name: PlatformFeeType.SUBSCRIPTION },
  });

  if (!feeSetting || !feeSetting.isActive) {
    throw new AppError(
      'Konfigurasi biaya langganan IoT PRO tidak ditemukan atau tidak aktif.',
      500,
    );
  }

  const amount = Number(feeSetting.amount);
  const externalId = `SUB-${userId.substring(0, 8)}-${Date.now()}`;

  // 2. Create Pending Transaction
  const transaction = await prisma.transaction.create({
    data: {
      userId,
      externalId,
      amount,
      type: TransactionType.SUBSCRIPTION,
      status: TransactionStatus.PENDING,
      paymentStatus: PaymentStatus.PENDING,
      paymentMethod: paymentMethod.type,
    },
  });

  // 3. Create Xendit Payment Request (In-App)
  try {
    const xenditResponse = await createPaymentRequest({
      reference_id: externalId,
      amount,
      currency: 'IDR',
      channel_code: paymentMethod.channel,
      method: paymentMethod.type,
      description: 'Langganan BISA IoT PRO - 30 Hari',
      metadata: { userId, transactionId: transaction.id },
    });

    // Update transaction with provider action (VA number / QR string)
    await prisma.transaction.update({
      where: { id: transaction.id },
      data: { providerActions: sealProviderActions(xenditResponse) },
    });

    return {
      transactionId: transaction.id,
      externalId,
      amount,
      paymentData: xenditResponse,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    // Fail the transaction if Xendit fails
    await prisma.transaction.update({
      where: { id: transaction.id },
      data: { status: TransactionStatus.FAILED, paymentStatus: PaymentStatus.FAILED },
    });
    throw new AppError(`Gagal membuat permintaan pembayaran Xendit: ${message}`, 500);
  }
};

type IotDashboardRange = '1h' | '24h' | '7d' | '30d';

const IOT_RANGE_MS: Record<IotDashboardRange, number> = {
  '1h': 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
};

const defaultLimitForRange = (range: IotDashboardRange): number => {
  switch (range) {
    case '1h':
      return 60;
    case '24h':
      return 200;
    case '7d':
      return 350;
    case '30d':
      return 500;
    default:
      return 200;
  }
};

export const assertDeviceAccess = async (deviceId: string, userId: string, userRole: UserRole) => {
  const device = await prisma.iotDevice.findUnique({ where: { id: deviceId } });
  if (!device) throw new AppError('Perangkat tidak ditemukan.', 404);
  if (userRole !== UserRole.ADMIN && device.userId !== userId) {
    throw new AppError('Perangkat bukan milik Anda.', 403);
  }
  return device;
};

const buildSeriesPoint = (recordedAt: Date, value: number) => ({
  t: recordedAt.toISOString(),
  v: value,
});

/**
 * Get formatted data for IoT Dashboard (time-range + fl_chart friendly `series`).
 */
export const getDeviceDashboardData = async (
  deviceId: string,
  userId: string,
  userRole: UserRole,
  options: { range?: string; limit?: number; metrics?: string } = {},
) => {
  const device = await assertDeviceAccess(deviceId, userId, userRole);

  const range = (options.range ?? '24h') as IotDashboardRange;
  const rangeMs = IOT_RANGE_MS[range] ?? IOT_RANGE_MS['24h'];
  const since = new Date(Date.now() - rangeMs);
  const take = Math.min(options.limit ?? defaultLimitForRange(range), 500);

  const metricSet = new Set(
    (options.metrics ?? 'temperature,humidity,co2')
      .split(',')
      .map((m) => m.trim().toLowerCase())
      .filter(Boolean),
  );

  const readings = await prisma.iotReading.findMany({
    where: { deviceId, recordedAt: { gte: since } },
    take,
    orderBy: { recordedAt: 'asc' },
  });

  const currentSince = new Date(Date.now() - CURRENT_STATUS_WINDOW_MS);
  const [currentReadings, latestGlobal] = await Promise.all([
    prisma.iotReading.findMany({
      where: { deviceId, recordedAt: { gte: currentSince } },
      orderBy: { recordedAt: 'desc' },
      take: 500,
    }),
    prisma.iotReading.findFirst({
      where: { deviceId },
      orderBy: { recordedAt: 'desc' },
    }),
  ]);

  const stats = await prisma.iotReading.aggregate({
    where: { deviceId, recordedAt: { gte: since } },
    _avg: { temperature: true, humidity: true, co2Level: true },
    _max: { temperature: true, humidity: true, co2Level: true },
    _min: { temperature: true, humidity: true, co2Level: true },
    _count: { id: true },
  });

  const currentStats = await prisma.iotReading.aggregate({
    where: { deviceId, recordedAt: { gte: currentSince } },
    _avg: { temperature: true, humidity: true, co2Level: true },
    _max: { temperature: true, humidity: true, co2Level: true },
    _min: { temperature: true, humidity: true, co2Level: true },
    _count: { id: true },
  });

  const buildSummaryStats = (
    agg: typeof stats,
    fallbackReading?: (typeof currentReadings)[0] | null,
  ) => {
    if (agg._count.id > 0) {
      return {
        maxTemp: Number(agg._max.temperature) || 0,
        minTemp: Number(agg._min.temperature) || 0,
        avgTemp: Number(agg._avg.temperature?.toFixed(2)) || 0,
        maxHum: Number(agg._max.humidity) || 0,
        minHum: Number(agg._min.humidity) || 0,
        avgHum: Number(agg._avg.humidity?.toFixed(2)) || 0,
        maxCo2: Number(agg._max.co2Level) || 0,
        minCo2: Number(agg._min.co2Level) || 0,
        avgCo2: Number(agg._avg.co2Level?.toFixed(2)) || 0,
        totalReadings: agg._count.id,
      };
    }
    if (fallbackReading) {
      const t = Number(fallbackReading.temperature) || 0;
      const h = fallbackReading.humidity != null ? Number(fallbackReading.humidity) : 0;
      const c = fallbackReading.co2Level != null ? Number(fallbackReading.co2Level) : 0;
      return {
        maxTemp: t,
        minTemp: t,
        avgTemp: t,
        maxHum: h,
        minHum: h,
        avgHum: h,
        maxCo2: c,
        minCo2: c,
        avgCo2: c,
        totalReadings: 1,
      };
    }
    return {
      maxTemp: 0,
      minTemp: 0,
      avgTemp: 0,
      maxHum: 0,
      minHum: 0,
      avgHum: 0,
      maxCo2: 0,
      minCo2: 0,
      avgCo2: 0,
      totalReadings: 0,
    };
  };

  const rangeSummaryStats = buildSummaryStats(stats);
  const summaryStats = buildSummaryStats(currentStats, latestGlobal);

  const series: Record<string, { t: string; v: number }[]> = {};

  if (metricSet.has('temperature')) {
    series.temperature = readings.map((r) =>
      buildSeriesPoint(r.recordedAt, Number(r.temperature) || 0),
    );
  }
  if (metricSet.has('humidity') && readings.some((r) => r.humidity != null)) {
    series.humidity = readings.map((r) => buildSeriesPoint(r.recordedAt, Number(r.humidity) || 0));
  }
  if (metricSet.has('co2') && readings.some((r) => r.co2Level != null)) {
    series.co2 = readings.map((r) => buildSeriesPoint(r.recordedAt, Number(r.co2Level) || 0));
  }

  const temperatureSeries = readings.map((r) => ({
    x: r.recordedAt,
    y: Number(r.temperature) || 0,
  }));
  const seriesData: { name: string; data: { x: Date; y: number }[] }[] = [
    { name: 'Suhu (°C)', data: temperatureSeries },
  ];
  if (series.humidity?.length) {
    seriesData.push({
      name: 'Kelembaban (%)',
      data: readings.map((r) => ({ x: r.recordedAt, y: Number(r.humidity) || 0 })),
    });
  }
  if (series.co2?.length) {
    seriesData.push({
      name: 'CO₂ (ppm)',
      data: readings.map((r) => ({ x: r.recordedAt, y: Number(r.co2Level) || 0 })),
    });
  }

  const recentAlerts = await prisma.iotAlert.findMany({
    where: { deviceId, isRead: false },
    take: 5,
    orderBy: { createdAt: 'desc' },
  });

  const currentLast = currentReadings[0] ?? latestGlobal;
  const formatted = formatDeviceForClient({
    ...device,
    readings: currentLast ? [currentLast] : [],
    alerts: recentAlerts.map((a) => ({ id: a.id })),
  });

  const expectedIntervalMs = 15 * 60 * 1000;
  const currentExpectedBuckets = Math.max(
    1,
    Math.floor(CURRENT_STATUS_WINDOW_MS / expectedIntervalMs),
  );
  const currentReadingsCount = currentReadings.length || (latestGlobal ? 1 : 0);
  const uptimePercent = Math.min(
    100,
    Math.round((currentReadingsCount / currentExpectedBuckets) * 1000) / 10,
  );

  return {
    deviceId: device.id,
    deviceName: device.name || device.deviceId,
    deviceStatus: device.status,
    isMonitoringEnabled: device.status === DeviceStatus.ACTIVE,
    liveStatus: formatted.status,
    thresholdMin: device.thresholdMin != null ? Number(device.thresholdMin) : null,
    thresholdMax: device.thresholdMax != null ? Number(device.thresholdMax) : null,
    range,
    statusWindow: '30m',
    lastReading: currentLast
      ? {
          temperature: Number(currentLast.temperature),
          humidity: currentLast.humidity != null ? Number(currentLast.humidity) : null,
          co2Level: currentLast.co2Level != null ? Number(currentLast.co2Level) : null,
          recordedAt: currentLast.recordedAt,
        }
      : null,
    history: readings.slice(-10).map((r) => ({
      temperature: Number(r.temperature),
      humidity: r.humidity != null ? Number(r.humidity) : null,
      co2Level: r.co2Level != null ? Number(r.co2Level) : null,
      recordedAt: r.recordedAt,
    })),
    series,
    seriesData,
    summaryStats,
    rangeSummaryStats,
    recentAlerts,
    uptimePercent,
    readingsInRange: readings.length,
    currentReadingsCount,
  };
};

/**
 * Fleet analytics — all devices for supplier with mini sparkline per device.
 */
export const getFleetAnalytics = async (
  userId: string,
  userRole: UserRole,
  range: string = '24h',
) => {
  const rangeKey =
    (range as IotDashboardRange) in IOT_RANGE_MS ? (range as IotDashboardRange) : '24h';
  const since = new Date(Date.now() - (IOT_RANGE_MS[rangeKey] ?? IOT_RANGE_MS['24h']));

  const where =
    userRole === UserRole.ADMIN
      ? {}
      : {
          userId,
        };

  const devices = await prisma.iotDevice.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: {
      readings: {
        where: { recordedAt: { gte: since } },
        orderBy: { recordedAt: 'desc' },
        take: 24,
      },
      alerts: {
        where: { isRead: false },
        take: 1,
      },
    },
  });

  let online = 0;
  let offline = 0;
  let alerting = 0;
  let disabled = 0;

  const deviceRows = devices.map((d) => {
    const formatted = formatDeviceForClient(d);
    const status = formatted.status;
    if (d.status !== DeviceStatus.ACTIVE) {
      disabled += 1;
    } else if (status === 'ALERT') {
      alerting += 1;
    } else if (status === 'ONLINE') {
      online += 1;
    } else {
      offline += 1;
    }

    const sparkReadings = [...d.readings].reverse();
    const last = d.readings[0];

    return {
      id: d.id,
      name: d.name || d.deviceId,
      liveStatus: status,
      lastTemp: last ? Number(last.temperature) : null,
      sparkline: sparkReadings.map((r) =>
        buildSeriesPoint(r.recordedAt, Number(r.temperature) || 0),
      ),
    };
  });

  return {
    range: rangeKey,
    totals: {
      devices: devices.length,
      online,
      offline,
      alerting,
      disabled,
    },
    devices: deviceRows,
  };
};

/**
 * Paginated alerts for a device.
 */
export const getDeviceAlerts = async (
  deviceId: string,
  userId: string,
  userRole: UserRole,
  options: { page?: number; limit?: number; isRead?: boolean } = {},
) => {
  await assertDeviceAccess(deviceId, userId, userRole);

  const page = Math.max(1, options.page ?? 1);
  const limit = Math.min(50, Math.max(1, options.limit ?? 20));
  const skip = (page - 1) * limit;

  const where: { deviceId: string; isRead?: boolean } = { deviceId };
  if (options.isRead !== undefined) {
    where.isRead = options.isRead;
  }

  const [alerts, total] = await Promise.all([
    prisma.iotAlert.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.iotAlert.count({ where }),
  ]);

  return {
    alerts,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
  };
};

/**
 * Latest reading + live status (polling ringan / SSE tick).
 */
export const getDeviceLatestReading = async (
  deviceId: string,
  userId: string,
  userRole: UserRole,
) => {
  const device = await assertDeviceAccess(deviceId, userId, userRole);

  const last = await prisma.iotReading.findFirst({
    where: { deviceId },
    orderBy: { recordedAt: 'desc' },
  });

  const formatted = formatDeviceForClient({
    ...device,
    readings: last ? [last] : [],
    alerts: [],
  });

  return {
    deviceId: device.id,
    liveStatus: formatted.status,
    isMonitoringEnabled: device.status === DeviceStatus.ACTIVE,
    lastReading: last
      ? {
          temperature: Number(last.temperature),
          humidity: last.humidity != null ? Number(last.humidity) : null,
          co2Level: last.co2Level != null ? Number(last.co2Level) : null,
          recordedAt: last.recordedAt,
        }
      : null,
    recordedAt: last?.recordedAt ?? null,
  };
};

/**
 * Export readings as CSV for a time range.
 */
export const exportDeviceReadingsCsv = async (
  deviceId: string,
  userId: string,
  userRole: UserRole,
  range = '24h',
) => {
  await assertDeviceAccess(deviceId, userId, userRole);

  const rangeKey =
    (range as IotDashboardRange) in IOT_RANGE_MS ? (range as IotDashboardRange) : '24h';
  const since = new Date(Date.now() - (IOT_RANGE_MS[rangeKey] ?? IOT_RANGE_MS['24h']));

  const readings = await prisma.iotReading.findMany({
    where: { deviceId, recordedAt: { gte: since } },
    orderBy: { recordedAt: 'asc' },
    take: 500,
  });

  const lines = ['recordedAt,temperature,humidity,co2Level'];
  for (const r of readings) {
    lines.push(
      [
        r.recordedAt.toISOString(),
        Number(r.temperature),
        r.humidity != null ? Number(r.humidity) : '',
        r.co2Level != null ? Number(r.co2Level) : '',
      ].join(','),
    );
  }

  return {
    filename: `iot-${deviceId.slice(0, 8)}-${rangeKey}.csv`,
    content: lines.join('\n'),
    count: readings.length,
  };
};

/**
 * Admin: list all IoT devices (read-only monitoring).
 */
export const listAdminIotDevices = async (
  options: {
    page?: number;
    limit?: number;
    search?: string;
  } = {},
) => {
  const page = Math.max(1, options.page ?? 1);
  const limit = Math.min(50, Math.max(1, options.limit ?? 20));
  const skip = (page - 1) * limit;
  const q = options.search?.trim();

  const where = q
    ? {
        OR: [
          { name: { contains: q } },
          { deviceId: { contains: q } },
        ],
      }
    : {};

  const [total, devices] = await Promise.all([
    prisma.iotDevice.count({ where }),
    prisma.iotDevice.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        deviceId: true,
        deviceSecret: true,
        name: true,
        status: true,
        userId: true,
        ownedAt: true,
        thresholdMin: true,
        thresholdMax: true,
        user: { select: { id: true, fullName: true, email: true } },
        readings: { 
          select: {
            temperature: true,
            humidity: true,
            co2Level: true,
            recordedAt: true,
          },
          orderBy: { recordedAt: 'desc' }, 
          take: 1 
        },
        alerts: { 
          select: { id: true },
          where: { isRead: false }, 
          take: 1 
        },
      },
    }),
  ]);

  return {
    devices: devices.map((d) => {
      const formatted = formatDeviceForClient(d);
      const last = d.readings[0];
      return {
        id: d.id,
        deviceId: d.deviceId,
        name: d.name || d.deviceId,
        liveStatus: formatted.status,
        isMonitoringEnabled: d.status === DeviceStatus.ACTIVE,
        ownerName: d.user?.fullName ?? null,
        ownerEmail: d.user?.email ?? null,
        isClaimed: !!d.userId,
        ownedAt: d.ownedAt,
        lastTemp: last ? Number(last.temperature) : null,
        lastSeen: last?.recordedAt ?? null,
        hasUnreadAlert: d.alerts.length > 0,
        thresholdMin: d.thresholdMin != null ? Number(d.thresholdMin) : null,
        thresholdMax: d.thresholdMax != null ? Number(d.thresholdMax) : null,
        deviceSecret: d.deviceSecret,
      };
    }),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
  };
};

/**
 * Admin: update device (name only, thresholds managed by owner).
 */
export const adminUpdateDevice = async (
  deviceId: string,
  data: {
    name?: string;
  },
) => {
  const device = await prisma.iotDevice.findUnique({ where: { id: deviceId } });
  if (!device) throw new AppError('Perangkat tidak ditemukan.', 404);

  const updated = await prisma.iotDevice.update({
    where: { id: deviceId },
    data: { name: data.name },
    select: {
      id: true,
      deviceId: true,
      deviceSecret: true,
      name: true,
      status: true,
      thresholdMin: true,
      thresholdMax: true,
      userId: true,
      ownedAt: true,
    },
  });

  return {
    id: updated.id,
    deviceId: updated.deviceId,
    name: updated.name,
    deviceSecret: updated.deviceSecret,
    thresholdMin: updated.thresholdMin != null ? Number(updated.thresholdMin) : null,
    thresholdMax: updated.thresholdMax != null ? Number(updated.thresholdMax) : null,
  };
};

/**
 * Admin: delete device permanently.
 */
export const adminDeleteDevice = async (deviceId: string) => {
  const device = await prisma.iotDevice.findUnique({ where: { id: deviceId } });
  if (!device) throw new AppError('Perangkat tidak ditemukan.', 404);

  return prisma.iotDevice.delete({ where: { id: deviceId } });
};
