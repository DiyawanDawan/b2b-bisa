import { Router } from 'express';
import validate from '#middlewares/validate';
import { requireAuth, requireRole } from '#middlewares/authMiddleware';
import * as bookingController from '#controllers/booking.controller';
import * as v from '#validations/booking.validation';
import { UserRole } from '#prisma';

const router = Router();

router.use(requireAuth);

router.post(
  '/',
  requireRole(UserRole.BUYER, UserRole.ADMIN),
  validate(v.createBookingSchema),
  bookingController.createBooking,
);

router.get('/my', validate(v.listBookingsQuerySchema, 'query'), bookingController.listMyBookings);

router.get(
  '/incoming',
  requireRole(UserRole.SUPPLIER, UserRole.ADMIN),
  validate(v.listBookingsQuerySchema, 'query'),
  bookingController.listIncomingBookings,
);

router.get('/:id', validate(v.bookingIdParamSchema, 'params'), bookingController.getBookingById);

router.put(
  '/:id/cancel',
  validate(v.bookingIdParamSchema, 'params'),
  validate(v.cancelBookingSchema),
  bookingController.cancelBooking,
);

router.put(
  '/:id/confirm',
  requireRole(UserRole.SUPPLIER, UserRole.ADMIN),
  validate(v.bookingIdParamSchema, 'params'),
  bookingController.confirmBooking,
);

router.post(
  '/:id/checkout',
  requireRole(UserRole.BUYER, UserRole.ADMIN),
  validate(v.bookingIdParamSchema, 'params'),
  validate(v.checkoutBookingSchema),
  bookingController.checkoutBooking,
);

export default router;
