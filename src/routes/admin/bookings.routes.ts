import { Router } from 'express';
import validate from '#middlewares/validate';
import * as v from '#validations/admin-core.validation';
import * as controller from '#controllers/admin-core.controller';

const router = Router();

/** GET /api/v1/admin/bookings */
router.get('/', validate(v.adminListBookingsSchema, 'query'), controller.listBookings);

/** GET /api/v1/admin/bookings/:id */
router.get('/:id', validate(v.idParamSchema, 'params'), controller.getBooking);

/** PATCH /api/v1/admin/bookings/:id/status */
router.patch(
  '/:id/status',
  validate(v.idParamSchema, 'params'),
  validate(v.adminBookingStatusSchema),
  controller.updateBookingStatus,
);

/** POST /api/v1/admin/bookings/:id/cancel */
router.post(
  '/:id/cancel',
  validate(v.idParamSchema, 'params'),
  validate(v.adminBookingCancelSchema),
  controller.cancelBooking,
);

/** POST /api/v1/admin/bookings/:id/reschedule */
router.post(
  '/:id/reschedule',
  validate(v.idParamSchema, 'params'),
  validate(v.adminBookingRescheduleSchema),
  controller.rescheduleBooking,
);

export default router;
