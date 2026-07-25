import { Router } from 'express';
import * as extendedController from '#controllers/admin-extended.controller';
import * as partialController from '#controllers/admin-partial.controller';
import validate from '#middlewares/validate';
import { updatePolicySchema } from '#validations/admin.validation';
import * as partialValidation from '#validations/admin-partial.validation';

const router = Router();

router.get('/', extendedController.listPolicies);

router.post(
  '/',
  validate(partialValidation.adminCreatePolicySchema),
  partialController.createPolicy,
);

router.patch('/:id', validate(updatePolicySchema), extendedController.updatePolicy);

router.post(
  '/:id/revisions',
  validate(partialValidation.adminCreatePolicyRevisionSchema),
  partialController.createPolicyRevision,
);

router.get('/:id/revisions', partialController.listPolicyRevisions);

router.post(
  '/:id/publish',
  validate(partialValidation.adminPublishPolicySchema),
  partialController.publishPolicy,
);

router.get('/:id/preview', partialController.previewPolicy);

export default router;
