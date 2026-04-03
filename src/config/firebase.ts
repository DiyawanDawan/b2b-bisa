import { initializeApp, cert, getApps, type App } from 'firebase-admin/app';
import { getMessaging, type Messaging } from 'firebase-admin/messaging';

const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;

let app: App | undefined;

if (getApps().length === 0) {
  if (!projectId || !clientEmail || !privateKey) {
    console.warn('Firebase details missing in .env. Push notifications will not work.');
  } else {
    try {
      app = initializeApp({
        credential: cert({
          projectId,
          clientEmail,
          privateKey,
        }),
      });
      console.log('Firebase Admin SDK initialized');
    } catch (error) {
      console.error('Firebase Admin init error:', error);
    }
  }
} else {
  [app] = getApps();
}

export const messaging: Messaging | null = app ? getMessaging(app) : null;
export default { messaging };
