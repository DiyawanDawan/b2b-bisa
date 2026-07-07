import { Response } from 'express';
import catchAsync from '#utils/catchAsync';
import { successResponse, paginatedObjectResponse, paginatedResponse } from '#utils/response.util';
import * as iotService from '#services/iot.service';
import * as iotRealtimeService from '#services/iotRealtime.service';
import { AuthRequest, DeviceStatus } from '#types/index';
import AppError from '#utils/appError';

interface PaginationQuery {
  page?: string;
  limit?: string;
}

export const createAdminIotDevice = catchAsync(async (req: AuthRequest, res: Response) => {
  const { serialNumber, name } = req.body;
  const result = await iotService.createAdminIotDevice(serialNumber, name);
  successResponse(res, result, 'Perangkat IoT berhasil dibuat dan QR siap dicetak');
});

export const claimDevice = catchAsync(async (req: AuthRequest, res: Response) => {
  const { deviceSecret, name } = req.body;
  const result = await iotService.claimDevice(req.user!.id, deviceSecret, name);
  successResponse(res, result, 'Perangkat IoT berhasil di-claim');
});

/**
 * Log reading (called by hardware/gateway)
 */
export const logReading = catchAsync(async (req: AuthRequest, res: Response) => {
  const deviceToken = req.header('X-Device-Token')?.trim();
  if (!deviceToken) {
    throw new AppError('Header X-Device-Token wajib dikirim.', 401);
  }

  const { temp, hum, co2 } = req.body;
  const result = await iotService.logReading(deviceToken, {
    temp,
    hum,
    co2,
  });
  successResponse(res, result, 'Data sensor berhasil dicatat');
});

/**
 * Get reading history for a specific device (Paginated)
 */
export const getDeviceHistory = catchAsync(async (req: AuthRequest, res: Response) => {
  const { deviceId } = req.params;
  const { page, limit } = req.query as PaginationQuery;
  const result = await iotService.getDeviceHistory(
    deviceId,
    req.user!.id,
    req.user!.role,
    Number(page),
    Number(limit),
  );
  successResponse(res, result, 'Riwayat data sensor');
});

/**
 * List all devices owned by the user (Paginated + Filtered)
 */
export const listDevices = catchAsync(async (req: AuthRequest, res: Response) => {
  const { page, limit, search, status } = req.query;

  const result = await iotService.listDevices(req.user!.id, {
    page: Math.max(1, Number(page) || 1),
    limit: Math.max(1, Number(limit) || 20),
    search: search as string,
    status: status as DeviceStatus,
  });

  return paginatedResponse(
    res,
    result.devices,
    result.pagination.total,
    result.pagination.page,
    result.pagination.limit,
    'Daftar perangkat IoT Anda',
  );
});

/**
 * Update a device registration (including thresholds)
 */
export const updateDevice = catchAsync(async (req: AuthRequest, res: Response) => {
  const { deviceId } = req.params;
  const { name, thresholdMin, thresholdMax, status } = req.body;
  const result = await iotService.updateDevice(deviceId, req.user!.id, {
    name,
    thresholdMin,
    thresholdMax,
    status: status as DeviceStatus | undefined,
  });
  const message =
    status === 'INACTIVE'
      ? 'Monitoring perangkat dinonaktifkan'
      : status === 'ACTIVE'
        ? 'Monitoring perangkat diaktifkan'
        : 'Informasi perangkat dan ambang batas berhasil diperbarui';
  successResponse(res, result, message);
});

/**
 * Get status summary for all devices (Online/Offline/Alerts)
 */
export const getDeviceStatusSummary = catchAsync(async (req: AuthRequest, res: Response) => {
  const { page, limit } = req.query as PaginationQuery;
  const result = await iotService.getDeviceStatusSummary(
    req.user!.id,
    Number(page) || 1,
    Number(limit) || 10,
  );

  return paginatedObjectResponse(
    res,
    {
      totalDevices: result.totalDevices,
      onlineCount: result.onlineCount,
      alertingCount: result.alertingCount,
      devices: result.devices,
    },
    result.pagination,
    'Ringkasan status perangkat IoT',
  );
});

/**
 * Acknowledge an alert
 */
export const markAlertAsRead = catchAsync(async (req: AuthRequest, res: Response) => {
  const { alertId } = req.params;
  const result = await iotService.markAlertAsRead(alertId, req.user!.id);
  successResponse(res, result, 'Peringatan berhasil ditandai sebagai dibaca');
});

/**
 * Delete a device registration
 */
export const deleteDevice = catchAsync(async (req: AuthRequest, res: Response) => {
  const { deviceId } = req.params;
  const result = await iotService.deleteDevice(deviceId, req.user!.id);
  successResponse(res, result, 'Perangkat IoT berhasil dihapus');
});

/**
 * Initiate IoT PRO Subscription (In-App Xendit)
 */
export const subscribe = catchAsync(async (req: AuthRequest, res: Response) => {
  const { channel_code, method } = req.body;
  const result = await iotService.initiateSubscription(req.user!.id, {
    type: method,
    channel: channel_code,
  });
  successResponse(res, result, 'Instruksi pembayaran langganan PRO berhasil dibuat');
});

/**
 * Get device dashboard data formatted for ApexCharts
 */
export const getDeviceDashboard = catchAsync(async (req: AuthRequest, res: Response) => {
  const { deviceId } = req.params;
  const { range, limit, metrics } = req.query as {
    range?: string;
    limit?: string;
    metrics?: string;
  };
  const result = await iotService.getDeviceDashboardData(deviceId, req.user!.id, req.user!.role, {
    range,
    limit: limit ? Number(limit) : undefined,
    metrics,
  });
  successResponse(res, result, 'Data dashboard IoT berhasil dimuat');
});

export const getFleetAnalytics = catchAsync(async (req: AuthRequest, res: Response) => {
  const { range } = req.query as { range?: string };
  const result = await iotService.getFleetAnalytics(req.user!.id, req.user!.role, range);
  successResponse(res, result, 'Analitik fleet IoT berhasil dimuat');
});

export const getDeviceAlerts = catchAsync(async (req: AuthRequest, res: Response) => {
  const { deviceId } = req.params;
  const { page, limit, isRead } = req.query as {
    page?: string;
    limit?: string;
    isRead?: string;
  };
  const result = await iotService.getDeviceAlerts(deviceId, req.user!.id, req.user!.role, {
    page: page ? Number(page) : 1,
    limit: limit ? Number(limit) : 20,
    isRead: isRead === 'true' ? true : isRead === 'false' ? false : undefined,
  });
  successResponse(res, result, 'Daftar peringatan IoT berhasil dimuat');
});

export const getDeviceLatest = catchAsync(async (req: AuthRequest, res: Response) => {
  const { deviceId } = req.params;
  const result = await iotService.getDeviceLatestReading(deviceId, req.user!.id, req.user!.role);
  successResponse(res, result, 'Data sensor terbaru berhasil dimuat');
});

export const exportDeviceReadings = catchAsync(async (req: AuthRequest, res: Response) => {
  const { deviceId } = req.params;
  const { range } = req.query as { range?: string };
  const result = await iotService.exportDeviceReadingsCsv(
    deviceId,
    req.user!.id,
    req.user!.role,
    range,
  );
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
  return res.status(200).send(result.content);
});

/**
 * SSE stream — kirim tick telemetry setiap 30 detik (max 20 menit).
 */
export const streamDeviceTelemetry = async (req: AuthRequest, res: Response) => {
  const { deviceId } = req.params;
  const userId = req.user!.id;
  const userRole = req.user!.role;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  let ticks = 0;
  const maxTicks = 40;

  const push = async () => {
    try {
      const payload = await iotService.getDeviceLatestReading(deviceId, userId, userRole);
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
      ticks += 1;
      if (ticks >= maxTicks) {
        clearInterval(timer);
        res.end();
      }
    } catch (err) {
      const message = err instanceof AppError ? err.message : 'Stream error';
      res.write(`event: error\ndata: ${JSON.stringify({ message })}\n\n`);
      clearInterval(timer);
      res.end();
    }
  };

  await push();
  const timer = setInterval(push, 30_000);
  req.on('close', () => {
    clearInterval(timer);
    res.end();
  });
};

export const getPyrolysisSession = catchAsync(async (req: AuthRequest, res: Response) => {
  const { deviceId } = req.params;
  const session = await iotRealtimeService.getPyrolysisSession(
    deviceId,
    req.user!.id,
    req.user!.role,
  );
  successResponse(res, { session }, session ? 'Sesi pirolisis aktif' : 'Tidak ada sesi aktif');
});

export const startPyrolysisSession = catchAsync(async (req: AuthRequest, res: Response) => {
  const { deviceId } = req.params;
  const { biomassaType, beratInput } = req.body;
  const result = await iotRealtimeService.startPyrolysisSession(
    deviceId,
    req.user!.id,
    req.user!.role,
    { biomassaType, beratInput },
  );
  successResponse(res, result, 'Sesi pirolisis dimulai — waktu pembakaran dihitung otomatis');
});

export const stopPyrolysisSession = catchAsync(async (req: AuthRequest, res: Response) => {
  const { deviceId } = req.params;
  const result = await iotRealtimeService.stopPyrolysisSession(
    deviceId,
    req.user!.id,
    req.user!.role,
  );
  successResponse(res, result, 'Sesi pirolisis dihentikan');
});

export const analyzeDeviceRealtime = catchAsync(async (req: AuthRequest, res: Response) => {
  const { deviceId } = req.params;
  const body = req.body ?? {};
  const result = await iotRealtimeService.analyzeDeviceRealtime(
    deviceId,
    req.user!.id,
    req.user!.role,
    body,
  );
  successResponse(res, result, 'Analisis realtime berhasil');
});

export const listAdminIotDevices = catchAsync(async (req: AuthRequest, res: Response) => {
  const { page, limit, search } = req.query as PaginationQuery & { search?: string };
  const result = await iotService.listAdminIotDevices({
    page: Number(page) || 1,
    limit: Number(limit) || 20,
    search,
  });
  return paginatedResponse(
    res,
    result.devices,
    result.pagination.total,
    result.pagination.page,
    result.pagination.limit,
    'Daftar perangkat IoT (admin)',
  );
});
