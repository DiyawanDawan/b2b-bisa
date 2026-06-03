import { Router } from 'express';
import validate from '#middlewares/validate';
import { requireAuth, requireRole } from '#middlewares/authMiddleware';
import { UserRole } from '#prisma';
import * as cartController from '#controllers/cart.controller';
import * as v from '#validations/cart.validation';

const router = Router();

router.use(requireAuth, requireRole(UserRole.BUYER, UserRole.ADMIN));

router.get('/', cartController.getCart);
router.get('/count', cartController.getCartCount);
router.post('/', validate(v.addToCartSchema), cartController.addToCart);
router.patch('/:id', validate(v.updateCartItemSchema), cartController.updateCartItem);
router.delete('/clear', cartController.clearCart);
router.delete('/:id', cartController.removeCartItem);

export default router;
