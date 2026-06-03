import { Router } from 'express';
import * as extendedController from '#controllers/admin-extended.controller';
import validate from '#middlewares/validate';
import { paginationQuerySchema } from '#validations/admin.validation';

const router = Router();

router.get('/carts', validate(paginationQuerySchema, 'query'), extendedController.listCartItems);

export default router;
