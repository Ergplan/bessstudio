import { initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, type Auth } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator, type Firestore } from 'firebase/firestore';

export { projectConfig as firebaseConfig } from './firebaseConfig';
import { projectConfig as firebaseConfig } from './firebaseConfig';

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
  }
  return { app: app!, auth: auth!, db: db! };
}
