# BESS Studio

Sizing, engineering visualisation and quotation for battery energy storage, in one application and
against one customer record.

*Developed and managed by [jouleWise Technologies](https://www.joulewise.com).*

---

## What it does

| Area | Capability |
|---|---|
| **Customers** | Multi-tenant CRM: organizations, customers, contacts, pipeline stages, owners and an append-only activity trail. |
| **Sizing** | Eight application presets, a slider-driven loss chain, an editable year-by-year degradation schedule, cohort augmentation scheduling, PCS and transformer selection, and design checks for C-rate, DC window, ambient, altitude, throughput and capacity shortfall. |
| **Costing** | Landed-import build-up — FOB, ocean freight, CIF, exchange rate, customs duty and inland clearance — or a direct rate card, each under supply-only or turnkey scope. |
| **Economics** | Itemised cost stack, year-by-year cash flow, LCOS, NPV, IRR and payback, with charging energy priced separately from gross revenue and open-access wheeling losses carried through. |
| **Quotations** | Sell-price build-up, editable line items, scope and terms, discount and tax, versioned revisions, and a one-page summary. |
| **Offers** | A four-page A4 technical and commercial proposal generated from the project: cover with a cut-away of the quoted enclosure, plant configuration and specifications, the year-by-year energy schedule, and the landed price build-up with the order value. Prints to PDF or exports as a standalone HTML file. |
| **Landing** | A dark, technical opening page where the enclosure assembles itself from cells and wiring on a 2D canvas, then recedes as the wordmark is revealed. No three.js: the 3D bundle is not fetched until somebody opens the studio. |
| **Opening question** | “What are we building today?” — power in MW or kW, hours of discharge, hours of charge and the application, read back live against the real sizing engine. Answering it creates the project and opens the workbench on it. |
| **3D studio** | The original parametric container assembly — racks, packs, 4 992 cells, busbars, HV, coolant loops and BMS routing — for the engineering conversation. |
| **Catalogue** | Cells, packs, enclosures, power conversion and transformers, each carrying its provenance. |

Built with **Next.js** (App Router) and exported as a static site, so the whole studio runs in the
browser against Firebase with nothing to operate on a server.

## Running it

```bash
npm install
npm run dev          # http://127.0.0.1:3400
npm run build        # static export to out/
npm run preview      # serve the export exactly as Firebase Hosting will
```

With no Firebase project configured the studio opens a **local demo workspace** stored in the
browser, seeded with a reference pipeline of five customers, projects and quotations. Everything
works offline, which is what you want in front of a customer on hotel wifi.

```bash
npm test             # 61 tests across the geometry, sizing, finance, quoting and tenancy layers
npm run typecheck
npm run build
```

## Connecting Firebase

The repository is bound to the Firebase project **`bessstudio-e55e1`**, which serves at
https://bessstudio-e55e1.web.app.

1. In the console, enable **Authentication** (Email/Password, and Google for single sign-on) and
   **Cloud Firestore**.
2. `npm run deploy` — builds, publishes hosting, and pushes the Firestore rules and indexes. The
   web app configuration is committed in `src/platform/firebaseConfig.ts`, so there is nothing to
   set up first.

Pushes to `main` deploy automatically once the `FIREBASE_SERVICE_ACCOUNT` repository secret exists.

Everything the studio uses — Hosting, Authentication and Cloud Firestore — runs on the free **Spark**
plan; nothing calls a service that requires Blaze. Text editing commits once the typing stops rather
than once per keystroke, and collections are read only as deep as the interface shows them, so a
working session stays well inside the daily free quotas. See
[`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md#the-spark-plan) for what would eventually need Blaze.

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

Every number the studio quotes traces back to an input you can see and move.

### Sources

| Source | What it supplies |
|---|---|
| Battery product schedule | The eight-model pack family from SB12100 to the 1 331.2 V / 5 015 kWh container: series counts, voltage windows, continuous and maximum currents, temperature limits, cell vendors and certifications. |
| Supply offer | The landed-cost build-up: FOB $68/kWh, 1.5% ocean freight, ₹97/$, 11% customs duty, 1.5% inland clearance and ₹3 250 000 of conversion per container — ₹8 180/kWh delivered. Also the approved PCS and cell vendors, the BMS options, the five-year warranty and the optional energy management system. |
| Issued 350 MW / 700 MWh proposal | The offer document's structure, the enclosure envelope (10 444 × 2 532.2 × 2 200 mm), ingress and operating ratings, the three-level BMS, the compliance matrix and the commercial terms. Its price build-up at USD 69/kWh reproduces to the rupee: ₹41 577 485 per enclosure, ₹5 820 847 958 for 140. |
| BESS sizing model | The 20-year capacity retention schedule (95% at year 1 falling to 69% at year 20) and the loss chain: 95% usable DC window, 95% DC round trip, 0.25% DC cable, 1.5% conversion, 0.25% AC cable, 1.0% transformer, 0.5 MWh/day auxiliary each way, 10.78% open-access wheeling and a 95% dispatch availability factor. |

The engine reproduces the supplied sizing model to within 0.004% on stored energy, usable AC energy
and charging energy, and the landed build-up to the rupee. Both are locked by tests.

### Model

- **Degradation** is an editable year-by-year schedule by default, seeded from the supplied curve.
  Switching to the derived mode computes calendar fade on a square-root-of-time law and cycle fade
  linearly in equivalent full cycles, both anchored on the cell warranty points and scaled by an
  Arrhenius-style thermal factor from ambient temperature and the cooling strategy.
- **Augmented capacity** is tracked as a separate cohort and ages from its own installation year.
- **Availability is a time metric**: it limits throughput and revenue, not the energy a healthy
  system delivers in one discharge.
- **Fleet size** is the greater of the energy requirement in the design year and the unit count
  needed to keep power inside the system's nameplate rating — on whichever of charge or discharge
  asks for more. A short charge window is often the binding constraint, and the studio says how
  many enclosures it costs and what window would remove them.
- **Charging energy follows delivered energy** back through the discharge and charge paths. A plant
  with capacity to spare cycles only what it has contracted rather than assuming a full cycle;
  where nothing is spare the two are identical, which is what the supplied sheet computes.
- The supplied sheet applies transformer loss on charge but not on discharge. Both directions are
  modelled, with a switch that reproduces the sheet exactly and an explanation of the difference.

### The offer document

`src/quoting/offer.ts` assembles the document's content from the organization, the sizing result and
the price book; `src/app/components/Offer.tsx` lays it out as four A4 pages. Two points are worth
knowing:

- **The build-up on the customer's page is a selling-price build-up.** Contingency and margin ride
  inside the basic rate, exactly as they do in a supplier's own offer, so the per-enclosure figures
  multiply out to the order value printed beside them. A test asserts that reconciliation.
- **The exchange rate quoted in the build-up governs the whole quotation.** Converting the same
  offer back at a different reference rate is what makes a price build-up fail to agree with its own
  order value.

The pages are laid out to fit A4 exactly. If edited text pushes a page past 297 mm the preview says
so on screen, and print clips rather than spilling onto a fifth sheet.

### Known findings

The 104S pack reaches 379.6 V, so four in series peak at 1 518.4 V against a 1 500 V converter
limit. The studio reports this on every affected configuration, with the charge ceiling it implies
(about 3.61 V per cell, giving up roughly 1.2% of nameplate energy). This is the same finding the
original viewer raised, now confirmed against the supplied pack data.

Catalogue entries marked `supplied` come from the product schedule and the supply offer. Entries
marked `indicative` are platform defaults for concept sizing and must be replaced with supplier
data sheets before any figure is issued. Concept engineering output; equipment ratings, detailed
mechanical design, grid compliance and usable AC performance require validation before contract.

## Layout

```
app/                        Next.js App Router
  page.tsx                  landing
  sign-in/  studio/         full-screen routes
  app/                      the workspace, behind the auth gate
src/
  brand/        platform identity and white-label tenant branding
  catalog/      equipment catalogue and price book
  sizing/       application presets, degradation and augmentation engine, financial model
  quoting/      sell-price build-up, numbering, versioning, scope, terms, offer document
  platform/     types, permissions, Firebase, repository adapters, session, workspace, seed
  app/          shell, pages, landing, chart and UI primitives, offer and proposal documents
  domain/ geometry/ scene/ connectivity/ export/ config/   the 3D studio engine
```

### Routing

A static export cannot pre-render a route for an identifier that will not exist until a customer is
created, so record pages carry theirs in the query string — `/app/projects?id=prj_1` rather than
`/app/projects/prj_1`. List and detail share one route and switch on the parameter.

## Where it goes next

[`docs/ROADMAP.md`](docs/ROADMAP.md) sets out the prioritised backlog — tender responses, a
customer portal, live fleet telemetry, grid-code packs, an approval workflow and more — with what
is built today marked against it.
