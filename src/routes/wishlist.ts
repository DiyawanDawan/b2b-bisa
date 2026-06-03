import { Router } from 'express';
import validate from '#middlewares/validate';
import { requireAuth, requireRole } from '#middlewares/authMiddleware';
import { UserRole } from '#prisma';
import * as wishlistController from '#controllers/wishlist.controller';
import * as v from '#validations/wishlist.validation';

const router = Router();

router.use(requireAuth, requireRole(UserRole.BUYER, UserRole.ADMIN));

router.get('/', wishlistController.getWishlist);
router.get('/ids', wishlistController.getWishlistIds);
router.get('/check/:productId', wishlistController.checkLike);
router.post('/toggle', validate(v.toggleLikeSchema), wishlistController.toggleLike);

export default router;
