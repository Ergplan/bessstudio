import { initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, type Auth } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator, type Firestore } from 'firebase/firestore';

export { projectConfig as firebaseConfig } from './firebaseConfig';
import { analyticsEnabled, projectConfig as firebaseConfig } from './firebaseConfig';

/**
 * Firebase is **off unless it is asked for**.
 *
 * The studio's whole point is that it runs in the browser, and it now does that by default: no
 * account, no network, no sign-in service to wait for. Everything — customers, projects,
 * quotations, simulations — lives in this browser and works on a plane.
 *
 * It used to be the other way round. The configuration below is committed, so `firebaseEnabled`
 * was true everywhere, and every visit opened by asking a sign-in service for permission to
 * exist. On any connection that could not reach Google — an office proxy, a blocked domain, a
 * laptop offline, a project that had moved — the answer never came and the application sat on
 * "Opening your workspace…" indefinitely, with no message and no way forward.
 *
 * Switching it on is one variable, and it is a deliberate act: `NEXT_PUBLIC_FIREBASE_ENABLED=true`
 * turns on accounts, the shared workspace and the multi-tenant rules. Without it none of that code
 * runs at all.
 */
export const firebaseEnabled = process.env.NEXT_PUBLIC_FIREBASE_ENABLED === 'true'
  && !!(firebaseConfig.apiKey && firebaseConfig.projectId);
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
