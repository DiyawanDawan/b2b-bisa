import { Response } from 'express';
import { AuthRequest } from '#types/index';
import catchAsync from '#utils/catchAsync';
import { createdResponse, successResponse } from '#utils/response.util';
import * as bookingService from '#services/booking.service';
import { BookingStatus, UserRole } from '#prisma';

export const createBooking = catchAsync(async (req: AuthRequest, res: Response) => {
  const result = await bookingService.createBooking(req.user!.id, req.body);
  createdResponse(res, result, 'Booking berhasil dibuat. Selesaikan checkout sebelum kedaluwarsa.');
});

export const listMyBookings = catchAsync(async (req: AuthRequest, res: Response) => {
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 20;
  const status = req.query.status as BookingStatus | undefined;
  const result = await bookingService.listMyBookings(
    req.user!.id,
    req.user!.role as UserRole,
    page,
    limit,
    status,
  );
  successResponse(res, result, 'Daftar booking Anda.');
});

export const listIncomingBookings = catchAsync(async (req: AuthRequest, res: Response) => {
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 20;
  const status = req.query.status as BookingStatus | undefined;
  const result = await bookingService.listIncomingBookings(
    req.user!.id,
    page,
    limit,
    status,
  );
  successResponse(res, result, 'Booking masuk dari buyer.');
});

export const getBookingById = catchAsync(async (req: AuthRequest, res: Response) => {
  const result = await bookingService.getBookingById(req.params.id, req.user!.id);
  successResponse(res, result, 'Detail booking.');
});

export const cancelBooking = catchAsync(async (req: AuthRequest, res: Response) => {
  const { reason } = req.body as { reason?: string };
  const result = await bookingService.cancelBooking(req.params.id, req.user!.id, reason);
  successResponse(res, result, 'Booking dibatalkan.');
});

export const confirmBooking = catchAsync(async (req: AuthRequest, res: Response) => {
  const result = await bookingService.confirmBooking(req.params.id, req.user!.id);
  successResponse(res, result, 'Booking dikonfirmasi.');
});

export const checkoutBooking = catchAsync(async (req: AuthRequest, res: Response) => {
  const result = await bookingService.checkoutBooking(req.params.id, req.user!.id, req.body);
  successResponse(res, result, 'Checkout dari booking berhasil. Lanjutkan pembayaran.');
});
