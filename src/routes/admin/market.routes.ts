import { Router } from 'express';
import * as extendedController from '#controllers/admin-extended.controller';

const router = Router();

router.get('/trends', extendedController.getMarketTrends);

export default router;
