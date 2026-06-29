import { Router } from 'express';
import * as knowledgeController from '#controllers/admin-knowledge.controller';
import validate from '#middlewares/validate';
import uploadKnowledge from '#middlewares/uploadKnowledge';
import {
  createKnowledgeTextSchema,
  listKnowledgeSchema,
  uploadKnowledgeSchema,
} from '#validations/knowledge.validation';

const router = Router();

router.get('/stats', knowledgeController.getKnowledgeStats);
router.get('/', validate(listKnowledgeSchema, 'query'), knowledgeController.listKnowledge);
router.post('/text', validate(createKnowledgeTextSchema), knowledgeController.createKnowledgeText);
router.post(
  '/upload',
  uploadKnowledge.single('file'),
  validate(uploadKnowledgeSchema, 'body'),
  knowledgeController.uploadKnowledge,
);
router.post('/:id/reindex', knowledgeController.reindexKnowledge);
router.delete('/:id', knowledgeController.deleteKnowledge);

export default router;
