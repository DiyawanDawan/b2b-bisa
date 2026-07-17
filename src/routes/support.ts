import { Router } from 'express';
import { requireAuth } from '#middlewares/authMiddleware';
import validate from '#middlewares/validate';
import * as supportController from '#controllers/support.controller';
import * as supportValidation from '#validations/support.validation';

const router = Router();

router.use(requireAuth);

router.post(
  '/tickets',
  validate(supportValidation.createTicketSchema),
  supportController.createTicket,
);
router.get(
  '/tickets',
  validate(supportValidation.listTicketsQuerySchema, 'query'),
  supportController.listTickets,
);
router.get('/tickets/active', supportController.getActiveTicket);
router.get(
  '/tickets/:id',
  validate(supportValidation.ticketIdParamSchema, 'params'),
  supportController.getTicket,
);
router.post(
  '/tickets/:id/messages',
  validate(supportValidation.ticketIdParamSchema, 'params'),
  validate(supportValidation.createMessageSchema),
  supportController.addMessage,
);
router.post(
  '/tickets/:id/close',
  validate(supportValidation.ticketIdParamSchema, 'params'),
  supportController.closeTicket,
);

export default router;
