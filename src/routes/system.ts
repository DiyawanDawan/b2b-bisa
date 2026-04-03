import { Router } from 'express';
import * as systemController from '#controllers/system.controller';

const router = Router();

/**
 * @route GET /api/v1/system/constants
 * @desc Get all system enums for frontend
 * @access Public
 */
router.get('/constants', systemController.getConstants);

export default router;
