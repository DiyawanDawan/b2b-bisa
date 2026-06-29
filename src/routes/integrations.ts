import { Router } from 'express';
import validate from '#middlewares/validate';
import { requireAuth, requireRole } from '#middlewares/authMiddleware';
import { requireSupplierApiKey } from '#middlewares/apiKeyAuth';
import { UserRole } from '#prisma';
import * as erpController from '#controllers/erp-integration.controller';
import { z } from 'zod';

const router = Router();

const inventorySyncSchema = z.object({
  items: z
    .array(
      z.object({
        productId: z.string().uuid(),
        stock: z.coerce.number().nonnegative(),
      }),
    )
    .min(1)
    .max(200),
});

const createKeySchema = z.object({
  name: z.string().min(2).max(80),
});

// Supplier portal — kelola API key
router.get(
  '/erp/keys',
  requireAuth,
  requireRole(UserRole.SUPPLIER, UserRole.ADMIN),
  erpController.listApiKeys,
);
router.post(
  '/erp/keys',
  requireAuth,
  requireRole(UserRole.SUPPLIER, UserRole.ADMIN),
  validate(createKeySchema),
  erpController.createApiKey,
);
router.delete(
  '/erp/keys/:id',
  requireAuth,
  requireRole(UserRole.SUPPLIER, UserRole.ADMIN),
  erpController.revokeApiKey,
);

// ERP machine-to-machine (API key auth)
router.get('/erp/products', requireSupplierApiKey, erpController.exportProducts);
router.patch(
  '/erp/inventory',
  requireSupplierApiKey,
  validate(inventorySyncSchema),
  erpController.syncInventory,
);

export default router;
