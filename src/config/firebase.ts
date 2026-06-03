import admin from 'firebase-admin';
import { type ServiceAccount } from 'firebase-admin/app';
import { type Messaging } from 'firebase-admin/messaging';
import fs from 'fs';
import path from 'path';
import logger from '#config/logger';

let serviceAccount: ServiceAccount | undefined;
let _messaging: Messaging | null = null;

/**
 * Firebase Admin credential resolver
 *
 * Priority order:
 *   1. FIREBASE_SERVICE_ACCOUNT — JSON string langsung di env (RECOMMENDED untuk semua env)
 *   2. FIREBASE_SERVICE_ACCOUNT_PATH — path file .json (dev convenience)
 *
 * SEC-BE-001: file JSON hardcoded sudah dihapus dari repo. Jangan commit JSON
 *             service account ke source tree (sudah di .gitignore).
 */
const serviceAccountPathEnv = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
const serviceAccountPath = serviceAccountPathEnv
  ? path.isAbsolute(serviceAccountPathEnv)
    ? serviceAccountPathEnv
    : path.join(process.cwd(), serviceAccountPathEnv)
  : undefined;

try {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    logger.info('Firebase Admin: Loading credentials from ENV (FIREBASE_SERVICE_ACCOUNT)');
  } else if (serviceAccountPath && fs.existsSync(serviceAccountPath)) {
    serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
    logger.info(
      `Firebase Admin: Loading credentials from FILE ${path.basename(serviceAccountPath)} (dev only)`,
    );
  }

  if (serviceAccount) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    _messaging = admin.messaging();
    logger.info('Firebase Admin SDK initialized successfully');
  } else {
    const msg =
      'Firebase Service Account not found. Set FIREBASE_SERVICE_ACCOUNT env (JSON string) or FIREBASE_SERVICE_ACCOUNT_PATH. FCM features disabled.';
    if (process.env.NODE_ENV === 'production') {
      // Production wajib punya kredensial; tetapi jangan crash agar API tetap up.
      logger.error(msg);
    } else {
      logger.warn(msg);
    }
  }
} catch (error: unknown) {
  const msg = error instanceof Error ? error.message : String(error);
  logger.error('Error initializing Firebase Admin SDK:', msg);
}

export const messaging = _messaging;
export default admin;
