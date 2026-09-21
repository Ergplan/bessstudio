/**
 * Web app configuration for the `bessstudio-e55e1` project, which serves at
 * https://bessstudio-e55e1.web.app.
 *
 * These values are compiled into the client bundle and are readable by anyone who loads the site —
 * that is how a Firebase web app is meant to work. They identify the project; they authorise
 * nothing. What protects the data is the Firestore rules in `firestore.rules`, the authorised-domain
 * list in Authentication, and, optionally, an HTTP-referrer restriction on the key in the Google
 * Cloud console — worth adding there so the key only answers for the studio's own domains.
 *
 * Keeping them here rather than in `.env` means a clean checkout deploys with no setup at all.
 * Every value can still be overridden by its environment variable, which is how a second
 * environment — a staging project, a customer's own tenant — is pointed somewhere else.
 */
export const projectConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? 'AIzaSyDlIij93ziQxEoZQIY_8f96j-NIaxXM0mY',
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? 'bessstudio-e55e1.firebaseapp.com',
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? 'bessstudio-e55e1',
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? 'bessstudio-e55e1.firebasestorage.app',
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? '74786215800',
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? '1:74786215800:web:19b5047ffb37c333ee1a8d',
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID ?? 'G-5MWT41ECYQ',
};

/**
 * Google Analytics is off unless it is asked for. It loads a tracking script and sets cookies, so
 * turning it on is a decision about what the site does to its visitors rather than a build detail;
 * `NEXT_PUBLIC_ENABLE_ANALYTICS=true` is that decision, and consent handling belongs with it.
 */
export const analyticsEnabled = process.env.NEXT_PUBLIC_ENABLE_ANALYTICS === 'true';
