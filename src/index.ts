import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import multer from 'multer';

dotenv.config();

import logger from '#config/logger';
import { connectRedis, pingRedis } from '#config/redis';
import { REDIS_ENABLED } from '#utils/env.util';
import {
  globalLimiter,
  authLimiter,
  financialLimiter,
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

const isDev = process.env.NODE_ENV !== 'production';

/** Flutter web / Vite dev server pakai port acak — izinkan localhost di development. */
const isLocalDevOrigin = (origin: string) =>
  /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);

const corsOriginDelegate: cors.CorsOptions['origin'] = (origin, callback) => {
  if (!origin) {
    callback(null, true);
    return;
  }
  if (corsOrigins.includes(origin) || (isDev && isLocalDevOrigin(origin))) {
    callback(null, true);
    return;
  }
  // Jangan throw Error — preflight OPTIONS jadi non-2xx tanpa header CORS yang jelas.
  callback(null, false);
};

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
import mediaUploadRoutes from '#routes/mediaUploads';
import notificationsRoutes from '#routes/notifications';
import marketRoutes from '#routes/market';
import organicRoutes from '#routes/organic';
import cartRoutes from '#routes/cart';
import wishlistRoutes from '#routes/wishlist';
import followsRoutes from '#routes/follows';
import partnershipsRoutes from '#routes/partnerships';
import productHarvestRoutes from '#routes/product-harvest';
import bookingsRoutes from '#routes/bookings';
import policiesRoutes from '#routes/policies';
import faqsRoutes from '#routes/faqs';
import storageRoutes from '#routes/storage';
import pusherRoutes from '#routes/pusher';
import shippingRoutes from '#routes/shipping';
import productQuestionsRoutes from '#routes/productQuestions';
import rfqsRoutes from '#routes/rfqs';
import commerceRoutes from '#routes/commerce';
import referralsRoutes from '#routes/referrals';
import integrationsRoutes from '#routes/integrations';
import liveSessionsRoutes from '#routes/live-sessions';
import supportRoutes from '#routes/support';
import bisaExpressRoutes from '#routes/bisa-express';

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
app.use(
  helmet({
    // API dipanggil cross-origin dari Flutter web / admin dev
    crossOriginResourcePolicy: isDev ? { policy: 'cross-origin' } : undefined,
  }),
);
app.use(
  cors({
    origin: corsOriginDelegate,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'ngrok-skip-browser-warning',
      'Accept',
      'X-Requested-With',
      'X-ML-API-Key',
      'X-Device-Token',
    ],
    preflightContinue: false,
    optionsSuccessStatus: 204,
  }),
);

// Explicit OPTIONS handler for all routes
app.options('*', cors());
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
app.get('/health', async (req: Request, res: Response) => {
  const redisOk = REDIS_ENABLED ? await pingRedis() : null;
  return successResponse(
    res,
    {
      status: 'OK',
      timestamp: new Date().toISOString(),
      redis: REDIS_ENABLED ? (redisOk ? 'connected' : 'degraded') : 'disabled',
    },
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
app.use('/api/v1/questions', productQuestionsRoutes);
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
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/system', publicApiLimiter, systemRoutes);
app.use('/api/v1/media/uploads', mediaUploadRoutes);
app.use('/api/v1/notifications', notificationsRoutes);
app.use('/api/v1/market', marketRoutes);
app.use('/api/v1/organic', organicRoutes);
app.use('/api/v1/cart', cartRoutes);
app.use('/api/v1/wishlist', wishlistRoutes);
app.use('/api/v1/follows', followsRoutes);
app.use('/api/v1/partnerships', partnershipsRoutes);
app.use('/api/v1/harvest-lots', productHarvestRoutes);
app.use('/api/v1/bookings', financialLimiter, bookingsRoutes);
app.use('/api/v1/policies', publicApiLimiter, policiesRoutes);
app.use('/api/v1/faqs', publicApiLimiter, faqsRoutes);
app.use('/api/v1/storage', publicApiLimiter, storageRoutes);
// SEC-MOB-004: Pusher private channel auth endpoint untuk mobile.
app.use('/api/v1/pusher', pusherRoutes);
app.use('/api/v1/shipping', publicApiLimiter, shippingRoutes);
app.use('/api/v1/bisa-express', publicApiLimiter, bisaExpressRoutes);
app.use('/api/v1/rfqs', rfqsRoutes);
app.use('/api/v1/commerce', commerceRoutes);
app.use('/api/v1/referrals', referralsRoutes);
app.use('/api/v1/integrations', integrationsRoutes);
app.use('/api/v1/live-sessions', liveSessionsRoutes);
app.use('/api/v1/support', supportRoutes);

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
      ...(err.code && { code: err.code }),
      ...(err.missing?.length && { missing: err.missing }),
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
  void connectRedis();
  app.listen(PORT, () => {
    logger.info(`🚀 BISA B2B API is running on http://localhost:${PORT}`);
    logger.info(`⚡ Environment: ${process.env.NODE_ENV || 'development'}`);
    logXenditWebhookDevStartup();

    // BUG-H003: Start negotiation auto-expiry scheduler
    import('#crons/negotiationExpiry').then(({ startNegotiationExpiryCron }) => {
      startNegotiationExpiryCron();
    });
    import('#crons/mediaUploadExpiry').then(({ startMediaUploadExpiryCron }) => {
      startMediaUploadExpiryCron();
    });
    import('#crons/bookingExpiry').then(({ startBookingExpiryCron }) => {
      startBookingExpiryCron();
    });
  });
}
