import { Router } from 'express';
import * as extendedController from '#controllers/admin-extended.controller';
import validate from '#middlewares/validate';
import {
  adminForumCreatePostSchema,
  adminForumUpdatePostSchema,
  listForumAdminSchema,
} from '#validations/admin.validation';

const router = Router();

router.get('/categories', extendedController.listForumCategories);

router.get('/groups', validate(listForumAdminSchema, 'query'), extendedController.listForumGroups);

router.get('/posts', validate(listForumAdminSchema, 'query'), extendedController.listForumPosts);

router.post('/posts', validate(adminForumCreatePostSchema), extendedController.createForumPost);

router.get('/posts/:id', extendedController.getForumPost);

router.patch(
  '/posts/:id',
  validate(adminForumUpdatePostSchema),
  extendedController.moderateForumPost,
);

export default router;
