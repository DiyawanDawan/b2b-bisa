import { Response } from 'express';
import { AuthRequest } from '#types/index';
import catchAsync from '#utils/catchAsync';
import { successResponse, createdResponse } from '#utils/response.util';
import * as negotiationService from '#services/negotiation.service';

/**
 * [BUYER] Create Negotiation Offer
 */
export const createOffer = catchAsync(async (req: AuthRequest, res: Response) => {
  const offer = await negotiationService.createOffer(req.user!.id, req.body);
  createdResponse(res, offer, 'Penawaran berhasil diajukan kepada Penyuplai.');
});

/**
 * [BUYER] Get My Sent Offers
 */
export const getMyOffers = catchAsync(async (req: AuthRequest, res: Response) => {
  const status = req.query.status as string | undefined;
  const offers = await negotiationService.listNegotiations(req.user!.id, 'BUYER', status);
  successResponse(res, offers, 'Daftar penawaran Anda');
});

/**
 * [SUPPLIER] Get Incoming Offers
 */
export const getIncomingOffers = catchAsync(async (req: AuthRequest, res: Response) => {
  const status = req.query.status as string | undefined;
  const offers = await negotiationService.listNegotiations(req.user!.id, 'SELLER', status);
  successResponse(res, offers, 'Daftar penawaran masuk dari Pembeli');
});

/**
 * [SUPPLIER] Update Offer Status (Accept/Reject)
 */
export const updateStatus = catchAsync(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { status, ...updateData } = req.body;
  const updated = await negotiationService.updateOfferStatus(id, req.user!.id, status, updateData);

  const msg =
    status === 'OFFER_ACCEPTED'
      ? 'Penawaran disetujui. Anda bisa melanjutkannya dengan membuat Kontrak Invoice.'
      : 'Penawaran berhasil ditolak.';

  successResponse(res, updated, msg);
});

/**
 * [BOTH] Send Chat Message inside Negotiation
 */
export const sendChat = catchAsync(async (req: AuthRequest, res: Response) => {
  const { id } = req.params; // negotiationId
  const { content, attachmentUrl } = req.body;

  const chat = await negotiationService.sendChatMessage(id, req.user!.id, content, attachmentUrl);
  createdResponse(res, chat, 'Pesan terkirim');
});

/**
 * [BOTH] Get Chat Messages Support
 */
export const getChats = catchAsync(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const chats = await negotiationService.listChatMessages(id, req.user!.id);
  successResponse(res, chats, 'Riwayat pesan negosiasi');
});

/**
 * [BOTH] Get Detail of One Negotiation (Buyer or Seller)
 */
export const getNegotiationDetail = catchAsync(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const detail = await negotiationService.getNegotiationById(id, req.user!.id);
  successResponse(res, detail, 'Detail Negosiasi dan Riwayat Chat.');
});
