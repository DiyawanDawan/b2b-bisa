import { Request, Response } from 'express';
import { AuthRequest, OrderStatus } from '#types/index';
import catchAsync from '#utils/catchAsync';
import { successResponse, createdResponse, paginatedResponse } from '#utils/response.util';
import * as orderService from '#services/order.service';
import { attachOrderMediaUrls } from '#utils/orderMedia.util';
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
 * [BUYER] Direct checkout dari cart — skip negotiation, langsung jadi order
 * berstatus PENDING yang siap dibayar.
 */
export const createDirectOrder = catchAsync(async (req: AuthRequest, res: Response) => {
  const result = await orderService.createDirectOrderFromCart(req.user!.id, req.body);

  createdResponse(
    res,
    result,
    result.totalOrders > 1
      ? `${result.totalOrders} pesanan berhasil dibuat (1 per supplier). Lanjutkan pembayaran.`
      : 'Pesanan berhasil dibuat. Lanjutkan pembayaran.',
  );
});

export const previewDirectOrder = catchAsync(async (req: AuthRequest, res: Response) => {
  const result = await orderService.previewDirectOrderFromCart(req.user!.id, req.body);
  successResponse(res, result, 'Preview checkout berhasil dihitung.');
});

export const previewDirectOrderFromCartItems = catchAsync(
  async (req: AuthRequest, res: Response) => {
    const result = await orderService.previewDirectOrderFromCurrentCart(req.user!.id, {
      shippingAddress:
        typeof req.query.shippingAddress === 'string' ? req.query.shippingAddress : undefined,
    });
    successResponse(res, result, 'Preview checkout (dari cart aktif) berhasil dihitung.');
  },
);

/**
 * [SUPPLIER] Revise pending invoice (address / notes before payment)
 */
export const updatePendingInvoice = catchAsync(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const order = await orderService.updatePendingInvoice(req.user!.id, id, req.body);

  successResponse(res, order, 'Tagihan berhasil diperbarui.');
});

/**
 * [BUYER] Initialize Payment (Dual-Mode: Invoice for Web / PaymentRequest for Mobile)
 * Tanpa channelCode → Invoice (Web Hosted Checkout)
 * Dengan channelCode → PaymentRequest V3 (Mobile Native: VA / QRIS / E-Wallet)
 */
export const initializePayment = catchAsync(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { channelCode, forceNew } = req.body;

  const result = await orderService.initializePayment(
    id,
    req.user!.id,
    channelCode,
    forceNew === true,
  );

  successResponse(res, result, 'Pembayaran berhasil diinisialisasi. Silakan selesaikan transaksi.');
});

/** [BUYER] Satu pembayaran gabungan untuk semua pesanan dari checkout cart (1–N supplier). */
export const initializeBatchPayment = catchAsync(async (req: AuthRequest, res: Response) => {
  const { orderIds, channelCode, forceNew } = req.body;

  const result = await orderService.initializeBatchPayment(
    req.user!.id,
    orderIds,
    channelCode,
    forceNew === true,
  );

  successResponse(
    res,
    result,
    'Pembayaran gabungan berhasil diinisialisasi. Selesaikan satu kali untuk semua pesanan.',
  );
});

export const simulateBatchPayment = catchAsync(async (req: AuthRequest, res: Response) => {
  const { orderIds } = req.body;
  const result = await orderService.simulateBatchPayment(req.user!.id, orderIds);
  successResponse(res, result, 'Simulasi pembayaran gabungan diproses.');
});

/**
 * [DEV / TEST] Simulasi pembayaran (mock langsung, atau Xendit /v3/.../simulate).
 */
export const simulateOrderPayment = catchAsync(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const result = await orderService.simulateOrderPayment(id, req.user!.id);
  successResponse(res, result, 'Simulasi pembayaran diproses.');
});

/**
 * Batalkan inisialisasi pembayaran yang masih pending.
 */
export const cancelOrderPayment = catchAsync(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const result = await orderService.cancelOrderPayment(id, req.user!.id);
  successResponse(res, result, 'Pembayaran dibatalkan.');
});

/**
 * [DEV] Simulasi lunas — alias `simulateOrderPayment` (backward compat).
 */
export const mockConfirmPayment = catchAsync(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const order = await orderService.simulateOrderPayment(id, req.user!.id);
  successResponse(res, order, 'Pembayaran mock dikonfirmasi. Pesanan siap diproses.');
});

/**
 * [BUYER] View Purchasing History (Bisa Difilter dengan ?status=SHIPPED)
 */
export const getMyPurchases = catchAsync(async (req: AuthRequest, res: Response) => {
  const { page = 1, limit = 20, status, search, productMode } = req.query;
  const purchases = await orderService.listOrdersByRole({
    userId: req.user!.id,
    role: 'BUYER',
    statusFilter: status as OrderStatus,
    search: search as string,
    productMode: productMode as string,
    page: Number(page),
    limit: Number(limit),
  });

  return paginatedResponse(
    res,
    purchases.data,
    purchases.meta.total,
    purchases.meta.page,
    purchases.meta.limit,
    'Riwayat Pembelian dan Kontrak Bisnis Anda.',
  );
});

/**
 * [SUPPLIER] View Sales History (Bisa Difilter dengan ?status=PENDING)
 */
export const getMySales = catchAsync(async (req: AuthRequest, res: Response) => {
  const { page = 1, limit = 20, status, search, productMode } = req.query;
  const sales = await orderService.listOrdersByRole({
    userId: req.user!.id,
    role: 'SELLER',
    statusFilter: status as string,
    search: search as string,
    productMode: productMode as string,
    page: Number(page),
    limit: Number(limit),
  });

  return paginatedResponse(
    res,
    sales.data,
    sales.meta.total,
    sales.meta.page,
    sales.meta.limit,
    'Daftar Kontrak Penjualan B2B Anda.',
  );
});

/**
 * [BOTH] Get Detail of the Order & Shipping Resi
 */
export const getOrderDetail = catchAsync(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const order = await orderService.getOrderDetail(id, req.user!.id);

  successResponse(
    res,
    attachOrderMediaUrls(order),
    'Detail Kontrak dan Pelacakan Pesanan Ekspedisi.',
  );
});

/**
 * [BUYER] Detail checkout multi-supplier (semua pesanan dalam satu batch).
 */
export const getCheckoutBatchDetail = catchAsync(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const batch = await orderService.getCheckoutBatchDetail(id, req.user!.id);

  successResponse(res, batch, 'Detail checkout multi-supplier.');
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
  const { reason, description, evidenceUrls } = req.body;

  const result = await orderService.raiseDispute(
    id,
    req.user!.id,
    reason,
    description,
    evidenceUrls,
  );

  successResponse(
    res,
    result,
    'Sengketa berhasil diajukan. Admin akan segera meninjau pesanan ini dan menahan dana di Escrow.',
  );
});

/**
 * [SUPPLIER] Respond to a Dispute
 */
export const respondToDispute = catchAsync(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { response, evidenceUrls } = req.body;

  const result = await orderService.respondToDispute(id, req.user!.id, response, evidenceUrls);

  successResponse(
    res,
    formatDisputeForApi(result),
    'Tanggapan sengketa berhasil dikirim. Admin akan meninjau bukti dari kedua pihak.',
  );
});

const formatDisputeForApi = (dispute: {
  id: string;
  reason: string;
  description: string | null;
  evidenceUrls: unknown;
  sellerResponse: string | null;
  sellerEvidenceUrls: unknown;
  sellerRespondedAt: Date | null;
  status: string;
  resolution: string | null;
  resolutionNote: string | null;
  resolvedAt: Date | null;
  createdAt: Date;
}) => ({
  id: dispute.id,
  reason: dispute.reason,
  description: dispute.description,
  evidenceUrls: Array.isArray(dispute.evidenceUrls) ? dispute.evidenceUrls : [],
  sellerResponse: dispute.sellerResponse,
  sellerEvidenceUrls: Array.isArray(dispute.sellerEvidenceUrls) ? dispute.sellerEvidenceUrls : [],
  sellerRespondedAt: dispute.sellerRespondedAt,
  status: dispute.status,
  resolution: dispute.resolution,
  resolutionNote: dispute.resolutionNote,
  resolvedAt: dispute.resolvedAt,
  createdAt: dispute.createdAt,
});

/**
 * [PUBLIC] Verify Order / Contract QR
 */
export const verifyOrder = catchAsync(async (req: Request, res: Response) => {
  const { orderNumber } = req.params as any;

  const result = await orderService.getPublicContractVerification(orderNumber);

  successResponse(res, result, 'Data Verifikasi Kontrak B2B BISA.');
});

/**
 * [PUBLIC] Track Shipment Status (Live Fleet Monitoring)
 */
export const trackOrder = catchAsync(async (req: Request, res: Response) => {
  const { orderNumber } = req.params as any;

  const result = await orderService.trackOrder(orderNumber);

  successResponse(res, result, 'Data Pelacakan Hub dan Armada Ekspedisi.');
});

/**
 * [SUPPLIER] Get Sales Analytics
 */
export const getSalesStats = catchAsync(async (req: AuthRequest, res: Response) => {
  const stats = await orderService.getSalesStats(req.user!.id);
  successResponse(res, stats, 'Statistik penjualan berhasil diambil.');
});
