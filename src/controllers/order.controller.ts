import { Response } from 'express';
import { AuthRequest } from '#types/index';
import catchAsync from '#utils/catchAsync';
import { successResponse, createdResponse } from '#utils/response.util';
import * as orderService from '#services/order.service';
import * as walletService from '#services/wallet.service';

/**
 * [SUPPLIER] Create Contract / Invoice from Negotiation
 */
export const createContract = catchAsync(async (req: AuthRequest, res: Response) => {
  const result = await orderService.createContract(req.user!.id, req.body);

  createdResponse(
    res,
    result,
    'Kontrak B2B Resmi telah diterbitkan. Buyer dapat melanjutkan pembayaran melalui endpoint /pay.',
  );
});

/**
 * [BUYER] Initialize Payment (Dual-Mode: Invoice for Web / PaymentRequest for Mobile)
 * Tanpa channelCode → Invoice (Web Hosted Checkout)
 * Dengan channelCode → PaymentRequest V3 (Mobile Native: VA / QRIS / E-Wallet)
 */
export const initializePayment = catchAsync(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { channelCode } = req.body;

  const result = await orderService.initializePayment(id, req.user!.id, channelCode);

  successResponse(res, result, 'Pembayaran berhasil diinisialisasi. Silakan selesaikan transaksi.');
});

/**
 * [BUYER] View Purchasing History (Bisa Difilter dengan ?status=SHIPPED)
 */
export const getMyPurchases = catchAsync(async (req: AuthRequest, res: Response) => {
  const status = req.query.status as string | undefined;
  const { page = 1, limit = 20 } = req.query;

  const purchases = await orderService.listOrdersByRole({
    userId: req.user!.id,
    role: 'BUYER',
    statusFilter: status,
    page: Number(page),
    limit: Number(limit),
  });

  successResponse(res, purchases, 'Riwayat Pembelian dan Kontrak Bisnis Anda.');
});

/**
 * [SUPPLIER] View Sales History (Bisa Difilter dengan ?status=PENDING)
 */
export const getMySales = catchAsync(async (req: AuthRequest, res: Response) => {
  const status = req.query.status as string | undefined;
  const { page = 1, limit = 20 } = req.query;

  const sales = await orderService.listOrdersByRole({
    userId: req.user!.id,
    role: 'SELLER',
    statusFilter: status,
    page: Number(page),
    limit: Number(limit),
  });

  successResponse(res, sales, 'Daftar Kontrak Penjualan B2B Anda.');
});

/**
 * [BOTH] Get Detail of the Order & Shipping Resi
 */
export const getOrderDetail = catchAsync(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const order = await orderService.getOrderDetail(id, req.user!.id);

  successResponse(res, order, 'Detail Kontrak dan Pelacakan Pesanan Ekspedisi.');
});

/**
 * [SUPPLIER] Update Logistics Tracking Location
 */
export const updateTracking = catchAsync(async (req: AuthRequest, res: Response) => {
  const { id } = req.params; // Order ID

  const updatedTracker = await orderService.updateShipmentTracking(id, req.user!.id, req.body);

  successResponse(
    res,
    updatedTracker,
    'Titik armada ekspedisi atau nama transporter (Truk/Kapal) berhasil diperbarui.',
  );
});

/**
 * [BUYER] Release Escrow Funds to Supplier
 */
export const releaseEscrow = catchAsync(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const result = await walletService.releaseEscrow(id, req.user!.id);
  successResponse(
    res,
    result,
    'Pesanan selesai! Dana Escrow Anda telah dilepaskan ke dompet Penyuplai secara otomatis.',
  );
});

/**
 * [BUYER] Raise a Dispute / Complaint
 */
export const raiseDispute = catchAsync(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { reason } = req.body;

  const result = await orderService.raiseDispute(id, req.user!.id, reason);

  successResponse(
    res,
    result,
    'Sengketa berhasil diajukan. Admin akan segera meninjau pesanan ini dan menahan dana di Escrow.',
  );
});

/**
 * [PUBLIC] Verify Order / Contract QR
 */
export const verifyOrder = catchAsync(async (req: AuthRequest, res: Response) => {
  const { orderNumber } = req.params;

  const result = await orderService.getPublicContractVerification(orderNumber);

  successResponse(res, result, 'Data Verifikasi Kontrak B2B BISA.');
});
