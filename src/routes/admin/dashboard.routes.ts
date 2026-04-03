import { Router } from 'express';
import * as adminController from '#controllers/admin.controller';

const router = Router();

/**
 * GET /api/v1/admin/dashboard/stats
 * Statistik ringkasan (GMV, Payouts, Commissions, Users)
 */
router.get('/stats', adminController.getDashboardStats);

/**
 * GET /api/v1/admin/dashboard/biomass-trend
 * Data tren tonase biomassa harian.
 */
router.get('/biomass-trend', adminController.getBiomassTrend);

/**
 * GET /api/v1/admin/dashboard/charts/revenue
 * Tren pendapatan bulanan (Area Chart).
 */
router.get('/charts/revenue', adminController.getRevenueAnalytics);

/**
 * GET /api/v1/admin/dashboard/charts/users
 * Demografi user (Donut/Pie Chart).
 */
router.get('/charts/users', adminController.getUserAnalytics);

/**
 * GET /api/v1/admin/dashboard/charts/categories
 * Product mix (Pie/Radar Chart).
 */
router.get('/charts/categories', adminController.getCategoryAnalytics);

/**
 * GET /api/v1/admin/dashboard/charts/performance
 * Top suppliers (Bar/Column Chart).
 */
router.get('/charts/performance', adminController.getTopSuppliers);

export default router;
