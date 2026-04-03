import prisma from '#config/prisma';
import AppError from '#utils/appError';
import { createNotification } from './notification.service';
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
} from '#prisma';
import { IOT_ONLINE_TIMEOUT_MS, IOT_COOLDOWN_MS } from '#utils/env.util';
import { createPaymentRequest } from '#config/xendit';

/**
 * Register a new IoT device for a Supplier (Farmer)
 */
export const registerDevice = async (userId: string, deviceId: string, name?: string) => {
  const existing = await prisma.iotDevice.findUnique({ where: { deviceId } });
  if (existing) throw new AppError('Device ID sudah terdaftar.', 409);

  return prisma.iotDevice.create({
    data: {
      userId,
      deviceId,
      name,
    },
  });
};

/**
 * Log reading from IoT Device (Temperature/Humidity)
 */
export const logReading = async (
  deviceIdStr: string,
  userId: string,
  userRole: UserRole,
  data: { temp: number; hum?: number; co2?: number },
) => {
  const device = await prisma.iotDevice.findUnique({
    where: { deviceId: deviceIdStr },
    include: { user: true },
  });
  if (!device) throw new AppError('Device tidak ditemukan.', 404);
  if (userRole !== UserRole.ADMIN && device.userId !== userId) {
    throw new AppError('Perangkat bukan milik Anda.', 403);
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
    include: {
      readings: {
        orderBy: { recordedAt: 'desc' },
        take: limit,
        skip: skip,
      },
      alerts: {
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
export const listDevices = async (userId: string, page = 1, limit = 20) => {
  const skip = (page - 1) * limit;

  const [devices, total] = await Promise.all([
    prisma.iotDevice.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: skip,
    }),
    prisma.iotDevice.count({ where: { userId } }),
  ]);

  return {
    devices,
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
  data: { name?: string; thresholdMin?: number; thresholdMax?: number },
) => {
  const device = await prisma.iotDevice.findFirst({
    where: { id: deviceId, userId },
  });
  if (!device) throw new AppError('Perangkat tidak ditemukan atau bukan milik Anda.', 404);

  return prisma.iotDevice.update({
    where: { id: deviceId },
    data,
  });
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
        readings: { orderBy: { recordedAt: 'desc' }, take: 1 },
        alerts: { where: { isRead: false }, take: 1 },
      },
    }),
  ]);

  const onlineCount = allDevices.filter((d) => {
    const lastSeen = d.readings[0]?.recordedAt;
    return lastSeen ? Date.now() - lastSeen.getTime() < IOT_ONLINE_TIMEOUT_MS : false;
  }).length;

  const alertingCount = allDevices.filter((d) => d.alerts.length > 0).length;

  // 2. Get Paginated Device List
  const devices = await prisma.iotDevice.findMany({
    where: { userId },
    include: {
      readings: { orderBy: { recordedAt: 'desc' }, take: 1 },
      alerts: { where: { isRead: false }, take: 1 },
    },
    skip,
    take: limit,
    orderBy: { createdAt: 'desc' },
  });

  const summary = devices.map((d) => {
    const lastSeen = d.readings[0]?.recordedAt;
    const isOnline = lastSeen ? Date.now() - lastSeen.getTime() < IOT_ONLINE_TIMEOUT_MS : false;
    const hasActiveAlert = d.alerts.length > 0;

    return {
      id: d.id,
      deviceId: d.deviceId,
      name: d.name || d.deviceId,
      status: d.status,
      isOnline,
      hasActiveAlert,
      lastSeen,
    };
  });

  return {
    totalDevices,
    onlineCount,
    alertingCount,
    devices: summary,
    pagination: {
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
      data: { providerActions: xenditResponse as unknown as Prisma.InputJsonValue },
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

/**
 * Get formatted data for ApexCharts IoT Dashboard (Optimized)
 */
export const getDeviceDashboardData = async (
  deviceId: string,
  userId: string,
  userRole: UserRole,
) => {
  const device = await prisma.iotDevice.findUnique({
    where: { id: deviceId },
  });

  if (!device) throw new AppError('Perangkat tidak ditemukan.', 404);
  if (userRole !== UserRole.ADMIN && device.userId !== userId) {
    throw new AppError('Perangkat bukan milik Anda.', 403);
  }

  // 1. Ambil 100 Data Sensor Terbaru
  const readings = await prisma.iotReading.findMany({
    where: { deviceId },
    take: 100,
    orderBy: { recordedAt: 'desc' },
  });

  // Balikkan urutan agar grafik tampil dari lama ke baru (kiri ke kanan)
  readings.reverse();

  // 2. Kalkulasi Summary Stats Menggunakan Database Aggregate (Bukan JS Memory)
  const stats = await prisma.iotReading.aggregate({
    where: { deviceId },
    _avg: { temperature: true },
    _max: { temperature: true },
    _min: { temperature: true },
    _count: { id: true },
  });

  // 3. Format menjadi Time-Series Data ApexCharts
  const temperatureSeries = readings.map((r) => ({
    x: r.recordedAt,
    y: Number(r.temperature) || 0,
  }));

  const seriesData = [{ name: 'Suhu (°C)', data: temperatureSeries }];

  // Optional: Add humidity/co2 if present in newest readings
  const hasHumidity = readings.some((r) => r.humidity !== null);
  if (hasHumidity) {
    seriesData.push({
      name: 'Kelembaban (%)',
      data: readings.map((r) => ({ x: r.recordedAt, y: Number(r.humidity) || 0 })),
    });
  }

  const summaryStats = {
    maxTemp: Number(stats._max.temperature) || 0,
    minTemp: Number(stats._min.temperature) || 0,
    avgTemp: Number(stats._avg.temperature?.toFixed(2)) || 0,
    totalReadings: stats._count.id,
  };

  // 4. Ambil 5 Peringatan (Alerts) Unread Terbaru
  const recentAlerts = await prisma.iotAlert.findMany({
    where: { deviceId, isRead: false },
    take: 5,
    orderBy: { createdAt: 'desc' },
  });

  return {
    deviceName: device.name || device.deviceId,
    seriesData,
    summaryStats,
    recentAlerts,
  };
};
