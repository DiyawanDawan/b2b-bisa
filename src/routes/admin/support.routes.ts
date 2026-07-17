import { Router } from 'express';
import validate from '#middlewares/validate';
import * as supportController from '#controllers/admin-support.controller';
import * as supportValidation from '#validations/support.validation';

const router = Router();

router.get(
  '/tickets',
  validate(supportValidation.adminListTicketsQuerySchema, 'query'),
  supportController.listTickets,
);
router.get(
  '/tickets/:id',
  validate(supportValidation.ticketIdParamSchema, 'params'),
  supportController.getTicket,
);
router.patch(
  '/tickets/:id',
  validate(supportValidation.ticketIdParamSchema, 'params'),
  validate(supportValidation.updateTicketSchema),
  supportController.updateTicket,
);
router.post(
  '/tickets/:id/messages',
  validate(supportValidation.ticketIdParamSchema, 'params'),
  validate(supportValidation.createMessageSchema),
  supportController.addMessage,
);
router.post(
  '/tickets/:id/resolve',
  validate(supportValidation.ticketIdParamSchema, 'params'),
  validate(supportValidation.resolveTicketSchema),
  supportController.resolveTicket,
);

export default router;
