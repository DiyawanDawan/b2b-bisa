import { Router } from 'express';
import validate from '#middlewares/validate';
import * as v from '#validations/admin-governance.validation';
import * as controller from '#controllers/admin-governance.controller';

const router = Router();

/** GET /api/v1/admin/audit-logs */
router.get('/', validate(v.adminListAuditLogsSchema, 'query'), controller.listAuditLogs);

/** GET /api/v1/admin/audit-logs/meta — daftar entity & action untuk filter */
router.get('/meta', controller.getAuditLogMeta);

/** GET /api/v1/admin/audit-logs/export — CSV, maksimal 31 hari */
router.get('/export', validate(v.adminExportAuditLogsSchema, 'query'), controller.exportAuditLogs);

/** GET /api/v1/admin/audit-logs/:id */
router.get('/:id', validate(v.idParamSchema, 'params'), controller.getAuditLog);

export default router;
