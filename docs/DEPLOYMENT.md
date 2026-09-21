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
   want single sign-on. Until this is done every sign-in fails with `auth/configuration-not-found`,
   which the sign-in form reports in plain words rather than as a code.
2. **Build → Firestore Database → Create database.** Start in production mode; the rules in this
   repository replace the defaults on the first deploy. Pick the region closest to your sales team —
   it cannot be changed later.
3. **Project settings → General → Your apps.** Register a **Web** app if there is not one already,
   and open **SDK setup and configuration → Config**.

## 2. Configure the repository

Nothing to do. The whole web app configuration is committed in
`src/platform/firebaseConfig.ts`, so a clean checkout builds and deploys as it stands. Every value
can be overridden by its own `NEXT_PUBLIC_FIREBASE_*` variable, which is how a build is pointed at
a staging project or a customer's own tenant.

Two settings are deliberately not on by default:

- **Google Analytics.** The measurement id is in the configuration but the tracker only loads when
  `NEXT_PUBLIC_ENABLE_ANALYTICS=true`. It sets cookies, so switching it on is a decision about what
  the site does to visitors, and consent handling belongs with that decision.
- **An HTTP-referrer restriction on the API key.** Worth adding under **APIs & Services →
  Credentials** in the Google Cloud console so the key only answers for the studio's own domains.

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
It needs two repository secrets:

| Secret | Value |
|---|---|
| `FIREBASE_SERVICE_ACCOUNT` | The whole JSON key. Generate it with `firebase init hosting:github`, which creates the service account and adds the secret, or by hand from **Project settings → Service accounts → Generate new private key**. |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Same value as in `.env`. |

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

## The Spark plan

Everything the studio uses runs on the free Spark plan. Nothing in the application calls a service
that requires Blaze.

| Service | Used for | Spark allowance |
|---|---|---|
| Hosting | The static export | 10 GB stored, 360 MB/day transferred |
| Authentication | Email/password and Google sign-in | Unlimited for these providers |
| Cloud Firestore | Every customer, project, quotation and activity entry | 1 GiB stored; 50 000 reads, 20 000 writes and 20 000 deletes a day |

Two things the application does deliberately to stay inside those daily quotas:

- **Text fields commit once, not once per keystroke.** A field wired straight to the database
  writes a document per character, which is enough to spend a day's write quota on a single
  paragraph. Editing is held locally and persisted when the typing stops, on blur, and on unmount —
  around thirty characters of a site address cost one write rather than thirty.
- **Collections are read only as deep as the interface shows them.** Reads are metered per document
  returned, so the append-only activity trail is fetched 120 entries deep rather than 500.

A working session is a few hundred reads and a few dozen writes, so the daily allowance covers a
small team comfortably. What would push the project to Blaze:

- **Cloud Functions**, needed for server-side quote numbering, scheduled quotation expiry, emailing
  a proposal or rendering the offer PDF server-side. All of these are roadmap items, not current
  behaviour.
- **Cloud Storage**, needed to keep generated PDFs, customer attachments or uploaded logos. New
  projects need Blaze before a default bucket can be created. The studio keeps logos as URLs and
  the captured assembly view inside the project document, so it never touches Storage.
- **Firebase App Hosting**, which would be needed only to serve the record pages on path URLs
  rather than query strings.

Firestore's daily free quota resets at midnight Pacific time. If a day's allowance runs out the
application keeps rendering and the writes fail; the topbar badge still reads **Cloud**, so watch
the browser console for `resource-exhausted` rather than assuming the app is broken.

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
