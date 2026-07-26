import dotenv from 'dotenv';
dotenv.config();

// Central environment variable loader & validator
const required = (key: string): string => {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required environment variable: ${key}`);
  return val;
};

export const optional = (key: string, fallback = ''): string => process.env[key] || fallback;

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
/** Guard NaN — mis. PORT literal `${PORT:-3000}` dari compose escaping. */
const parsedPort = parseInt(optional('PORT', '3000'), 10);
export const PORT =
  Number.isFinite(parsedPort) && parsedPort >= 0 && parsedPort < 65536 ? parsedPort : 3000;
export const CORS_ORIGINS = optional('CORS_ORIGINS', 'http://localhost:3000');
export const CLIENT_HOST = optional('CLIENT_HOST', 'http://localhost:3000');
export const TRUST_PROXY = optional('TRUST_PROXY', '1');

/**
 * Pre-live / staging / QA: default longgarkan rate limit.
 * Set RELAX_RATE_LIMITS=false hanya saat go-live production sungguhan.
 */
export const RELAX_RATE_LIMITS = optional('RELAX_RATE_LIMITS', 'true') === 'true';

// JWT — WAJIB diset di production. Server akan crash jika tidak ada.
export const JWT_SECRET = required('JWT_SECRET');
export const JWT_EXPIRES_IN = optional('JWT_EXPIRES_IN', '7d');
export const JWT_REFRESH_EXPIRES_IN = optional('JWT_REFRESH_EXPIRES_IN', '30d');

// Email — ZeptoMail HTTP API (primary). SMTP is legacy fallback only.
export const ZEPTOMAIL_TOKEN = optional('ZEPTOMAIL_TOKEN');
export const ZEPTOMAIL_URL = optional(
  'ZEPTOMAIL_URL',
  'https://api.zeptomail.com/v1.1/email',
);
export const ZEPTOMAIL_FROM_ADDRESS = optional(
  'ZEPTOMAIL_FROM_ADDRESS',
  'noreply@bisaagri.com',
);

// Legacy SMTP (optional fallback when ZEPTOMAIL_TOKEN is empty)
export const EMAIL_SMTP_HOST = optional('EMAIL_SMTP_HOST', 'smtp.gmail.com');
export const EMAIL_SMTP_PORT = parseInt(optional('EMAIL_SMTP_PORT', '587'), 10);
export const EMAIL_SMTP_SECURE = optional('EMAIL_SMTP_SECURE', 'false') === 'true';
export const EMAIL_SMTP_USER = optional('EMAIL_SMTP_USER');
export const EMAIL_SMTP_PASS = optional('EMAIL_SMTP_PASS');
export const EMAIL_FROM = optional('EMAIL_FROM', 'noreply@bisaagri.com');
export const EMAIL_SENDER_NAME = optional('EMAIL_SENDER_NAME', 'BISA Platform');

// Cloudflare R2
export const R2_ACCOUNT_ID = optional('R2_ACCOUNT_ID');
export const R2_ACCESS_KEY_ID = optional('R2_ACCESS_KEY_ID');
export const R2_SECRET_ACCESS_KEY = optional('R2_SECRET_ACCESS_KEY');
export const R2_BUCKET_NAME = optional('R2_BUCKET_NAME', 'bisa');
export const R2_PUBLIC_URL = optional('R2_PUBLIC_URL');

/** Host publik API (tanpa /api/v1) — dipakai untuk URL gambar via proxy storage. */
export const API_PUBLIC_URL = optional('API_PUBLIC_URL');
export const MEDIA_BASE_URL = optional('MEDIA_BASE_URL');
export const API_URL = optional('API_URL');

/** CDN opsional (Cloudflare custom domain) — dipakai sebagai kandidat origin media. */
export const CDN_URL = optional('CDN_URL');

/**
 * Browser memblokir gambar http:// pada halaman https:// (mixed content).
 * Set `MEDIA_FORCE_HTTPS=false` hanya untuk lingkungan yang memang http-only.
 */
export const MEDIA_FORCE_HTTPS = optional('MEDIA_FORCE_HTTPS', 'true') !== 'false';

const PRIVATE_IPV4 = /^(10\.|127\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|0\.0\.0\.0$)/;

/** Host dev/LAN yang tidak punya sertifikat TLS — biarkan http. */
export const isLocalMediaHost = (hostname: string): boolean => {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host === '::1' || host.endsWith('.local')) return true;
  if (host.endsWith('.localhost') || host.endsWith('.internal')) return true;
  return PRIVATE_IPV4.test(host);
};

const stripMediaOriginSuffix = (raw: string): string =>
  raw
    .trim()
    .replace(/\/$/, '')
    .replace(/\/api\/v1$/i, '');

/** Upgrade http → https untuk host publik agar tidak diblokir mixed content. */
export const toSecureMediaUrl = (raw: string): string => {
  const value = raw.trim();
  if (!MEDIA_FORCE_HTTPS || !/^http:\/\//i.test(value)) return value;

  try {
    if (isLocalMediaHost(new URL(value).hostname)) return value;
  } catch {
    return value;
  }

  return value.replace(/^http:\/\//i, 'https://');
};

const isBrowserSafeOrigin = (origin: string): boolean => {
  if (origin.toLowerCase().startsWith('https://')) return true;
  try {
    return isLocalMediaHost(new URL(origin).hostname);
  } catch {
    return false;
  }
};

/**
 * Origin untuk URL media: MEDIA_BASE_URL > API_PUBLIC_URL > API_URL > CDN_URL > localhost.
 * Kandidat https (atau host lokal) diprioritaskan; sisanya di-upgrade ke https karena
 * browser memblokir subresource http pada halaman https (admin di office.bisaagri.com).
 */
export const getMediaBaseUrl = (): string => {
  const candidates = [MEDIA_BASE_URL, API_PUBLIC_URL, API_URL, CDN_URL, optional('NGROK_URL')]
    .filter((value) => value.trim().length > 0)
    .map(stripMediaOriginSuffix);

  const chosen =
    candidates.find(isBrowserSafeOrigin) ?? candidates[0] ?? `http://localhost:${PORT}`;

  return toSecureMediaUrl(chosen);
};

/** URL publik file R2 via proxy backend */
export const buildStorageAssetUrl = (relativePath: string): string => {
  const normalized = relativePath.replace(/^\//, '');
  return `${getMediaBaseUrl()}/api/v1/storage/assets/${normalized}`;
};

// Platform settings
// AI
export const GOOGLE_GEMINI_API_KEY = optional('GOOGLE_GEMINI_API_KEY');
/** Web OAuth client ID (client_type 3) — fallback verifikasi Google ID token. */
export const GOOGLE_WEB_CLIENT_ID = optional(
  'GOOGLE_WEB_CLIENT_ID',
  '94564351976-o1k5d6sd9pna74e7angarlr8qrvln2pv.apps.googleusercontent.com',
);
export const DEEPSEEK_API_KEY = optional('DEEPSEEK_API_KEY') || optional('DEEPSHEEK_API_KEY');
export const DEEPSEEK_MODEL =
  optional('DEEPSEEK_MODEL') || optional('DEEPSHEEK_MODEL') || 'deepseek-chat';

export const ML_SERVICE_URL = optional('ML_SERVICE_URL');
export const ML_SERVICE_API_KEY = optional('ML_SERVICE_API_KEY');
export const ML_PREDICT_ENABLED = optional('ML_PREDICT_ENABLED', 'true') === 'true';

// Chroma Cloud — RAG knowledge base
export const CHROMA_API_KEY = optional('CHROMA_API_KEY');
export const CHROMA_TENANT_ID =
  optional('CHROMA_TENANT_ID') ||
  optional('CHROMA_TENANT') ||
  '5f0969bb-9cbf-43c2-9fb5-130785014b2e';
export const CHROMA_DATABASE = optional('CHROMA_DATABASE', 'bisa');
export const CHROMA_COLLECTION = optional('CHROMA_COLLECTION', 'bisa_knowledge');
export const RAG_ENABLED = optional('RAG_ENABLED', 'true') === 'true';

/** Soft retention for AuditLog rows (days). 0 disables purge cron. Default 365. */
/** Soft retention for AuditLog rows (days). 0 disables purge cron. Default 365.
 * Set in .env as AUDIT_RETENTION_DAYS. Cron: src/crons/auditRetention.ts (daily). */
export const AUDIT_RETENTION_DAYS = parseInt(optional('AUDIT_RETENTION_DAYS', '365'), 10);

// Xendit — payment vs payout may use separate API keys in Xendit Dashboard
export const XENDIT_PAYMENT_SECRET_KEY = optional('XENDIT_PAYMENT_SECRET_KEY');
export const XENDIT_PAYOUT_SECRET_KEY = optional('XENDIT_PAYOUT_SECRET_KEY');
/** @deprecated use XENDIT_PAYMENT_SECRET_KEY / XENDIT_PAYOUT_SECRET_KEY */
export const XENDIT_SECRET_KEY = optional('XENDIT_SECRET_KEY');

export const resolveXenditPaymentSecretKey = (): string | undefined =>
  XENDIT_PAYMENT_SECRET_KEY || XENDIT_SECRET_KEY;

export const resolveXenditPayoutSecretKey = (): string | undefined =>
  XENDIT_PAYOUT_SECRET_KEY || XENDIT_SECRET_KEY;

// Pusher
export const PUSHER_APP_ID = optional('PUSHER_APP_ID');
export const PUSHER_KEY = optional('PUSHER_KEY');
export const PUSHER_SECRET = optional('PUSHER_SECRET');
export const PUSHER_CLUSTER = optional('PUSHER_CLUSTER');

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

// AES-256 field encryption (payout accounts, providerActions, NPWP)
export const ENCRYPTION_KEY = optional('ENCRYPTION_KEY');
/** Optional secondary key for rotation window (v2 ciphertext prefix). */
export const ENCRYPTION_KEY_V2 = optional('ENCRYPTION_KEY_V2');

const parseKeyMaterial = (raw: string): Buffer => {
  const trimmed = raw.trim();
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    return Buffer.from(trimmed, 'hex');
  }
  const decoded = Buffer.from(trimmed, 'base64');
  if (decoded.length !== 32) {
    throw new Error('ENCRYPTION_KEY must decode to exactly 32 bytes (AES-256).');
  }
  return decoded;
};

const resolveKeyForVersion = (version: string): Buffer => {
  if (version === '2') {
    if (ENCRYPTION_KEY_V2) return parseKeyMaterial(ENCRYPTION_KEY_V2);
    throw new Error('ENCRYPTION_KEY_V2 is required to decrypt v2 payloads.');
  }

  if (ENCRYPTION_KEY) return parseKeyMaterial(ENCRYPTION_KEY);

  throw new Error('ENCRYPTION_KEY must be set (32-byte hex or base64).');
};

export const getEncryptionKeyBuffer = (): Buffer => resolveKeyForVersion('1');

export const getEncryptionKeyBufferForVersion = (version: string): Buffer =>
  resolveKeyForVersion(version);

/** Newest write version: `2` when ENCRYPTION_KEY_V2 is set, otherwise `1`. */
export const getActiveEncryptionVersion = (): string => (ENCRYPTION_KEY_V2 ? '2' : '1');

// Chunked media upload (R2 multipart)
export const MEDIA_CHUNK_SIZE_BYTES = parseInt(optional('MEDIA_CHUNK_SIZE_BYTES', '5242880'), 10);
export const MEDIA_UPLOAD_SESSION_TTL_HOURS = parseInt(
  optional('MEDIA_UPLOAD_SESSION_TTL_HOURS', '24'),
  10,
);
export const MEDIA_MAX_IMAGE_BYTES = parseInt(optional('MEDIA_MAX_IMAGE_BYTES', '52428800'), 10);
export const MEDIA_MAX_PDF_BYTES = parseInt(optional('MEDIA_MAX_PDF_BYTES', '20971520'), 10);
/** When true, chunks go through backend proxy (no R2 CORS required). Default true in development. */
export const MEDIA_UPLOAD_PROXY_MODE =
  optional('MEDIA_UPLOAD_PROXY_MODE', NODE_ENV === 'development' ? 'true' : 'false') === 'true';

// Redis cache (Tier A reference data — off by default until REDIS_URL configured)
export const REDIS_URL = optional('REDIS_URL');
export const REDIS_KEY_PREFIX = optional('REDIS_KEY_PREFIX', 'bisa:v1');
export const REDIS_DEFAULT_TTL_SECONDS = parseInt(
  optional('REDIS_DEFAULT_TTL_SECONDS', '3600'),
  10,
);
export const REDIS_ENABLED = optional('REDIS_ENABLED', 'false') === 'true' && REDIS_URL.length > 0;

// Stock photos untuk seed produk (unduh → R2 → path relatif di DB)
export const PEXELS_API_KEY = optional('PEXELS_API_KEY');
export const PIXABAY_API_KEY = optional('PIXABAY_API_KEY');
