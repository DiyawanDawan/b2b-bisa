import { Router } from 'express';
import validate from '#middlewares/validate';
import * as c from '#controllers/admin-catalog.controller';
import * as v from '#validations/admin-catalog.validation';

const router = Router();

router.get('/', validate(v.adminListProductQuestionsSchema, 'query'), c.listProductQuestions);
router.get('/:id', validate(v.idParamSchema, 'params'), c.getProductQuestion);
router.post(
  '/:id/moderate',
  validate(v.idParamSchema, 'params'),
  validate(v.adminModerateProductQuestionSchema),
  c.moderateProductQuestion,
);
router.post(
  '/:id/answer',
  validate(v.idParamSchema, 'params'),
  validate(v.adminAnswerProductQuestionSchema),
  c.answerProductQuestion,
);

export default router;
