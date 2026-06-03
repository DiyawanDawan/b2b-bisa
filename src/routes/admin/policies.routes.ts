import { Router } from 'express';
import * as extendedController from '#controllers/admin-extended.controller';
import validate from '#middlewares/validate';
import { updatePolicySchema } from '#validations/admin.validation';

const router = Router();

router.get('/', extendedController.listPolicies);
router.patch('/:id', validate(updatePolicySchema), extendedController.updatePolicy);

export default router;
