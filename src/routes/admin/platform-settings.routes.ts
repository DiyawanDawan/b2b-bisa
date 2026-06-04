import { Router } from 'express';
import * as platformSettingsController from '#controllers/platformSettings.controller';
import validate from '#middlewares/validate';
import { upsertPlatformSettingsSchema } from '#validations/platformSettings.validation';

const router = Router();

router.get('/', platformSettingsController.listForAdmin);
router.put('/', validate(upsertPlatformSettingsSchema), platformSettingsController.upsertForAdmin);

export default router;
