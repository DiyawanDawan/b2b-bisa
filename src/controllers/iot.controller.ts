import { Response } from 'express';
import catchAsync from '#utils/catchAsync';
import { successResponse } from '#utils/response.util';
import * as iotService from '#services/iot.service';
import { AuthRequest } from '#middlewares/authMiddleware';

interface PaginationQuery {
  page?: string;
  limit?: string;
}

/**
 * Register a new device for the certified farmer (Supplier)
 */
export const registerDevice = catchAsync(async (req: AuthRequest, res: Response) => {
  const { deviceId, name } = req.body;
  const result = await iotService.registerDevice(req.user!.id, deviceId, name);
  successResponse(res, result, 'Device IoT berhasil didaftarkan');
});

/**
 * Log reading (called by hardware/gateway)
 */
export const logReading = catchAsync(async (req: AuthRequest, res: Response) => {
  const { deviceId, temp, hum, co2 } = req.body;
  const result = await iotService.logReading(deviceId, req.user!.id, req.user!.role, {
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
 * List all devices owned by the user (Paginated)
 */
export const listDevices = catchAsync(async (req: AuthRequest, res: Response) => {
  const { page, limit } = req.query as PaginationQuery;
  const result = await iotService.listDevices(req.user!.id, Number(page), Number(limit));
  successResponse(res, result, 'Daftar perangkat IoT Anda');
});

/**
 * Update a device registration (including thresholds)
 */
export const updateDevice = catchAsync(async (req: AuthRequest, res: Response) => {
  const { deviceId } = req.params;
  const { name, thresholdMin, thresholdMax } = req.body;
  const result = await iotService.updateDevice(deviceId, req.user!.id, {
    name,
    thresholdMin,
    thresholdMax,
  });
  successResponse(res, result, 'Informasi perangkat dan ambang batas berhasil diperbarui');
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
  successResponse(res, result, 'Ringkasan status perangkat IoT');
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
  const result = await iotService.getDeviceDashboardData(deviceId, req.user!.id, req.user!.role);
  successResponse(res, result, 'Data dashboard IoT berhasil dimuat');
});
