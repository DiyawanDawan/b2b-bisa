import { Router } from 'express';
import * as storageController from '#controllers/storage.controller';

const router = Router();

router.get(/^\/assets\/(.+)$/, storageController.servePublicAsset);
router.get(/^\/secure\/(.+)$/, storageController.serveSecureAsset);

export default router;
