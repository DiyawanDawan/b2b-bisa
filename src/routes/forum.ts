import { Router } from 'express';
import * as forumController from '#controllers/forum.controller';
import { requireAuth } from '#middlewares/authMiddleware';

import validate from '#middlewares/validate';
import * as forumValidation from '#validations/forum.validation';

const router = Router();

// Public routes
router.get(
  '/posts',
  validate(forumValidation.paginationSchema, 'query'),
  forumController.listPosts,
);
router.get('/posts/:id', forumController.getPostById);

// Protected routes
router.use(requireAuth);

router.post(
  '/posts',
  validate(forumValidation.createPostSchema, 'body'),
  forumController.createPost,
);

router.delete('/posts/:id', forumController.deletePost);

router.post(
  '/comments',
  validate(forumValidation.createCommentSchema, 'body'),
  forumController.createComment,
);

router.post('/vote', validate(forumValidation.voteSchema, 'body'), forumController.vote);

export default router;
