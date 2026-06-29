import { Router } from 'express';
import * as adminVoucherController from '#controllers/admin.voucher.controller';
import validate from '#middlewares/validate';
import {
  createVoucherAdminSchema,
  updateVoucherAdminSchema,
  voucherIdParamSchema,
} from '#validations/voucher.validation';

const router = Router();

/** GET /api/v1/admin/vouchers */
router.get('/', adminVoucherController.listVouchers);

/** POST /api/v1/admin/vouchers */
router.post('/', validate(createVoucherAdminSchema), adminVoucherController.createVoucher);

/** PATCH /api/v1/admin/vouchers/:id */
router.patch(
  '/:id',
  validate(voucherIdParamSchema, 'params'),
  validate(updateVoucherAdminSchema),
  adminVoucherController.updateVoucher,
);

export default router;
