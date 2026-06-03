import { Router } from 'express';
import * as adminController from '#controllers/admin.controller';
import validate from '#middlewares/validate';
import { broadcastSchema, paginationQuerySchema } from '#validations/admin.validation';

const router = Router();

router.get('/stats', adminController.getNotificationStats);

router.get(
  '/history',
  validate(paginationQuerySchema, 'query'),
  adminController.listBroadcastHistory,
);

router.post('/broadcast', validate(broadcastSchema), adminController.sendBroadcast);

export default router;
