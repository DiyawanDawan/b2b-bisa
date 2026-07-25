import { Router } from 'express';
import validate from '#middlewares/validate';
import * as v from '#validations/admin-governance.validation';
import * as controller from '#controllers/admin-governance.controller';

const router = Router();

/** GET /api/v1/admin/ai-operations/overview */
router.get('/overview', controller.getAiOperationsOverview);

/** GET /api/v1/admin/ai-operations/predictions */
router.get(
  '/predictions',
  validate(v.adminListAiPredictionsSchema, 'query'),
  controller.listAiPredictions,
);

/** PATCH /api/v1/admin/ai-operations/config — konfigurasi non-secret + toggle fitur */
router.patch('/config', validate(v.adminAiConfigSchema), controller.updateAiConfig);

export default router;
