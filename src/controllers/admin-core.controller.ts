import { Response } from 'express';
import { AuthRequest } from '#types/index';
import catchAsync from '#utils/catchAsync';
import { successResponse, paginatedResponse } from '#utils/response.util';
import * as core from '#services/admin-core.service';
import {
  RfqStatus,
  BookingStatus,
  ReferralRewardStatus,
  LiveSessionStatus,
  ProductMode,
} from '#prisma';

const num = (value: unknown, fallback: number) => Number(value) || fallback;
const str = (value: unknown) => (typeof value === 'string' ? value : undefined);
const bool = (value: unknown) =>
  value === undefined ? undefined : value === true || value === 'true';

/* -------------------------------- RFQ ------------------------------------- */
export const listRfqs = catchAsync(async (req: AuthRequest, res: Response) => {
  const result = await core.listRfqsAdmin({
    page: num(req.query.page, 1),
    limit: num(req.query.limit, 10),
    search: str(req.query.search),
    status: req.query.status as RfqStatus | undefined,
    productMode: req.query.productMode as ProductMode | undefined,
    isFlagged: bool(req.query.isFlagged),
    expired: bool(req.query.expired),
  });
  return paginatedResponse(
    res,
    result.items,
    result.pagination.total,
    result.pagination.page,
    result.pagination.limit,
    'Daftar RFQ',
  );
});

export const getRfq = catchAsync(async (req: AuthRequest, res: Response) => {
  const rfq = await core.getRfqAdmin(req.params.id);
  successResponse(res, rfq, 'Detail RFQ');
});

export const updateRfqStatus = catchAsync(async (req: AuthRequest, res: Response) => {
  const rfq = await core.updateRfqStatusAdmin(
    req.params.id,
    req.body.status,
    req.body.reason,
    req.user!.id,
  );
  successResponse(res, rfq, 'Status RFQ diperbarui');
});

export const cancelRfq = catchAsync(async (req: AuthRequest, res: Response) => {
  const rfq = await core.cancelRfqAdmin(req.params.id, req.body.reason, req.user!.id);
  successResponse(res, rfq, 'RFQ ditutup');
});

export const expireRfq = catchAsync(async (req: AuthRequest, res: Response) => {
  const rfq = await core.expireRfqAdmin(req.params.id, req.user!.id);
  successResponse(res, rfq, 'RFQ ditandai kedaluwarsa');
});

export const flagRfq = catchAsync(async (req: AuthRequest, res: Response) => {
  const rfq = await core.flagRfqAdmin(
    req.params.id,
    Boolean(req.body.flagged),
    req.body.reason,
    req.user!.id,
  );
  successResponse(res, rfq, req.body.flagged ? 'RFQ ditandai' : 'Tanda RFQ dilepas');
});

/* ------------------------------ Bookings ---------------------------------- */
export const listBookings = catchAsync(async (req: AuthRequest, res: Response) => {
  const result = await core.listBookingsAdmin({
    page: num(req.query.page, 1),
    limit: num(req.query.limit, 10),
    search: str(req.query.search),
    status: req.query.status as BookingStatus | undefined,
    hasDispute: bool(req.query.hasDispute),
  });
  return paginatedResponse(
    res,
    result.items,
    result.pagination.total,
    result.pagination.page,
    result.pagination.limit,
    'Daftar booking',
  );
});

export const getBooking = catchAsync(async (req: AuthRequest, res: Response) => {
  const booking = await core.getBookingAdmin(req.params.id);
  successResponse(res, booking, 'Detail booking');
});

export const updateBookingStatus = catchAsync(async (req: AuthRequest, res: Response) => {
  const booking = await core.updateBookingStatusAdmin(
    req.params.id,
    req.body.status,
    req.body.reason,
    req.user!.id,
  );
  successResponse(res, booking, 'Status booking diperbarui');
});

export const cancelBooking = catchAsync(async (req: AuthRequest, res: Response) => {
  const booking = await core.cancelBookingAdmin(req.params.id, req.body.reason, req.user!.id);
  successResponse(res, booking, 'Booking dibatalkan');
});

export const rescheduleBooking = catchAsync(async (req: AuthRequest, res: Response) => {
  const booking = await core.rescheduleBookingAdmin(req.params.id, req.body, req.user!.id);
  successResponse(res, booking, 'Booking dijadwalkan ulang');
});

/* ------------------------------- Reviews ---------------------------------- */
export const listReviews = catchAsync(async (req: AuthRequest, res: Response) => {
  const result = await core.listReviewsAdmin({
    page: num(req.query.page, 1),
    limit: num(req.query.limit, 10),
    search: str(req.query.search),
    rating: req.query.rating ? Number(req.query.rating) : undefined,
    status: req.query.status as 'visible' | 'hidden' | 'flagged' | undefined,
    productId: str(req.query.productId),
  });
  return paginatedResponse(
    res,
    result.items,
    result.pagination.total,
    result.pagination.page,
    result.pagination.limit,
    'Daftar ulasan',
  );
});

export const getReview = catchAsync(async (req: AuthRequest, res: Response) => {
  const review = await core.getReviewAdmin(req.params.id);
  successResponse(res, review, 'Detail ulasan');
});

export const hideReview = catchAsync(async (req: AuthRequest, res: Response) => {
  const review = await core.hideReviewAdmin(req.params.id, req.body.reason, req.user!.id);
  successResponse(res, review, 'Ulasan disembunyikan');
});

export const restoreReview = catchAsync(async (req: AuthRequest, res: Response) => {
  const review = await core.restoreReviewAdmin(req.params.id, req.user!.id);
  successResponse(res, review, 'Ulasan ditampilkan kembali');
});

export const flagReview = catchAsync(async (req: AuthRequest, res: Response) => {
  const review = await core.flagReviewAdmin(
    req.params.id,
    Boolean(req.body.flagged),
    req.body.reason,
    req.user!.id,
  );
  successResponse(res, review, req.body.flagged ? 'Ulasan ditandai' : 'Tanda ulasan dilepas');
});

/* ------------------------------ Referrals --------------------------------- */
export const listReferrals = catchAsync(async (req: AuthRequest, res: Response) => {
  const result = await core.listReferralsAdmin({
    page: num(req.query.page, 1),
    limit: num(req.query.limit, 10),
    search: str(req.query.search),
    status: req.query.status as ReferralRewardStatus | undefined,
    suspicious: bool(req.query.suspicious),
  });
  return paginatedResponse(
    res,
    result.items,
    result.pagination.total,
    result.pagination.page,
    result.pagination.limit,
    'Daftar reward referral',
  );
});

export const getReferral = catchAsync(async (req: AuthRequest, res: Response) => {
  const reward = await core.getReferralAdmin(req.params.id);
  successResponse(res, reward, 'Detail reward referral');
});

export const approveReferral = catchAsync(async (req: AuthRequest, res: Response) => {
  const reward = await core.approveReferralAdmin(req.params.id, req.body.reason, req.user!.id);
  successResponse(res, reward, 'Reward referral disetujui & dikreditkan');
});

export const rejectReferral = catchAsync(async (req: AuthRequest, res: Response) => {
  const reward = await core.rejectReferralAdmin(req.params.id, req.body.reason, req.user!.id);
  successResponse(res, reward, 'Reward referral ditolak');
});

export const revokeReferral = catchAsync(async (req: AuthRequest, res: Response) => {
  const reward = await core.revokeReferralAdmin(req.params.id, req.body.reason, req.user!.id);
  successResponse(res, reward, 'Reward referral dicabut');
});

/* ---------------------------- Live sessions ------------------------------- */
export const listLiveSessions = catchAsync(async (req: AuthRequest, res: Response) => {
  const result = await core.listLiveSessionsAdmin({
    page: num(req.query.page, 1),
    limit: num(req.query.limit, 10),
    search: str(req.query.search),
    status: req.query.status as LiveSessionStatus | undefined,
    supplierId: str(req.query.supplierId),
  });
  return paginatedResponse(
    res,
    result.items,
    result.pagination.total,
    result.pagination.page,
    result.pagination.limit,
    'Daftar live session',
  );
});

export const getLiveSession = catchAsync(async (req: AuthRequest, res: Response) => {
  const session = await core.getLiveSessionAdmin(req.params.id);
  successResponse(res, session, 'Detail live session');
});

export const terminateLiveSession = catchAsync(async (req: AuthRequest, res: Response) => {
  const session = await core.terminateLiveSessionAdmin(
    req.params.id,
    req.body.reason,
    req.user!.id,
  );
  successResponse(res, session, 'Live session dihentikan');
});

export const updateLiveStatus = catchAsync(async (req: AuthRequest, res: Response) => {
  const session = await core.updateLiveStatusAdmin(
    req.params.id,
    req.body.status,
    req.body.reason,
    req.user!.id,
  );
  successResponse(res, session, 'Status live session diperbarui');
});

export const pinLiveProducts = catchAsync(async (req: AuthRequest, res: Response) => {
  const session = await core.pinLiveProductsAdmin(
    req.params.id,
    req.body.pinnedProductIds,
    req.user!.id,
  );
  successResponse(res, session, 'Produk pin diperbarui');
});

export const moderateLiveComment = catchAsync(async (req: AuthRequest, res: Response) => {
  const result = await core.moderateLiveCommentAdmin(
    req.params.id,
    req.params.commentId,
    req.body.reason,
    req.user!.id,
  );
  successResponse(res, result, 'Komentar dimoderasi');
});
