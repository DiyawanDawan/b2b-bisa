import { Router } from 'express';
import validate from '#middlewares/validate';
import { requireAuth, requireRole, optionalAuth } from '#middlewares/authMiddleware';
import { UserRole } from '#prisma';
import * as liveController from '#controllers/live-session.controller';
import { z } from 'zod';

const router = Router();

const createSessionSchema = z.object({
  title: z.string().min(3).max(120),
  description: z.string().max(2000).optional(),
  streamUrl: z.string().url().optional().or(z.literal('')),
  scheduledAt: z.string().datetime().optional(),
  pinnedProductIds: z.array(z.string().uuid()).max(10).optional(),
});

const commentSchema = z.object({
  message: z.string().min(1).max(500),
});

router.get('/', optionalAuth, liveController.listPublic);
router.get(
  '/mine',
  requireAuth,
  requireRole(UserRole.SUPPLIER, UserRole.ADMIN),
  liveController.listMine,
);
router.get('/:id', optionalAuth, liveController.getById);
router.post('/:id/viewer', liveController.recordViewer);
router.post('/:id/comments', requireAuth, validate(commentSchema), liveController.comment);

router.post(
  '/',
  requireAuth,
  requireRole(UserRole.SUPPLIER, UserRole.ADMIN),
  validate(createSessionSchema),
  liveController.create,
);
router.post(
  '/:id/start',
  requireAuth,
  requireRole(UserRole.SUPPLIER, UserRole.ADMIN),
  liveController.start,
);
router.post(
  '/:id/end',
  requireAuth,
  requireRole(UserRole.SUPPLIER, UserRole.ADMIN),
  liveController.end,
);

export default router;
