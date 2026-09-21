import { initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, type Auth } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator, type Firestore } from 'firebase/firestore';

export { projectConfig as firebaseConfig } from './firebaseConfig';
import { analyticsEnabled, projectConfig as firebaseConfig } from './firebaseConfig';

/** The studio runs fully offline when no Firebase project is configured, so demos never depend on a network. */
export const firebaseEnabled = !!(firebaseConfig.apiKey && firebaseConfig.projectId);
export const useEmulators = process.env.NEXT_PUBLIC_FIREBASE_EMULATORS === 'true';

let app: FirebaseApp | null = null, auth: Auth | null = null, db: Firestore | null = null;

export function firebase() {
  if (!firebaseEnabled) return null;
  if (!app) {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
    if (useEmulators) {
      connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
      connectFirestoreEmulator(db, '127.0.0.1', 8080);
    }
    if (analyticsEnabled && !useEmulators) void startAnalytics();
  }
  return { app: app!, auth: auth!, db: db! };
}

/**
 * Loaded on demand so the measurement bundle never reaches a visitor who has not opted in, and
 * skipped where the browser does not support it — a private window, a blocked third-party script.
 */
async function startAnalytics() {
  try {
    const { getAnalytics, isSupported } = await import('firebase/analytics');
    if (await isSupported()) getAnalytics(app!);
  } catch { /* analytics is never worth failing the application over */ }
}
