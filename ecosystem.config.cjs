// ecosystem.config.cjs
/* eslint-env node */

const fs = require('node:fs');
const path = require('node:path');
const dotenv = require('dotenv');

const appRoot = __dirname;
const envFiles = [path.join(appRoot, '.env')];

if (process.env.NODE_ENV === 'production') {
  envFiles.push(path.join(appRoot, '.env.production'));
}

for (const envFile of envFiles) {
  if (fs.existsSync(envFile)) {
    dotenv.config({ path: envFile });
  }
}

// Validate the variables that the backend actually requires at startup.
const requiredEnvVars = ['DATABASE_URL', 'JWT_SECRET', 'ENCRYPTION_KEY'];

if (process.env.NODE_ENV === 'production') {
  const missing = requiredEnvVars.filter((key) => !process.env[key]?.trim());
  if (missing.length > 0) {
    console.error(`Missing required environment variables: ${missing.join(', ')}`);
    process.exit(1);
  }
}

module.exports = {
  apps: [
    {
      name: 'buka-lombok-be',
      script: 'src/index.ts',
      interpreter: 'node',
      interpreter_args: '--import tsx',
      node_args: '--conditions=development',
      watch: true, // restart otomatis saat file berubah
      instances: 1,
      exec_mode: 'cluster',
      ignore_watch: ['node_modules', 'logs'],
      env: {
        NODE_ENV: 'development',
        DATABASE_URL: process.env.DATABASE_URL,
        PORT: process.env.PORT,
        JWT_SECRET: process.env.JWT_SECRET,
        JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN,
        JWT_REFRESH_EXPIRES_IN: process.env.JWT_REFRESH_EXPIRES_IN,
        ENCRYPTION_KEY: process.env.ENCRYPTION_KEY,
        ENCRYPTION_KEY_V2: process.env.ENCRYPTION_KEY_V2,
        ADMIN_EMAIL: process.env.ADMIN_EMAIL,
        ADMIN_PASSWORD: process.env.ADMIN_PASSWORD,
        EMAIL_SMTP_SECURE: process.env.EMAIL_SMTP_SECURE,
        EMAIL_SMTP_USER: process.env.EMAIL_SMTP_USER,
        EMAIL_SMTP_PASS: process.env.EMAIL_SMTP_PASS,
        EMAIL_SMTP_PORT: process.env.EMAIL_SMTP_PORT,
        EMAIL_SMTP_HOST: process.env.EMAIL_SMTP_HOST,
        EMAIL_SMTP_SERVICE_NAME: process.env.EMAIL_SMTP_SERVICE_NAME,
        CLIENT_HOST: process.env.CLIENT_HOST,
        CORS_ORIGINS: process.env.CORS_ORIGINS,
        REDIS_ENABLED: process.env.REDIS_ENABLED,
        REDIS_HOST: process.env.REDIS_HOST,
        REDIS_PORT: process.env.REDIS_PORT,
        REDIS_TTL: process.env.REDIS_TTL,
        R2_ACCOUNT_ID: process.env.R2_ACCOUNT_ID,
        R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID,
        R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY,
        R2_BUCKET_NAME: process.env.R2_BUCKET_NAME,
        CDN_URL: process.env.CDN_URL,
      },
    },
    {
      name: 'buka-lombok-be-prod',
      script: 'dist/src/index.js',
      watch: false, // di production tidak perlu watch
      instances: 'max',
      exec_mode: 'cluster',
      ignore_watch: ['node_modules', 'logs'],
      env_production: {
        NODE_ENV: 'production',
        DATABASE_URL: process.env.DATABASE_URL,
        PORT: process.env.PORT || 3000,
        JWT_SECRET: process.env.JWT_SECRET,
        JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN,
        JWT_REFRESH_EXPIRES_IN: process.env.JWT_REFRESH_EXPIRES_IN,
        ENCRYPTION_KEY: process.env.ENCRYPTION_KEY,
        ENCRYPTION_KEY_V2: process.env.ENCRYPTION_KEY_V2,
        ADMIN_EMAIL: process.env.ADMIN_EMAIL,
        ADMIN_PASSWORD: process.env.ADMIN_PASSWORD,
        EMAIL_SMTP_SECURE: process.env.EMAIL_SMTP_SECURE,
        EMAIL_SMTP_USER: process.env.EMAIL_SMTP_USER,
        EMAIL_SMTP_PASS: process.env.EMAIL_SMTP_PASS,
        EMAIL_SMTP_PORT: process.env.EMAIL_SMTP_PORT,
        EMAIL_SMTP_HOST: process.env.EMAIL_SMTP_HOST,
        EMAIL_SMTP_SERVICE_NAME: process.env.EMAIL_SMTP_SERVICE_NAME,
        CLIENT_HOST: process.env.CLIENT_HOST,
        CORS_ORIGINS: process.env.CORS_ORIGINS,
        REDIS_ENABLED: process.env.REDIS_ENABLED,
        REDIS_HOST: process.env.REDIS_HOST,
        REDIS_PORT: process.env.REDIS_PORT,
        REDIS_TTL: process.env.REDIS_TTL,
        R2_ACCOUNT_ID: process.env.R2_ACCOUNT_ID,
        R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID,
        R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY,
        R2_BUCKET_NAME: process.env.R2_BUCKET_NAME,
        CDN_URL: process.env.CDN_URL,
      },
    },
  ],
};
