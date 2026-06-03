import { Response } from 'express';
import { AuthRequest, UserRole } from '#types/index';
import catchAsync from '#utils/catchAsync';
import { successResponse, createdResponse, paginatedResponse } from '#utils/response.util';
import * as negotiationService from '#services/negotiation.service';
import * as orderService from '#services/order.service';
import {
  attachNegotiationMediaUrls,
  attachNegotiationMessageMedia,
} from '#utils/negotiationMedia.util';

/**
 * [BUYER] Create Negotiation Offer
 */
export const createOffer = catchAsync(async (req: AuthRequest, res: Response) => {
  const offer = await negotiationService.createOffer(req.user!.id, req.body);
  createdResponse(
    res,
    attachNegotiationMediaUrls(offer),
    'Penawaran berhasil diajukan kepada Penyuplai.',
  );
});

/**
 * [BUYER / SUPPLIER] Ruang chat aktif untuk produk (jika ada).
 */
export const getRoomByProduct = catchAsync(async (req: AuthRequest, res: Response) => {
  const { productId } = req.params;
  const rawPurpose = String(req.query.purpose ?? 'negotiation');
  const purpose = rawPurpose === 'inquiry' ? 'inquiry' : 'negotiation';
  const room = await negotiationService.findChatRoomByProduct(
    req.user!.id,
    productId,
    purpose,
  );
  return successResponse(
    res,
    room,
    room ? 'Ruang chat ditemukan.' : 'Belum ada percakapan untuk produk ini.',
  );
});

/**
 * [BUYER] Get My Sent Offers
 */
const parseListRoomType = (raw: unknown) => {
  const v = String(raw ?? '').toLowerCase();
  if (v === 'inquiry') return 'inquiry' as const;
  if (v === 'negotiation') return 'negotiation' as const;
  return undefined;
};

export const getMyOffers = catchAsync(async (req: AuthRequest, res: Response) => {
  const { page, limit, status, keyword, productMode, roomType } = req.query;
  const offers = await negotiationService.listNegotiations({
    userId: req.user!.id,
    type: UserRole.BUYER,
    statusFilter: status as string,
    keyword: keyword as string,
    productMode: productMode as string,
    roomType: parseListRoomType(roomType),
    page: Math.max(1, Number(page) || 1),
    limit: Math.max(1, Number(limit) || 20),
  });

  return paginatedResponse(
    res,
    offers.data.map(attachNegotiationMediaUrls),
    offers.meta.total,
    offers.meta.page,
    offers.meta.limit,
    'Daftar penawaran Anda',
  );
});

/**
 * [SUPPLIER] Get Incoming Offers
 */
export const getIncomingOffers = catchAsync(async (req: AuthRequest, res: Response) => {
  const { page, limit, status, keyword, productMode, roomType } = req.query;
  const offers = await negotiationService.listNegotiations({
    userId: req.user!.id,
    type: UserRole.SUPPLIER,
    statusFilter: status as string,
    keyword: keyword as string,
    productMode: productMode as string,
    roomType: parseListRoomType(roomType),
    page: Math.max(1, Number(page) || 1),
    limit: Math.max(1, Number(limit) || 20),
  });

  return paginatedResponse(
    res,
    offers.data.map(attachNegotiationMediaUrls),
    offers.meta.total,
    offers.meta.page,
    offers.meta.limit,
    'Daftar penawaran masuk dari Pembeli',
  );
});

/**
 * [SUPPLIER] Update Offer Status (Accept/Reject)
 */
export const updateStatus = catchAsync(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { status, rejectionReason, ...updateData } = req.body;
  const updated = await negotiationService.updateOfferStatus(id, req.user!.id, status, {
    ...updateData,
    rejectionReason,
  });

  const msg =
    status === 'OFFER_ACCEPTED'
      ? 'Penawaran disetujui. Terbitkan tagihan dari halaman Buat Tagihan.'
      : 'Penawaran berhasil ditolak.';

  successResponse(res, attachNegotiationMediaUrls(updated), msg);
});

/**
 * [SUPPLIER] Counter Offer (revise quantity/price)
 */
export const counterOffer = catchAsync(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const updated = await negotiationService.counterOffer(id, req.user!.id, req.body);
  successResponse(res, attachNegotiationMediaUrls(updated), 'Counter offer berhasil dikirim ke pembeli.');
});

/**
 * [BUYER] Cancel Negotiation with reason
 */
export const cancelNegotiation = catchAsync(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { cancellationReason } = req.body as { cancellationReason: string };
  const updated = await negotiationService.cancelNegotiation(id, req.user!.id, cancellationReason);
  successResponse(res, attachNegotiationMediaUrls(updated), 'Negosiasi berhasil dibatalkan.');
});

/**
 * [BOTH] Send Chat Message inside Negotiation
 */
export const sendChat = catchAsync(async (req: AuthRequest, res: Response) => {
  const { id } = req.params; // negotiationId
  const { content, attachmentUrl } = req.body;

  const chat = await negotiationService.sendChatMessage(id, req.user!.id, content, attachmentUrl);
  createdResponse(res, attachNegotiationMessageMedia(chat), 'Pesan terkirim');
});

export const editChat = catchAsync(async (req: AuthRequest, res: Response) => {
  const { id, messageId } = req.params;
  const { content } = req.body as { content: string };
  const updated = await negotiationService.editChatMessage(id, messageId, req.user!.id, content);
  successResponse(res, attachNegotiationMessageMedia(updated), 'Pesan berhasil diperbarui.');
});

export const deleteChat = catchAsync(async (req: AuthRequest, res: Response) => {
  const { id, messageId } = req.params;
  const updated = await negotiationService.deleteChatMessage(id, messageId, req.user!.id);
  successResponse(res, attachNegotiationMessageMedia(updated), 'Pesan berhasil dihapus.');
});

export const clearChat = catchAsync(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const result = await negotiationService.clearChatMessages(id, req.user!.id);
  successResponse(res, result, 'Riwayat chat berhasil dibersihkan.');
});

/**
 * [BOTH] Get Chat Messages Support
 */
export const getChats = catchAsync(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 50;
  const skip = req.query.skip !== undefined ? parseInt(req.query.skip as string) : undefined;

  const chats = await negotiationService.listChatMessages(id, req.user!.id, {
    page: Math.max(1, page),
    limit: Math.max(1, limit),
    skip: skip !== undefined && !Number.isNaN(skip) ? skip : undefined,
  });

  return paginatedResponse(
    res,
    chats.data.map(attachNegotiationMessageMedia),
    chats.meta.total,
    chats.meta.page,
    chats.meta.limit,
    'Riwayat pesan negosiasi',
  );
});

/**
 * [SUPPLIER] Preview invoice breakdown before issuing contract
 */
export const getInvoicePreview = catchAsync(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const preview = await orderService.previewInvoiceFromNegotiation(id, req.user!.id);
  successResponse(res, preview, 'Preview tagihan berhasil dimuat.');
});

export const postInvoicePreview = catchAsync(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { shippingSelection, quantity, pricePerUnit } = req.body;
  const preview = await orderService.previewInvoiceFromNegotiation(id, req.user!.id, {
    shippingSelection,
    quantity,
    pricePerUnit,
  });
  successResponse(res, preview, 'Preview tagihan berhasil dimuat.');
});

/**
 * [BOTH] Get Detail of One Negotiation (Buyer or Seller)
 */
export const getNegotiationDetail = catchAsync(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const detail = await negotiationService.getNegotiationById(id, req.user!.id);
  successResponse(res, attachNegotiationMediaUrls(detail), 'Detail Negosiasi dan Riwayat Chat.');
});

/**
 * [BOTH] Mark Messages as Read
 */
export const markAsRead = catchAsync(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  await negotiationService.markMessagesAsRead(id, req.user!.id);
  successResponse(res, null, 'Pesan ditandai terbaca.');
});
/**
 * [BOTH] Set Typing Status
 */
export const setTypingStatus = catchAsync(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { isTyping } = req.body;
  const status = await negotiationService.setTypingStatus(id, req.user!.id, isTyping);
  successResponse(res, status, 'Typing status updated');
});
