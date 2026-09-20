# Deployment

*Developed and managed by jouleWise Technologies (www.joulewise.com).*

## Prerequisites

```bash
npm install -g firebase-tools
firebase login
```

## 1. Create the Firebase project

1. Create a project in the [Firebase console](https://console.firebase.google.com).
2. **Build → Authentication → Get started.** Enable **Email/Password**. Enable **Google** if you
   want single sign-on.
3. **Build → Firestore Database → Create database.** Start in production mode; the rules in this
   repository replace the defaults on first deploy. Pick the region closest to your sales team —
   it cannot be changed later.
4. **Project settings → Your apps → Web.** Register an app and copy the configuration object.

## 2. Configure the repository

```bash
cp .env.example .env
cp .firebaserc.example .firebaserc
```

Fill `.env` with the web app configuration and set your project id in `.firebaserc`. Both files are
git-ignored. `VITE_` variables are compiled into the client bundle and are not secrets — a Firebase
web API key identifies the project; the Firestore rules are what protect the data.

## 3. Deploy

```bash
npm run deploy           # hosting, rules and indexes
npm run deploy:hosting   # hosting only
npm run deploy:rules     # rules and indexes only
```

Hosting serves `dist/` with a single-page rewrite, immutable caching on hashed assets and
`no-cache` on `index.html`, so a deploy is picked up on the next page load.

## 4. First user and first organization

Sign up through the application. The first account to sign up creates an organization, adds itself
as `owner`, writes the default price book and seeds a reference pipeline you can delete. The rules
permit that bootstrap only for the account recorded in the organization's `createdBy` field.

To add a colleague while the invitation flow is still on the roadmap:

1. Have them sign up. Their `users/{uid}` document is created on first sign-in.
2. In the Firestore console, add `organizations/{orgId}/members/{theirUid}` with fields
   `uid`, `email`, `displayName`, `role` and `addedAt`.
3. Add the organization id to their `users/{uid}.orgIds` array.

After that, roles are managed in **Settings → Team & roles**.

## Local emulator workflow

```bash
# .env
VITE_FIREBASE_EMULATORS=true

npm run emulators        # auth 9099, firestore 8080, UI 4000
npm run dev
```

The client connects to the emulators when `VITE_FIREBASE_EMULATORS=true` and the Firebase
configuration is present. Emulator data is discarded on exit unless you pass `--export-on-exit`.

## Running without Firebase

Leave `VITE_FIREBASE_API_KEY` empty. The application runs as a local demo workspace backed by
browser storage, seeded with a reference pipeline. Use this for demonstrations, for offline work,
and for evaluating the studio before provisioning a project. The topbar shows **Demo** rather than
**Cloud** so nobody mistakes which mode they are in.

## Security notes

- Every read and write is scoped to one organization and checked against the caller's membership
  document. The rules deny anything outside `users/{uid}` and `organizations/{orgId}`.
- The activity trail is append-only from the client: entries cannot be edited or deleted, and the
  `actorUid` on a new entry must match the caller.
- A write cannot move a record to a different tenant — `orgId` in the payload must match the path.
- Deleting customers and quotations is restricted to `owner` and `admin`.
- Before going live, review the [Firebase security checklist](https://firebase.google.com/support/guides/security-checklist)
  and enable App Check.
