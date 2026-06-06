import { Router } from 'express';
import express from 'express';
import * as mediaUploadController from '#controllers/mediaUpload.controller';
import validate from '#middlewares/validate';
import { requireAuth } from '#middlewares/authMiddleware';
import { mediaUploadInitLimiter } from '#middlewares/rateLimiter';
import * as v from '#validations/mediaUpload.validation';

const router = Router();

router.use(requireAuth);

router.post(
  '/init',
  mediaUploadInitLimiter,
  validate(v.initMediaUploadSchema),
  mediaUploadController.initUpload,
);

router.get(
  '/:id',
  validate(v.mediaUploadIdParamSchema, 'params'),
  mediaUploadController.getSession,
);

router.get(
  '/:id/parts/:partNumber/presign',
  validate(v.mediaUploadPartParamSchema, 'params'),
  mediaUploadController.presignPart,
);

router.put(
  '/:id/parts/:partNumber',
  validate(v.mediaUploadPartParamSchema, 'params'),
  express.raw({ type: 'application/octet-stream', limit: '6mb' }),
  mediaUploadController.uploadPartProxy,
);

router.post(
  '/:id/complete',
  validate(v.mediaUploadIdParamSchema, 'params'),
  validate(v.completeMediaUploadSchema),
  mediaUploadController.completeUpload,
);

router.delete(
  '/:id',
  validate(v.mediaUploadIdParamSchema, 'params'),
  mediaUploadController.abortUpload,
);

export default router;
