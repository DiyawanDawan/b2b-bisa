import { Router } from 'express';
import * as extendedController from '#controllers/admin-extended.controller';
import * as partialController from '#controllers/admin-partial.controller';
import validate from '#middlewares/validate';
import {
  adminForumCreateCommentSchema,
  adminForumCreatePostSchema,
  adminForumUpdatePostSchema,
  listForumAdminSchema,
} from '#validations/admin.validation';
import * as partialValidation from '#validations/admin-partial.validation';

const router = Router();

router.get('/categories', extendedController.listForumCategories);

router.get('/groups', validate(listForumAdminSchema, 'query'), extendedController.listForumGroups);

router.post(
  '/groups',
  validate(partialValidation.adminCreateForumGroupSchema),
  partialController.createForumGroup,
);

router.patch(
  '/groups/:id',
  validate(partialValidation.adminUpdateForumGroupSchema),
  partialController.updateForumGroup,
);

router.delete('/groups/:id', partialController.deleteForumGroup);

router.get('/groups/:id/moderators', partialController.listForumGroupModerators);

router.post(
  '/groups/:id/moderators',
  validate(partialValidation.adminForumModeratorSchema),
  partialController.addForumGroupModerator,
);

router.delete('/groups/:id/moderators/:userId', partialController.removeForumGroupModerator);

router.get('/posts', validate(listForumAdminSchema, 'query'), extendedController.listForumPosts);

router.post('/posts', validate(adminForumCreatePostSchema), extendedController.createForumPost);

router.get('/posts/:id', extendedController.getForumPost);

router.patch(
  '/posts/:id',
  validate(adminForumUpdatePostSchema),
  extendedController.moderateForumPost,
);

router.post(
  '/posts/:id/move',
  validate(partialValidation.adminMoveForumPostSchema),
  partialController.moveForumPost,
);

router.post(
  '/posts/:id/comments',
  validate(adminForumCreateCommentSchema),
  extendedController.createForumComment,
);

export default router;
