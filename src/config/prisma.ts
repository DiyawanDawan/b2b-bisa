import { PrismaClient } from '#prisma';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import dotenv from 'dotenv';

dotenv.config();

// Connection pool configuration optimized for development/production
const isDev = process.env.NODE_ENV === 'development';

const config = {
  host: process.env.DATABASE_HOST || 'localhost',
  user: process.env.DATABASE_USER || 'root',
  password: process.env.DATABASE_PASSWORD || '',
  database: process.env.DATABASE_NAME || 'bisa_db',
  port: Number(process.env.DATABASE_PORT) || 3306,
  // Connection pool settings
  connectionLimit: isDev ? 20 : 50, // Increase pool size
  idleTimeout: 30000, // Close idle connections after 30s
  acquireTimeout: 10000, // Timeout to get connection from pool
  connectTimeout: 10000, // Connection establishment timeout
  // Enable keep-alive to prevent stale connections
  connectAttributes: {
    program_name: 'bisa_backend',
  },
};

const adapter = new PrismaMariaDb(config);

// Prisma client with optimized logging and connection handling
const prisma = new PrismaClient({
  adapter,
  log: isDev
    ? [
        { emit: 'event', level: 'query' },
        { emit: 'event', level: 'error' },
        { emit: 'event', level: 'warn' },
      ]
    : [{ emit: 'event', level: 'error' }],
});

// Optional: Log queries in development for debugging
if (isDev) {
  prisma.$on('query' as any, (e: any) => {
    console.log(`📊 Query: ${e.query}`);
    console.log(`⏱️  Duration: ${e.duration}ms`);
  });
}

// Graceful shutdown
const gracefulShutdown = async (signal: string) => {
  console.log(`\n${signal} received. Disconnecting Prisma...`);
  await prisma.$disconnect();
  process.exit(0);
};

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

export default prisma;
