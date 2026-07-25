import { Router } from 'express';
import * as adminVoucherController from '#controllers/admin.voucher.controller';
import validate from '#middlewares/validate';
import {
  createVoucherAdminSchema,
  listVouchersAdminSchema,
  updateVoucherAdminSchema,
  voucherIdParamSchema,
} from '#validations/voucher.validation';

const router = Router();

/** GET /api/v1/admin/vouchers */
router.get('/', validate(listVouchersAdminSchema, 'query'), adminVoucherController.listVouchers);

/** POST /api/v1/admin/vouchers */
router.post('/', validate(createVoucherAdminSchema), adminVoucherController.createVoucher);

/** GET /api/v1/admin/vouchers/:id/usage */
router.get(
  '/:id/usage',
  validate(voucherIdParamSchema, 'params'),
  adminVoucherController.getVoucherUsage,
);

/** PATCH /api/v1/admin/vouchers/:id */
router.patch(
  '/:id',
  validate(voucherIdParamSchema, 'params'),
  validate(updateVoucherAdminSchema),
  adminVoucherController.updateVoucher,
);

/** DELETE /api/v1/admin/vouchers/:id — hard delete if unused, else soft-disable */
router.delete(
  '/:id',
  validate(voucherIdParamSchema, 'params'),
  adminVoucherController.deleteVoucher,
);

export default router;
