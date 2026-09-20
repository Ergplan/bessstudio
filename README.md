# BESS Design Studio

Sizing, engineering visualisation and quotation for battery energy storage, in one application and
against one customer record.

*Developed and managed by [jouleWise Technologies](https://www.joulewise.com).*

---

## What it does

| Area | Capability |
|---|---|
| **Customers** | Multi-tenant CRM: organizations, customers, contacts, pipeline stages, owners and an append-only activity trail. |
| **Sizing** | Eight application presets, cohort-based degradation, augmentation scheduling, PCS and transformer selection, and design checks for C-rate, DC window, ambient, altitude, throughput and capacity shortfall. |
| **Economics** | Itemised cost stack, year-by-year cash flow, LCOS, NPV, IRR and payback, with charging energy priced separately from gross revenue. |
| **Quotations** | Sell-price build-up, editable line items, scope and terms, discount and tax, versioned revisions, and a printable white-label proposal. |
| **3D studio** | The original parametric container assembly — racks, packs, 4 992 cells, busbars, HV, coolant loops and BMS routing — for the engineering conversation. |
| **Catalogue** | Cells, packs, enclosures, power conversion and transformers, each carrying its provenance. |

## Running it

```bash
npm install
npm run dev          # http://127.0.0.1:5178
```

With no Firebase project configured the studio opens a **local demo workspace** stored in the
browser, seeded with a reference pipeline of five customers, projects and quotations. Everything
works offline, which is what you want in front of a customer on hotel wifi.

```bash
npm test             # 43 tests across the geometry, sizing, finance, quoting and tenancy layers
npm run typecheck
npm run build
```

## Connecting Firebase

1. Create a Firebase project, enable **Authentication** (Email/Password and Google) and
   **Cloud Firestore**.
2. Copy `.env.example` to `.env` and fill in the web app configuration.
3. Copy `.firebaserc.example` to `.firebaserc` and set your project id.
4. `npm run deploy` — builds, publishes hosting, and pushes the Firestore rules and indexes.

See [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) for the emulator workflow and the first-user setup.

## Data model

Every record lives under one organization document, so authorisation is a single membership check
on every path:

```
users/{uid}                                  profile and organization membership
organizations/{orgId}                        tenant, branding, currency, plan
  members/{uid}                              role: owner | admin | engineer | sales | viewer
  customers/{customerId}                     account, contacts, segment, pipeline stage
  projects/{projectId}                       site, sizing input, studio configuration
  quotes/{quoteId}                           versioned quotation with sizing and finance snapshots
  activities/{activityId}                    append-only audit trail
  settings/priceBook                         the organization's commercial rates
```

`src/platform/repo.ts` exposes one repository interface with two adapters — Firestore in
production, browser storage for offline demonstrations and tests — so no page branches on which
backend is in use.

## Engineering basis

The sizing model is transparent by design, and the application says so on every surface:

- **Calendar fade** follows a square-root-of-time law anchored on the catalogue calendar warranty
  point; **cycle fade** is linear in equivalent full cycles anchored on the cycle warranty point.
  The anchors are set so the two can be added without exceeding published warranty tables.
- Both are scaled by an Arrhenius-style thermal factor derived from ambient temperature and the
  enclosure's cooling strategy.
- Augmented capacity is tracked as a separate cohort and ages from its own installation year.
- **Availability is a time metric**: it limits throughput and revenue, not the energy a healthy
  system delivers in one discharge.
- Fleet size is the greater of the energy requirement in the design year and the enclosure count
  needed to keep rated power inside the cell's discharge rating.

Catalogue entries marked `supplied` come from the customer brief. Entries marked `indicative` are
platform defaults for concept sizing and must be replaced with supplier data sheets before any
figure is issued. Concept engineering output; equipment ratings, detailed mechanical design, grid
compliance and usable AC performance require validation before contract.

## Layout

```
src/
  brand/        platform identity and white-label tenant branding
  catalog/      equipment catalogue and price book
  sizing/       application presets, degradation and augmentation engine, financial model
  quoting/      sell-price build-up, numbering, versioning, scope and terms
  platform/     types, permissions, Firebase, repository adapters, session, workspace, seed
  app/          shell, routing, pages, chart and UI primitives, proposal document
  domain/ geometry/ scene/ connectivity/ export/ config/   the 3D studio engine
```

## Where it goes next

[`docs/ROADMAP.md`](docs/ROADMAP.md) sets out the prioritised backlog — tender responses, a
customer portal, live fleet telemetry, grid-code packs, an approval workflow and more — with what
is built today marked against it.
