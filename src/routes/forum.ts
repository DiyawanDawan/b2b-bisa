import { Router } from 'express';
import * as forumController from '#controllers/forum.controller';
import * as forumGroupController from '#controllers/forum-group.controller';
import { requireAuth, optionalAuth } from '#middlewares/authMiddleware';
import validate from '#middlewares/validate';
import * as forumValidation from '#validations/forum.validation';

const router = Router();

// Public routes — groups must be before /posts/:id
router.get(
  '/groups',
  optionalAuth,
  validate(forumValidation.listGroupsSchema, 'query'),
  forumGroupController.listGroups,
);

router.get('/groups/:id', optionalAuth, forumGroupController.getGroupById);

router.get(
  '/posts',
  optionalAuth,
  validate(forumValidation.paginationSchema, 'query'),
  forumController.listPosts,
);

// "Postingan Saya" — HARUS didefinisikan SEBELUM `/posts/:id` agar route
// dinamis tidak menangkap path literal `/posts/me`. Diproteksi dengan
// requireAuth in-place karena urutannya di atas `router.use(requireAuth)`.
router.get(
  '/posts/me',
  requireAuth,
  validate(forumValidation.myPostsSchema, 'query'),
  forumController.listMyPosts,
);

router.get('/posts/:id', optionalAuth, forumController.getPostById);

// Protected routes
router.use(requireAuth);

router.post(
  '/groups',
  validate(forumValidation.createGroupSchema, 'body'),
  forumGroupController.createGroup,
);

router.patch(
  '/groups/:id',
  validate(forumValidation.updateGroupSchema, 'body'),
  forumGroupController.updateGroup,
);

router.post('/groups/:id/join', forumGroupController.joinGroup);
router.post('/groups/:id/leave', forumGroupController.leaveGroup);

router.post(
  '/posts',
  validate(forumValidation.createPostSchema, 'body'),
  forumController.createPost,
);

router.put(
  '/posts/:id',
  validate(forumValidation.updatePostSchema, 'body'),
  forumController.updatePost,
);

router.delete('/posts/:id', requireAuth, forumController.deletePost);

router.post(
  '/comments',
  validate(forumValidation.createCommentSchema, 'body'),
  forumController.createComment,
);

router.post('/vote', validate(forumValidation.voteSchema, 'body'), forumController.vote);

export default router;
