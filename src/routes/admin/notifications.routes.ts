import { Router } from 'express';
import * as adminController from '#controllers/admin.controller';
import validate from '#middlewares/validate';
import { broadcastSchema } from '#validations/admin.validation';

const router = Router();

/**
 * @route   POST /api/v1/admin/notifications/broadcast
 * @desc    Send a system-wide announcement to users
 * @access  Admin Only
 */
router.post('/broadcast', validate(broadcastSchema), adminController.sendBroadcast);

export default router;
