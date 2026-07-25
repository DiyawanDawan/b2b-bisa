import { Router } from 'express';
import { adminAccessMiddleware } from '#middlewares/adminAccess';
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
import vouchersRoutes from '#routes/admin/vouchers.routes';
import knowledgeRoutes from '#routes/admin/knowledge.routes';
import supportRoutes from '#routes/admin/support.routes';
import partnershipsRoutes from '#routes/admin/partnerships.routes';
import bisaExpressRoutes from '#routes/admin/bisa-express.routes';
import harvestLotsRoutes from '#routes/admin/harvest-lots.routes';
import collectionsRoutes from '#routes/admin/collections.routes';
import storeBannersRoutes from '#routes/admin/store-banners.routes';
import productQuestionsRoutes from '#routes/admin/product-questions.routes';
import rfqsRoutes from '#routes/admin/rfqs.routes';
import bookingsRoutes from '#routes/admin/bookings.routes';
import reviewsRoutes from '#routes/admin/reviews.routes';
import referralsRoutes from '#routes/admin/referrals.routes';
import liveSessionsRoutes from '#routes/admin/live-sessions.routes';
import auditLogsRoutes from '#routes/admin/audit-logs.routes';
import apiKeysRoutes from '#routes/admin/api-keys.routes';
import platformAccountsRoutes from '#routes/admin/platform-accounts.routes';
import aiOperationsRoutes from '#routes/admin/ai-operations.routes';
import marketDataSourcesRoutes from '#routes/admin/market-data-sources.routes';

const router = Router();

// Semua route di /api/v1/admin/* wajib authenticated, role ADMIN, dan rate-limited.
router.use(...adminAccessMiddleware);

// Sub-Modul Admin
router.use('/dashboard', dashboardRoutes);
router.use('/users', userRoutes);
// Fase 4 governance: static paths before /finance dan /market catch-all
router.use('/finance/platform-accounts', platformAccountsRoutes);
router.use('/finance', financeRoutes);
router.use('/orders', orderRoutes);
// Catalog static paths before /products/:id catch-all
router.use('/products/harvest-lots', harvestLotsRoutes);
router.use('/products/collections', collectionsRoutes);
router.use('/products/questions', productQuestionsRoutes);
router.use('/content/store-banners', storeBannersRoutes);
router.use('/products', productRoutes);
router.use('/notifications', notificationRoutes);
router.use('/gis', gisRoutes);
router.use('/analytics', analyticsRoutes);
router.use('/forum', forumRoutes);
router.use('/policies', policiesRoutes);
router.use('/platform-settings', platformSettingsRoutes);
router.use('/wallets', walletsRoutes);
router.use('/market/data-sources', marketDataSourcesRoutes);
router.use('/market', marketRoutes);
router.use('/chat', chatRoutes);
router.use('/crm', crmRoutes);
router.use('/iot', iotRoutes);
router.use('/vouchers', vouchersRoutes);
router.use('/knowledge', knowledgeRoutes);
router.use('/support', supportRoutes);
router.use('/partnerships', partnershipsRoutes);
router.use('/bisa-express', bisaExpressRoutes);
// Fase 3 core business domains
router.use('/rfqs', rfqsRoutes);
router.use('/bookings', bookingsRoutes);
router.use('/reviews', reviewsRoutes);
router.use('/referrals', referralsRoutes);
router.use('/live-sessions', liveSessionsRoutes);
// Fase 4 governance
router.use('/audit-logs', auditLogsRoutes);
router.use('/integrations/api-keys', apiKeysRoutes);
router.use('/ai-operations', aiOperationsRoutes);

export default router;
