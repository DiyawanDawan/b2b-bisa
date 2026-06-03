import { Router } from 'express';
import * as policyController from '#controllers/policy.controller';

const router = Router();

/**
 * @route GET /api/v1/policies
 * @desc List active legal policies (metadata)
 * @access Public
 */
router.get('/', policyController.listPolicies);

/**
 * @route GET /api/v1/policies/:key
 * @desc Get policy content by key (terms | privacy)
 * @access Public
 */
router.get('/:key', policyController.getPolicyByKey);

export default router;
