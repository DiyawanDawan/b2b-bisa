import { Router } from 'express';
import { requireAuth } from '#middlewares/authMiddleware';
import { isAdmin } from '#middlewares/isAdmin';
import dashboardRoutes from '#routes/admin/dashboard.routes';
import userRoutes from '#routes/admin/users.routes';
import financeRoutes from '#routes/admin/finance.routes';
import orderRoutes from '#routes/admin/orders.routes';
import productRoutes from '#routes/admin/products.routes';
import notificationRoutes from '#routes/admin/notifications.routes';
import gisRoutes from '#routes/admin/gis.routes';
import analyticsRoutes from '#routes/admin/analytics.routes';
import forumRoutes from '#routes/admin/forum.routes';
import policiesRoutes from '#routes/admin/policies.routes';
import platformSettingsRoutes from '#routes/admin/platform-settings.routes';
import walletsRoutes from '#routes/admin/wallets.routes';
import marketRoutes from '#routes/admin/market.routes';
import chatRoutes from '#routes/admin/chat.routes';
import crmRoutes from '#routes/admin/crm.routes';
import iotRoutes from '#routes/admin/iot.routes';

const router = Router();

// Semua route di /api/v1/admin/* wajib Authenticated & Role ADMIN
router.use(requireAuth, isAdmin);

// Sub-Modul Admin
router.use('/dashboard', dashboardRoutes);
router.use('/users', userRoutes);
router.use('/finance', financeRoutes);
router.use('/orders', orderRoutes);
router.use('/products', productRoutes);
router.use('/notifications', notificationRoutes);
router.use('/gis', gisRoutes);
router.use('/analytics', analyticsRoutes);
router.use('/forum', forumRoutes);
router.use('/policies', policiesRoutes);
router.use('/platform-settings', platformSettingsRoutes);
router.use('/wallets', walletsRoutes);
router.use('/market', marketRoutes);
router.use('/chat', chatRoutes);
router.use('/crm', crmRoutes);
router.use('/iot', iotRoutes);

export default router;
