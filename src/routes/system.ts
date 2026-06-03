import { Router } from 'express';
import * as systemController from '#controllers/system.controller';
import upload from '#middlewares/upload';
import { requireAuth } from '#middlewares/authMiddleware';
import { uploadLimiter } from '#middlewares/rateLimiter';

const router = Router();

/**
 * @route POST /api/v1/system/upload
 * @desc Generic authenticated file upload (foto produk, attachment chat, dll.)
 * @access Authenticated only
 * SEC-BE-002 + SEC-BE-005: requireAuth + uploadLimiter; folder allowlist di controller.
 */
router.post(
  '/upload',
  requireAuth,
  uploadLimiter,
  upload.single('file'),
  systemController.uploadFile,
);

/**
 * @route GET /api/v1/system/constants
 * @desc Get all system enums for frontend
 * @access Public
 */
router.get('/constants', systemController.getConstants);

/**
 * @route GET /api/v1/system/announcements
 * @desc Get platform announcements (Public bulletins)
 * @access Public
 */
router.get('/announcements', systemController.getAnnouncements);

/**
 * @route GET /api/v1/system/robots.txt
 * @desc Search engine instructions
 * @access Public
 */
router.get('/robots.txt', systemController.getRobots);

/**
 * @route GET /api/v1/system/sitemap.xml
 * @desc Search engine sitemap
 * @access Public
 */
router.get('/sitemap.xml', systemController.getSitemap);

export default router;
