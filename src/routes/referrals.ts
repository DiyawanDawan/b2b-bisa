import { Router } from 'express';
import { requireAuth, optionalAuth } from '#middlewares/authMiddleware';
import * as referralController from '#controllers/referral.controller';

const router = Router();

router.get('/validate/:code', optionalAuth, referralController.validateCode);
router.get('/me', requireAuth, referralController.getMyReferral);

export default router;
