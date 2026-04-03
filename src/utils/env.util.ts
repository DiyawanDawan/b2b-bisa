import dotenv from 'dotenv';
dotenv.config();

// Central environment variable loader & validator
const required = (key: string): string => {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required environment variable: ${key}`);
  return val;
};

const optional = (key: string, fallback = ''): string => process.env[key] || fallback;

const buildDatabaseUrl = (): string => {
  const explicitUrl = process.env.DATABASE_URL;
  if (explicitUrl) return explicitUrl;

  const host = optional('DATABASE_HOST', 'localhost');
  const user = optional('DATABASE_USER', 'root');
  const password = optional('DATABASE_PASSWORD');
  const port = optional('DATABASE_PORT', '3306');
  const database = optional('DATABASE_NAME', 'bisa_db');
  const encodedPassword = encodeURIComponent(password);

  return `mysql://${user}:${encodedPassword}@${host}:${port}/${database}`;
};

// Database
export const DATABASE_URL = buildDatabaseUrl();

// Server
export const NODE_ENV = optional('NODE_ENV', 'development');
export const PORT = parseInt(optional('PORT', '3000'), 10);
export const CORS_ORIGINS = optional('CORS_ORIGINS', 'http://localhost:3000');
export const CLIENT_HOST = optional('CLIENT_HOST', 'http://localhost:3000');
export const TRUST_PROXY = optional('TRUST_PROXY', '1');

// JWT — WAJIB diset di production. Server akan crash jika tidak ada.
export const JWT_SECRET = required('JWT_SECRET');
export const JWT_EXPIRES_IN = optional('JWT_EXPIRES_IN', '7d');
export const JWT_REFRESH_EXPIRES_IN = optional('JWT_REFRESH_EXPIRES_IN', '30d');

// Email SMTP
export const EMAIL_SMTP_HOST = optional('SMTP_HOST', 'smtp.gmail.com');
export const EMAIL_SMTP_PORT = parseInt(optional('SMTP_PORT', '587'), 10);
export const EMAIL_SMTP_SECURE = optional('SMTP_SECURE', 'false') === 'true';
export const EMAIL_SMTP_USER = optional('SMTP_USER');
export const EMAIL_SMTP_PASS = optional('SMTP_PASS');
export const EMAIL_FROM = optional('EMAIL_FROM', 'noreply@bisa.id');
export const EMAIL_SENDER_NAME = optional('EMAIL_SENDER_NAME', 'BISA Platform');

// ZeptoMail (optional)
export const ZEPTOMAIL_API_TOKEN = optional('ZEPTOMAIL_API_TOKEN');
export const ZEPTOMAIL_API_HOST = optional('ZEPTOMAIL_API_HOST', 'https://api.zeptomail.in');

// AWS S3 / Cloudflare R2
export const AWS_ACCESS_KEY_ID = optional('AWS_ACCESS_KEY_ID');
export const AWS_SECRET_ACCESS_KEY = optional('AWS_SECRET_ACCESS_KEY');
export const AWS_REGION = optional('AWS_REGION', 'auto');
export const AWS_S3_BUCKET = optional('AWS_S3_BUCKET', 'bisa-uploads');
export const R2_ENDPOINT = optional('R2_ENDPOINT');
export const R2_PUBLIC_URL = optional('R2_PUBLIC_URL');

// Platform settings
// AI
export const GOOGLE_GEMINI_API_KEY = optional('GOOGLE_GEMINI_API_KEY');

// Xendit
export const XENDIT_API_KEY = optional('XENDIT_API_KEY');
export const XENDIT_WEBHOOK_TOKEN = optional('XENDIT_WEBHOOK_TOKEN');

// TODO: Business & Operational Limits (Eliminating Hardcode)
export const SUBSCRIPTION_DURATION_DAYS = parseInt(
  optional('SUBSCRIPTION_DURATION_DAYS', '30'),
  10,
);
export const FORUM_MODERATION_THRESHOLD = parseInt(optional('FORUM_MODERATION_THRESHOLD', '5'), 10);
export const IOT_ONLINE_TIMEOUT_MS = parseInt(optional('IOT_ONLINE_TIMEOUT_MS', '300000'), 10); // 5 min
export const IOT_COOLDOWN_MS = parseInt(optional('IOT_COOLDOWN_MS', '900000'), 10); // 15 min

// TODO: Market Forecasting
export const FORECAST_ALPHA = parseFloat(optional('FORECAST_ALPHA', '0.4'));
export const FORECAST_STEPS = parseInt(optional('FORECAST_STEPS', '3'), 10);
