import { Router } from 'express';
import { requireAuth } from '#middlewares/authMiddleware';
import { isAdmin } from '#middlewares/isAdmin';
import dashboardRoutes from '#routes/admin/dashboard.routes';
import userRoutes from '#routes/admin/users.routes';
import financeRoutes from '#routes/admin/finance.routes';
import orderRoutes from '#routes/admin/orders.routes';
import productRoutes from '#routes/admin/products.routes';
import notificationRoutes from '#routes/admin/notifications.routes';

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

export default router;
