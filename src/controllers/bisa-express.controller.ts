import { Response } from 'express';
import { AuthRequest } from '#types/index';
import catchAsync from '#utils/catchAsync';
import { successResponse } from '#utils/response.util';
import * as bisaExpressService from '#services/bisa-express.service';

export const checkCoverage = catchAsync(async (req: AuthRequest, res: Response) => {
  const data = await bisaExpressService.checkCoverage(req.query as never);
  return successResponse(res, data, 'Coverage BISA Express berhasil dicek');
});

export const calculate = catchAsync(async (req: AuthRequest, res: Response) => {
  const q = req.query as {
    weight: string | number;
    weightUnit?: string;
    serviceType?: string;
    itemValue?: string | number;
    sellerId: string;
    buyerId: string;
  };
  const weightUnit =
    String(q.weightUnit || 'KG').toUpperCase() === 'TON' ? ('TON' as const) : ('KG' as const);

  const data = await bisaExpressService.calculateRates({
    weight: Number(q.weight),
    weightUnit,
    serviceType: q.serviceType,
    itemValue: q.itemValue != null ? Number(q.itemValue) : undefined,
    sellerId: q.sellerId,
    buyerId: q.buyerId,
  });
  return successResponse(res, data, 'Ongkir BISA Express berhasil dihitung');
});

export const listServices = catchAsync(async (_req: AuthRequest, res: Response) => {
  return successResponse(res, await bisaExpressService.listServices(), 'Layanan BISA Express');
});

export const trackAwb = catchAsync(async (req: AuthRequest, res: Response) => {
  const data = await bisaExpressService.trackByAwb(req.params.awb);
  return successResponse(res, data, 'Tracking BISA Express');
});

export const getByOrder = catchAsync(async (req: AuthRequest, res: Response) => {
  const data = await bisaExpressService.getShipmentByOrderId(req.params.orderId, req.user!.id);
  return successResponse(res, data, 'Detail shipment');
});

export const getTimeline = catchAsync(async (req: AuthRequest, res: Response) => {
  const data = await bisaExpressService.getTimeline(req.params.id);
  return successResponse(res, data, 'Timeline shipment');
});

export const getLocation = catchAsync(async (req: AuthRequest, res: Response) => {
  const data = await bisaExpressService.getLiveLocation(req.params.id);
  return successResponse(res, data, 'Lokasi driver');
});

export const requestPickup = catchAsync(async (req: AuthRequest, res: Response) => {
  const data = await bisaExpressService.requestPickup(req.user!.id, req.body);
  return successResponse(res, data, 'Request pickup berhasil');
});

export const updateSellerNote = catchAsync(async (req: AuthRequest, res: Response) => {
  const data = await bisaExpressService.updateSellerNote(
    req.user!.id,
    req.params.id,
    req.body.sellerNote,
  );
  return successResponse(res, data, 'Catatan seller disimpan');
});

export const mySellerShipments = catchAsync(async (req: AuthRequest, res: Response) => {
  const data = await bisaExpressService.listSellerShipments(req.user!.id);
  return successResponse(res, data, 'Daftar shipment seller');
});

export const driverAssignments = catchAsync(async (req: AuthRequest, res: Response) => {
  const data = await bisaExpressService.listDriverAssignments(req.user!.id);
  return successResponse(res, data, 'Assignment driver');
});

export const driverAccept = catchAsync(async (req: AuthRequest, res: Response) => {
  const data = await bisaExpressService.acceptAssignment(req.user!.id, req.params.shipmentId);
  return successResponse(res, data, 'Assignment diterima');
});

export const driverPickup = catchAsync(async (req: AuthRequest, res: Response) => {
  const data = await bisaExpressService.confirmPickup(
    req.user!.id,
    req.params.shipmentId,
    req.body,
  );
  return successResponse(res, data, 'Pickup dikonfirmasi');
});

export const driverArriveHub = catchAsync(async (req: AuthRequest, res: Response) => {
  const data = await bisaExpressService.arriveHub(req.user!.id, req.params.shipmentId, req.body);
  return successResponse(res, data, 'Scan masuk hub');
});

export const driverDepartHub = catchAsync(async (req: AuthRequest, res: Response) => {
  const data = await bisaExpressService.departHub(req.user!.id, req.params.shipmentId, req.body);
  return successResponse(res, data, 'Scan keluar hub');
});

export const driverOutForDelivery = catchAsync(async (req: AuthRequest, res: Response) => {
  const data = await bisaExpressService.outForDelivery(req.user!.id, req.params.shipmentId);
  return successResponse(res, data, 'Out for delivery');
});

export const driverDeliver = catchAsync(async (req: AuthRequest, res: Response) => {
  const data = await bisaExpressService.confirmDeliver(
    req.user!.id,
    req.params.shipmentId,
    req.body,
  );
  return successResponse(res, data, 'Delivered + POD tersimpan');
});

export const driverFail = catchAsync(async (req: AuthRequest, res: Response) => {
  const data = await bisaExpressService.reportFailedDelivery(
    req.user!.id,
    req.params.shipmentId,
    req.body,
  );
  return successResponse(res, data, 'Gagal kirim dilaporkan');
});

export const driverLocation = catchAsync(async (req: AuthRequest, res: Response) => {
  const data = await bisaExpressService.updateDriverLocation(req.user!.id, req.body.points);
  return successResponse(res, data, 'Lokasi driver diupdate');
});

export const driverStatus = catchAsync(async (req: AuthRequest, res: Response) => {
  const data = await bisaExpressService.updateDriverDutyStatus(req.user!.id, req.body.status);
  return successResponse(res, data, 'Status driver diupdate');
});

export const driverStats = catchAsync(async (req: AuthRequest, res: Response) => {
  const data = await bisaExpressService.getDriverStats(req.user!.id);
  return successResponse(res, data, 'Statistik driver');
});

// Admin
export const adminListDrivers = catchAsync(async (_req: AuthRequest, res: Response) => {
  return successResponse(res, await bisaExpressService.adminListDrivers(), 'Drivers');
});
export const adminCreateDriver = catchAsync(async (req: AuthRequest, res: Response) => {
  return successResponse(
    res,
    await bisaExpressService.adminCreateDriver(req.body),
    'Driver dibuat',
    201,
  );
});
export const adminUpdateDriver = catchAsync(async (req: AuthRequest, res: Response) => {
  return successResponse(
    res,
    await bisaExpressService.adminUpdateDriver(req.params.id, req.body),
    'Driver diupdate',
  );
});
export const adminSuspendDriver = catchAsync(async (req: AuthRequest, res: Response) => {
  const suspend = req.body?.suspend !== false;
  return successResponse(
    res,
    await bisaExpressService.adminSuspendDriver(req.params.id, suspend),
    suspend ? 'Driver di-suspend' : 'Driver diaktifkan',
  );
});
export const adminListHubs = catchAsync(async (_req: AuthRequest, res: Response) => {
  return successResponse(res, await bisaExpressService.adminListHubs(), 'Hubs');
});
export const adminCreateHub = catchAsync(async (req: AuthRequest, res: Response) => {
  return successResponse(res, await bisaExpressService.adminCreateHub(req.body), 'Hub dibuat', 201);
});
export const adminUpdateHub = catchAsync(async (req: AuthRequest, res: Response) => {
  return successResponse(
    res,
    await bisaExpressService.adminUpdateHub(req.params.id, req.body),
    'Hub diupdate',
  );
});
export const adminDeleteHub = catchAsync(async (req: AuthRequest, res: Response) => {
  return successResponse(
    res,
    await bisaExpressService.adminDeactivateHub(req.params.id),
    'Hub dinonaktifkan',
  );
});
export const adminListRates = catchAsync(async (_req: AuthRequest, res: Response) => {
  return successResponse(res, await bisaExpressService.adminListRates(), 'Rates');
});
export const adminListServiceRules = catchAsync(async (_req: AuthRequest, res: Response) => {
  return successResponse(
    res,
    await bisaExpressService.adminListServiceRules(),
    'Service rules BISA Express',
  );
});
export const adminUpsertServiceRule = catchAsync(async (req: AuthRequest, res: Response) => {
  return successResponse(
    res,
    await bisaExpressService.adminUpsertServiceRule(req.body),
    'Service rule disimpan',
    201,
  );
});
export const adminUpdateServiceRule = catchAsync(async (req: AuthRequest, res: Response) => {
  return successResponse(
    res,
    await bisaExpressService.adminUpdateServiceRule(req.params.id, req.body),
    'Service rule diupdate',
  );
});
export const adminDeleteServiceRule = catchAsync(async (req: AuthRequest, res: Response) => {
  return successResponse(
    res,
    await bisaExpressService.adminDeleteServiceRule(req.params.id),
    'Service rule dinonaktifkan',
  );
});
export const adminCreateRate = catchAsync(async (req: AuthRequest, res: Response) => {
  return successResponse(
    res,
    await bisaExpressService.adminCreateRate(req.body),
    'Rate dibuat',
    201,
  );
});
export const adminUpdateRate = catchAsync(async (req: AuthRequest, res: Response) => {
  return successResponse(
    res,
    await bisaExpressService.adminUpdateRate(req.params.id, req.body),
    'Rate diupdate',
  );
});
export const adminDeleteRate = catchAsync(async (req: AuthRequest, res: Response) => {
  return successResponse(
    res,
    await bisaExpressService.adminDeleteRate(req.params.id),
    'Rate dihapus',
  );
});
export const adminListCoverage = catchAsync(async (_req: AuthRequest, res: Response) => {
  return successResponse(res, await bisaExpressService.adminListCoverage(), 'Coverage');
});
export const adminCreateCoverage = catchAsync(async (req: AuthRequest, res: Response) => {
  return successResponse(
    res,
    await bisaExpressService.adminCreateCoverage(req.body),
    'Coverage dibuat',
    201,
  );
});
export const adminUpdateCoverage = catchAsync(async (req: AuthRequest, res: Response) => {
  return successResponse(
    res,
    await bisaExpressService.adminUpdateCoverage(req.params.id, req.body),
    'Coverage diupdate',
  );
});
export const adminListShipments = catchAsync(async (req: AuthRequest, res: Response) => {
  return successResponse(
    res,
    await bisaExpressService.adminListShipments(req.query as never),
    'Shipments',
  );
});
export const adminAssign = catchAsync(async (req: AuthRequest, res: Response) => {
  return successResponse(
    res,
    await bisaExpressService.adminAssignDrivers(req.params.id, req.body),
    'Driver di-assign',
  );
});
export const adminOverrideStatus = catchAsync(async (req: AuthRequest, res: Response) => {
  return successResponse(
    res,
    await bisaExpressService.adminOverrideStatus(req.params.id, req.body),
    'Status di-override',
  );
});
export const adminDashboard = catchAsync(async (_req: AuthRequest, res: Response) => {
  return successResponse(res, await bisaExpressService.adminDashboard(), 'Dashboard BISA Express');
});
export const adminLiveMap = catchAsync(async (_req: AuthRequest, res: Response) => {
  return successResponse(res, await bisaExpressService.adminLiveMap(), 'Live map drivers');
});
export const adminReports = catchAsync(async (_req: AuthRequest, res: Response) => {
  return successResponse(res, await bisaExpressService.adminReports(), 'Laporan operasional');
});
