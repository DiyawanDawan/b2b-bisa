import { Router } from 'express';
import validate from '#middlewares/validate';
import { requireAuth } from '#middlewares/authMiddleware';
import * as followController from '#controllers/follow.controller';
import * as v from '#validations/follow.validation';

const router = Router();

router.get('/stats/:userId', requireAuth, followController.getFollowStats);
router.get('/check/:userId', requireAuth, followController.checkFollow);
router.post('/toggle', requireAuth, validate(v.toggleFollowSchema), followController.toggleFollow);
router.get('/me/ids', requireAuth, followController.getMyFollowingIds);
router.get('/me/following', requireAuth, followController.getMyFollowing);
router.get('/me/followers', requireAuth, followController.getMyFollowers);
router.get('/:userId/following', requireAuth, followController.getUserFollowing);
router.get('/:userId/followers', requireAuth, followController.getUserFollowers);

export default router;
