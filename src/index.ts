import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';

dotenv.config();

import logger from '#config/logger';
import { globalLimiter, authLimiter } from '#middlewares/rateLimiter';
import AppError from '#utils/appError';
import prisma from '#config/prisma';
import { TRUST_PROXY } from '#utils/env.util';

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

const app = express();
const trustProxyAsNumber = Number(TRUST_PROXY);
const trustProxy =
  TRUST_PROXY === 'true'
    ? true
    : TRUST_PROXY === 'false'
      ? false
      : Number.isFinite(trustProxyAsNumber)
        ? trustProxyAsNumber
        : TRUST_PROXY;

app.set('trust proxy', trustProxy);

// Security Headers
app.use(helmet());

// Global Rate Limiter
app.use(globalLimiter);

// Core Middleware
const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:3000')
  .split(',')
  .map((s) => s.trim());
app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  }),
);
app.use(express.json({ limit: '10mb' }));

// HTTP Logger
const morganFormat = process.env.NODE_ENV !== 'production' ? 'dev' : 'combined';
app.use(morgan(morganFormat, { stream: { write: (msg) => logger.info(msg.trim()) } }));

// Welcome Route
app.get('/', (_req: Request, res: Response) => {
  res.status(200).json({
    meta: {
      success: true,
      status: 200,
      message: 'Welcome to BISA API (Backend)',
    },
    data: {
      version: '1.0.0',
      endpoints: '/api/v1',
      health: '/health',
    },
  });
});

// Health Check
app.get('/health', async (_req: Request, res: Response) => {
  try {
    // Test prisma connection
    await prisma.$queryRaw`SELECT 1`;
    res.status(200).json({
      meta: {
        success: true,
        status: 200,
        message: 'BISA API is running',
      },
      data: {
        database: 'Connected (Prisma)',
      },
    });
  } catch (err: unknown) {
    const error = err as Error;
    res.status(500).json({
      meta: {
        success: false,
        status: 500,
        message: 'API is running but Prisma connection failed',
      },
      data: {
        error: error.message,
      },
    });
  }
});

// Routes → /api/v1
app.use('/api/v1/auth', authLimiter, authRoutes);
app.use('/api/v1/users', usersRoutes);
app.use('/api/v1/categories', categoriesRoutes);
app.use('/api/v1/products', productsRoutes);
app.use('/api/v1/negotiations', negotiationsRoutes);
app.use('/api/v1/suppliers', suppliersRoutes);
app.use('/api/v1/orders', ordersRoutes);
app.use('/api/v1/payments', paymentsRoutes);
app.use('/api/v1/wallets', walletsRoutes);
app.use('/api/v1/reviews', reviewsRoutes);
app.use('/api/v1/transactions', transactionsRoutes);
app.use('/api/v1/ai', aiRoutes);
app.use('/api/v1/gis', gisRoutes);
app.use('/api/v1/iot', iotRoutes);
app.use('/api/v1/forum', forumRoutes);
app.use('/api/v1/chatbot', chatbotRoutes);
app.use('/api/v1/articles', articlesRoutes);
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/system', systemRoutes);
app.use('/api/v1/notifications', notificationsRoutes);
app.use('/api/v1/market-trends', marketRoutes);

// 404
app.use('*', (req: Request, _res: Response, next: NextFunction) => {
  next(new AppError(`Endpoint ${req.originalUrl} tidak ditemukan`, 404));
});

// Global Error Handler
app.use((err: AppError, req: Request, res: Response, _next: NextFunction) => {
  err.statusCode = err.statusCode || 500;
  err.status = err.status || 'error';

  logger.error(`[${err.statusCode}] ${err.message} — ${req.method} ${req.originalUrl}`);

  const response = {
    meta: {
      success: false,
      status: err.statusCode,
      message: err.message,
    },
    data: null,
  };

  res.status(err.statusCode).json(response);
});

if (process.env.NODE_ENV !== 'test') {
  const PORT = Number(process.env.PORT) || 3000;
  app.listen(PORT, () => {
    logger.info(` Server berjalan di port ${PORT}  => ${allowedOrigins}`);
  });
}

export default app;

// Handle Process Errors
process.on('unhandledRejection', (reason: unknown, promise: Promise<unknown>) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // In production, consider a graceful shutdown
});

process.on('uncaughtException', (error: Error) => {
  logger.error('Uncaught Exception:', error);
  // Force exit after logging since the process is in an undefined state
  process.exit(1);
});
