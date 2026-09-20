# BESS Design Studio

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
npm test             # 56 tests across the geometry, sizing, finance, quoting and tenancy layers
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

Every number the studio quotes traces back to an input you can see and move.

### Sources

| Source | What it supplies |
|---|---|
| Battery product schedule | The eight-model pack family from SB12100 to the 1 331.2 V / 5 015 kWh container: series counts, voltage windows, continuous and maximum currents, temperature limits, cell vendors and certifications. |
| Supply offer | The landed-cost build-up: FOB $68/kWh, 1.5% ocean freight, ₹97/$, 11% customs duty, 1.5% inland clearance and ₹3 250 000 of conversion per container — ₹8 180/kWh delivered. Also the approved PCS and cell vendors, the BMS options, the five-year warranty and the optional energy management system. |
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
  needed to keep rated power inside the system's nameplate rating.
- **Charging energy follows delivered energy** back through the discharge and charge paths. A plant
  with capacity to spare cycles only what it has contracted rather than assuming a full cycle;
  where nothing is spare the two are identical, which is what the supplied sheet computes.
- The supplied sheet applies transformer loss on charge but not on discharge. Both directions are
  modelled, with a switch that reproduces the sheet exactly and an explanation of the difference.

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
