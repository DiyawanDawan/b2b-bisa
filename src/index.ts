import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import multer from 'multer';

dotenv.config();

import logger from '#config/logger';
import {
  globalLimiter,
  authLimiter,
  financialLimiter,
  adminActionLimiter,
  publicApiLimiter,
} from '#middlewares/rateLimiter';
import AppError from '#utils/appError';
import prisma from '#config/prisma';
import { TRUST_PROXY, PORT, CLIENT_HOST } from '#utils/env.util';
import { logXenditWebhookDevStartup } from '#utils/xenditWebhookDev.util';
import { successResponse } from '#utils/response.util';

// Parse CORS origins from .env
const corsOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map((origin) => origin.trim())
  : ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:5173'];

import authRoutes from '#routes/auth';
import usersRoutes from '#routes/users';
import productsRoutes from '#routes/products';
import negotiationsRoutes from '#routes/negotiations';
import ordersRoutes from '#routes/orders';
import transactionsRoutes from '#routes/transactions';
import paymentsRoutes from '#routes/payments';
import walletsRoutes from '#routes/wallets';
import reviewsRoutes from '#routes/reviews';
import categoriesRoutes from '#routes/categories';
import suppliersRoutes from '#routes/suppliers';
import aiRoutes from '#routes/ai';
import gisRoutes from '#routes/gis';
import iotRoutes from '#routes/iot';
import forumRoutes from '#routes/forum';
import chatbotRoutes from '#routes/chatbot';
import articlesRoutes from '#routes/articles';
import adminRoutes from '#routes/admin/index';
import systemRoutes from '#routes/system';
import notificationsRoutes from '#routes/notifications';
import marketRoutes from '#routes/market';
import organicRoutes from '#routes/organic';
import cartRoutes from '#routes/cart';
import wishlistRoutes from '#routes/wishlist';
import followsRoutes from '#routes/follows';
import policiesRoutes from '#routes/policies';
import faqsRoutes from '#routes/faqs';
import storageRoutes from '#routes/storage';
import pusherRoutes from '#routes/pusher';
import shippingRoutes from '#routes/shipping';

const app = express();
const IGNORED_404_PATHS = new Set([
  '/favicon.ico',
  '/.well-known/appspecific/com.chrome.devtools.json',
]);

/**
 * ==========================================
 * SECURITY MIDDLEWARES
 * ==========================================
 */
app.set('trust proxy', TRUST_PROXY === 'true');
app.use(helmet());
app.use(
  cors({
    origin: corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'ngrok-skip-browser-warning', 'Accept'],
  }),
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
// SEC-BE-023: format produksi 'combined' (terstruktur, redact-friendly via reverse proxy);
// 'dev' tetap untuk pengalaman developer.
app.use(
  morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev', {
    skip: (req) => req.url === '/health' || req.url === '/api/v1/health',
  }),
);

// Global Rate Limiter
app.use(globalLimiter);

// Health Check
app.get('/health', (req: Request, res: Response) => {
  return successResponse(
    res,
    { status: 'OK', timestamp: new Date().toISOString() },
    'Health check berhasil',
  );
});

// Root
app.get('/', (req: Request, res: Response) => {
  return successResponse(
    res,
    {
      name: 'BISA B2B API',
      version: '1.0.0',
      description: 'High-performance B2B Marketplace Backend',
      docs: '/api/v1/docs',
    },
    'Informasi API berhasil diambil',
  );
});

// Silence common browser probes that are not part of the API surface.
app.get('/favicon.ico', (_req: Request, res: Response) => {
  res.status(204).end();
});

app.get('/.well-known/appspecific/com.chrome.devtools.json', (_req: Request, res: Response) => {
  res.status(204).end();
});

/**
 * ==========================================
 * DATABASE CONNECTION TEST
 * ==========================================
 */
prisma
  .$connect()
  .then(() => logger.info('Database connected successfully'))
  .catch((err) => {
    logger.error('Database connection failed', err);
    process.exit(1);
  });

/**
 * ==========================================
 * API ROUTES (v1)
 * ==========================================
 */
app.use('/api/v1/auth', authLimiter, authRoutes);
app.use('/api/v1/users', usersRoutes);
app.use('/api/v1/categories', categoriesRoutes);
app.use('/api/v1/products', productsRoutes);
app.use('/api/v1/negotiations', negotiationsRoutes);
app.use('/api/v1/suppliers', suppliersRoutes);
app.use('/api/v1/orders', financialLimiter, ordersRoutes);
app.use('/api/v1/payments', paymentsRoutes);
app.use('/api/v1/wallets', financialLimiter, walletsRoutes);
app.use('/api/v1/reviews', reviewsRoutes);
app.use('/api/v1/transactions', financialLimiter, transactionsRoutes);
app.use('/api/v1/ai', aiRoutes);
app.use('/api/v1/gis', publicApiLimiter, gisRoutes);
app.use('/api/v1/iot', iotRoutes);
app.use('/api/v1/forum', forumRoutes);
app.use('/api/v1/chatbot', publicApiLimiter, chatbotRoutes);
app.use('/api/v1/articles', articlesRoutes);
app.use('/api/v1/admin', adminActionLimiter, adminRoutes);
app.use('/api/v1/system', publicApiLimiter, systemRoutes);
app.use('/api/v1/notifications', notificationsRoutes);
app.use('/api/v1/market', marketRoutes);
app.use('/api/v1/organic', organicRoutes);
app.use('/api/v1/cart', cartRoutes);
app.use('/api/v1/wishlist', wishlistRoutes);
app.use('/api/v1/follows', followsRoutes);
app.use('/api/v1/policies', publicApiLimiter, policiesRoutes);
app.use('/api/v1/faqs', publicApiLimiter, faqsRoutes);
app.use('/api/v1/storage', publicApiLimiter, storageRoutes);
// SEC-MOB-004: Pusher private channel auth endpoint untuk mobile.
app.use('/api/v1/pusher', pusherRoutes);
app.use('/api/v1/shipping', publicApiLimiter, shippingRoutes);

// 404
app.use('*', (req: Request, _res: Response, next: NextFunction) => {
  if (
    req.method === 'GET' &&
    req.accepts('html') &&
    req.path.startsWith('/auth/') &&
    CLIENT_HOST &&
    CLIENT_HOST !== `${req.protocol}://${req.get('host')}`
  ) {
    return next(
      new AppError(
        `Halaman ${req.originalUrl} berada di frontend. Buka ${CLIENT_HOST}${req.originalUrl}`,
        404,
      ),
    );
  }

  next(new AppError(`Endpoint ${req.originalUrl} tidak ditemukan`, 404));
});

/**
 * ==========================================
 * GLOBAL ERROR HANDLER
 * ==========================================
 */
app.use((err: unknown, req: Request, res: Response, next: NextFunction) => {
  if (err instanceof multer.MulterError) {
    // SEC-BE-022: pesan konsisten dengan limit aktual di middlewares/upload.ts (10MB).
    const message =
      err.code === 'LIMIT_FILE_SIZE'
        ? 'Ukuran file melebihi batas 10MB.'
        : err.code === 'LIMIT_FILE_COUNT'
          ? 'Jumlah file melebihi batas maksimal.'
          : `Upload gagal: ${err.message}`;
    return next(new AppError(message, 400));
  }
  next(err);
});

app.use((err: AppError, req: Request, res: Response, _next: NextFunction) => {
  const statusCode = err.statusCode || 500;
  const isIgnored404 = statusCode === 404 && IGNORED_404_PATHS.has(req.path);

  if (!isIgnored404) {
    const logPayload = {
      path: req.originalUrl,
      method: req.method,
      ...(statusCode >= 500 && { stack: err.stack }),
    };

    if (statusCode >= 500) {
      logger.error(`${err.name}: ${err.message}`, logPayload);
    } else if (statusCode === 404) {
      logger.warn(`${err.name}: ${err.message}`, logPayload);
    } else {
      logger.info(`${err.name}: ${err.message}`, logPayload);
    }
  }

  res.status(statusCode).json({
    meta: {
      success: false,
      status: statusCode,
      message: err.message || 'Internal Server Error',
    },
    data: null,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
});

export default app;

/**
 * ==========================================
 * SERVER START
 * ==========================================
 */
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    logger.info(`🚀 BISA B2B API is running on http://localhost:${PORT}`);
    logger.info(`⚡ Environment: ${process.env.NODE_ENV || 'development'}`);
    logXenditWebhookDevStartup();

    // BUG-H003: Start negotiation auto-expiry scheduler
    import('#crons/negotiationExpiry').then(({ startNegotiationExpiryCron }) => {
      startNegotiationExpiryCron();
    });
  });
}
