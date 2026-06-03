import { Router } from 'express';
import * as extendedController from '#controllers/admin-extended.controller';
import validate from '#middlewares/validate';
import { paginationQuerySchema } from '#validations/admin.validation';

const router = Router();

router.get('/', validate(paginationQuerySchema, 'query'), extendedController.listWallets);

export default router;
