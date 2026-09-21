# Deployment

*Developed and managed by jouleWise Technologies (www.joulewise.com).*

## Prerequisites

```bash
npm install -g firebase-tools
firebase login
```

## The project

This repository is bound to **`bessstudio-e55e1`** in `.firebaserc`, which serves at:

- https://bessstudio-e55e1.web.app
- https://bessstudio-e55e1.firebaseapp.com

Both are automatically in Authentication's authorised-domains list, so email and Google sign-in
work on them without further configuration. A custom domain needs adding there as well as in
**Hosting → Add custom domain**.

## 1. Enable the services

In the [Firebase console](https://console.firebase.google.com/project/bessstudio-e55e1):

1. **Build → Authentication → Get started.** Enable **Email/Password**. Enable **Google** if you
   want single sign-on.
2. **Build → Firestore Database → Create database.** Start in production mode; the rules in this
   repository replace the defaults on the first deploy. Pick the region closest to your sales team —
   it cannot be changed later.
3. **Project settings → General → Your apps.** Register a **Web** app if there is not one already,
   and open **SDK setup and configuration → Config**.

## 2. Configure the repository

```bash
cp .env.example .env
```

`.env.example` already carries the project id, auth domain and storage bucket. Fill in the two
values only the console can give you:

| Variable | Where it comes from |
|---|---|
| `NEXT_PUBLIC_FIREBASE_API_KEY` | `apiKey` in the web app config |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | `appId`, of the form `1:123456789:web:abc123` |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | `messagingSenderId`; optional, only used by push |

`.env` is git-ignored. These `VITE_` variables are compiled into the client bundle and are not
secrets — a Firebase web API key identifies the project; the Firestore rules are what protect the
data. Until `NEXT_PUBLIC_FIREBASE_API_KEY` is set the application runs as a local demo workspace and the
topbar reads **Demo** rather than **Cloud**.

## 3. Deploy

```bash
firebase login           # once per machine
npm run deploy           # hosting, rules and indexes
npm run deploy:hosting   # hosting only
npm run deploy:rules     # rules and indexes only
```

### Deploying from CI

`.github/workflows/deploy.yml` builds, typechecks, tests and publishes on every push to `main`.
It needs three repository secrets:

| Secret | Value |
|---|---|
| `FIREBASE_SERVICE_ACCOUNT` | The whole JSON key. Generate it with `firebase init hosting:github`, which creates the service account and adds the secret, or by hand from **Project settings → Service accounts → Generate new private key**. |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Same value as in `.env`. |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | Same value as in `.env`. |

Without `FIREBASE_SERVICE_ACCOUNT` the deploy step fails while the build and test steps still run,
so the workflow is safe to merge before the secret exists.

Hosting serves the Next.js static export from `out/`: directory-style URLs, immutable caching on
the fingerprinted `/_next/static` bundles, `no-cache` on every HTML file so a deploy is picked up on
the next page load, and a catch-all rewrite to the landing page for anything unrecognised.

## 4. First user and first organization

Open https://bessstudio-e55e1.web.app and sign up. The first account to sign up creates an
organization, adds itself as `owner`, writes the default price book and seeds a reference pipeline
you can delete. The rules
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
NEXT_PUBLIC_FIREBASE_EMULATORS=true

npm run emulators        # auth 9099, firestore 8080, UI 4000
npm run dev              # http://127.0.0.1:5178
```

Next's dev server keeps the app on the same port as before. To check what will actually be
deployed, `npm run build && npm run preview` serves the static export itself.

The client connects to the emulators when `NEXT_PUBLIC_FIREBASE_EMULATORS=true` and the Firebase
configuration is present. Emulator data is discarded on exit unless you pass `--export-on-exit`.

## Running without Firebase

Leave `NEXT_PUBLIC_FIREBASE_API_KEY` empty. The application runs as a local demo workspace backed by
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
