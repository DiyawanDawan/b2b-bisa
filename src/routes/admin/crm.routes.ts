import { Router } from 'express';
import * as crmController from '#controllers/admin-crm.controller';
import validate from '#middlewares/validate';
import * as adminValidation from '#validations/admin.validation';

const router = Router();

router.get('/overview', crmController.getCrmOverview);

router.get(
  '/contacts',
  validate(adminValidation.listCrmContactsSchema, 'query'),
  crmController.listCrmContacts,
);

router.get('/contacts/:userId', crmController.getCrmContactDetail);

router.post(
  '/contacts/:userId/notes',
  validate(adminValidation.createCrmNoteSchema),
  crmController.createCrmNote,
);

router.patch(
  '/contacts/:userId',
  validate(adminValidation.updateCrmContactSchema),
  crmController.updateCrmContact,
);

export default router;
