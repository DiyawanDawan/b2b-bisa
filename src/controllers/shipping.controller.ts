import { Response } from 'express';
import { AuthRequest } from '#types/index';
import catchAsync from '#utils/catchAsync';
import { successResponse } from '#utils/response.util';
import * as rajaOngkirService from '#services/rajaongkir.service';
import * as bisaExpressService from '#services/bisa-express.service';
import {
  getSupplierShippingOrigin,
  syncTrackingToOrder,
  updateSupplierShippingOrigin,
} from '#services/order-shipping.service';
import { UnitStatus } from '#prisma';

/** GET /api/v1/shipping/destinations */
export const searchDestinations = catchAsync(async (req: AuthRequest, res: Response) => {
  const { search, limit, offset } = req.query as {
    search: string;
    limit?: string;
    offset?: string;
  };

  const data = await rajaOngkirService.searchDomesticDestinations({
    search,
    limit: limit ? Number(limit) : undefined,
    offset: offset ? Number(offset) : undefined,
  });

  return successResponse(res, data, 'Daftar tujuan pengiriman berhasil diambil');
});

/** POST /api/v1/shipping/calculate-domestic — merge opsi RajaOngkir + BISA Express */
export const calculateDomestic = catchAsync(async (req: AuthRequest, res: Response) => {
  const { originId, destinationId, weight, weightUnit, courier, price, sellerId, buyerId } =
    req.body;

  const unit: UnitStatus =
    String(weightUnit || 'KG').toUpperCase() === 'TON' ? UnitStatus.TON : UnitStatus.KG;
  const qty = Number(weight);

  const options = await rajaOngkirService.calculateDomesticCost({
    originId,
    destinationId,
    weight: qty,
    weightUnit: unit,
    courier,
    price,
  });

  try {
    const resolvedBuyerId = (buyerId as string | undefined) ?? req.user?.id;
    if (sellerId && resolvedBuyerId) {
      const bisaOptions = await bisaExpressService.calculateRates({
        weight: qty,
        weightUnit: unit,
        sellerId: sellerId as string,
        buyerId: resolvedBuyerId,
      });
      const merged = [...bisaOptions, ...options].sort((a, b) => a.cost - b.cost);
      return successResponse(res, merged, 'Perkiraan ongkir berhasil dihitung');
    }
    // Tanpa sellerId+buyerId: jangan tampilkan BISA Express (wajib Alamat Profil)
    return successResponse(res, options, 'Perkiraan ongkir berhasil dihitung');
  } catch {
    return successResponse(res, options, 'Perkiraan ongkir berhasil dihitung');
  }
});

/** POST /api/v1/shipping/track — opsional simpan ke order */
export const trackShipment = catchAsync(async (req: AuthRequest, res: Response) => {
  const { awb, courier, lastPhoneNumber, orderId } = req.body;

  const trackData = await rajaOngkirService.trackWaybill({
    awb,
    courier,
    lastPhoneNumber,
  });

  if (orderId && req.user?.id) {
    await syncTrackingToOrder(
      orderId,
      req.user.id,
      { awb, courier, lastPhoneNumber },
      trackData as Record<string, unknown>,
    );
  }

  return successResponse(res, trackData, 'Status resi berhasil diambil');
});

/** GET /api/v1/shipping/origin — asal pengiriman supplier (dari DB) */
export const getShippingOrigin = catchAsync(async (req: AuthRequest, res: Response) => {
  const data = await getSupplierShippingOrigin(req.user!.id);
  return successResponse(res, data, 'Asal pengiriman berhasil diambil');
});

/** PUT /api/v1/shipping/origin */
export const setShippingOrigin = catchAsync(async (req: AuthRequest, res: Response) => {
  const { originId, originLabel } = req.body;
  const data = await updateSupplierShippingOrigin(req.user!.id, { originId, originLabel });
  return successResponse(res, data, 'Asal pengiriman berhasil disimpan');
});

/** GET /api/v1/shipping/pickup/vehicles */
export const getPickupVehicles = catchAsync(async (_req: AuthRequest, res: Response) => {
  const data = await rajaOngkirService.getPickupVehicleOptions();
  return successResponse(res, data, 'Opsi kendaraan pickup berhasil diambil');
});

/** POST /api/v1/shipping/pickup/request */
export const requestPickup = catchAsync(async (req: AuthRequest, res: Response) => {
  const { pickupDate, pickupTime, pickupVehicle, orders } = req.body;
  const data = await rajaOngkirService.requestCourierPickup({
    pickupDate,
    pickupTime,
    pickupVehicle,
    orders,
  });
  return successResponse(res, data, 'Request pickup berhasil dikirim');
});

/** PUT /api/v1/shipping/pickup/vehicles */
export const setPickupVehicles = catchAsync(async (req: AuthRequest, res: Response) => {
  const { options } = req.body;
  const data = await rajaOngkirService.setPickupVehicleOptions(options);
  return successResponse(res, data, 'Konfigurasi kendaraan pickup berhasil disimpan');
});

/** GET /api/v1/shipping/couriers */
export const getActiveCouriers = catchAsync(async (_req: AuthRequest, res: Response) => {
  const data = await rajaOngkirService.getActiveCouriers();
  return successResponse(res, data, 'Daftar ekspedisi aktif berhasil diambil');
});

/** PUT /api/v1/shipping/couriers */
export const setActiveCouriers = catchAsync(async (req: AuthRequest, res: Response) => {
  const { couriers } = req.body;
  const data = await rajaOngkirService.setActiveCouriers(couriers);
  return successResponse(res, data, 'Daftar ekspedisi aktif berhasil disimpan');
});
