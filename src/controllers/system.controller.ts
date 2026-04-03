import { Response, Request } from 'express';
import * as Enums from '#prisma';
import { successResponse } from '#utils/response.util';
import catchAsync from '#utils/catchAsync';

/**
 * Get all system constants (Enums) for frontend dropdowns
 * GET /api/v1/system/constants
 */
export const getConstants = catchAsync(async (_req: Request, res: Response) => {
  const constants = {
    UserRole: Enums.UserRole,
    VerificationStatus: Enums.VerificationStatus,
    BiomassaType: Enums.BiomassaType,
    BiocharGrade: Enums.BiocharGrade,
    OrderStatus: Enums.OrderStatus,
    TransactionStatus: Enums.TransactionStatus,
    PaymentStatus: Enums.PaymentStatus,
    PaymentMethod: Enums.PaymentMethod,
    PayoutStatus: Enums.PayoutStatus,
    NotificationType: Enums.NotificationType,
    NotificationPriority: Enums.NotificationPriority,
    DevicePlatform: Enums.DevicePlatform,
    DeviceStatus: Enums.DeviceStatus,
    PostStatus: Enums.PostStatus,
    UserTier: Enums.UserTier,
    ShipmentType: Enums.ShipmentType,
    VesselType: Enums.VesselType,
    PackagingType: Enums.PackagingType,
    ProductStatus: Enums.ProductStatus,
    UnitStatus: Enums.UnitStatus,
  };

  return successResponse(res, constants, 'Konstanta sistem berhasil diambil');
});
