# BESS Studio — the whole site

Every screen, every workflow, every studio feature, as the application actually behaves today.

**This document is for editing.** Each section is numbered and self-contained. Mark up whatever
you want changed — in place, in the margins, however suits you — and hand the section back. The
convention that saves the most time:

| Marker | Means |
| --- | --- |
| `TODO:` | build this, it does not exist |
| `CHANGE:` | exists but is wrong — the note says what it should be |
| `DROP:` | remove it from the product |
| `ASK:` | you want a recommendation before deciding |

Anything unmarked is taken as correct and left alone.

Two conventions used throughout. **Staff** means anyone inside Solarworld — sales, approver,
engineer, admin, owner. **Customer** means the single external role. Where a figure is quoted it
comes from the real engines, not from an illustration.

> Status key used below — `LIVE` built and working · `PARTIAL` built but incomplete · `GAP` not built

---

## Contents

1. [What the product is](#1-what-the-product-is)
2. [Who uses it](#2-who-uses-it)
3. [The four workflows](#3-the-four-workflows)
4. [Screen by screen](#4-screen-by-screen)
5. [The 3D studio](#5-the-3d-studio)
6. [The offer document](#6-the-offer-document)
7. [What the numbers come from](#7-what-the-numbers-come-from)
8. [Design language](#8-design-language)
9. [Running and deploying](#9-running-and-deploying)
10. [Known gaps](#10-known-gaps)

---

## 1. What the product is

A battery storage design studio that takes one question — *what are we building today?* — and
carries it through sizing, engineering visualisation, lifetime economics and a printable
quotation, against one customer record.

It serves two populations in one system. A customer or a salesperson starts a design and gets
indicative pricing immediately; the sales team then picks it up, confirms the details and issues
a formal quotation that an approver has released.

Built and operated by jouleWise Technologies. Each organization on the platform carries its own
white-label branding on everything customer-facing; the reference tenant is Solarworld.

**Deliberate positions, worth challenging if you disagree:**

- The indicative quotation is **not** an offer and says so on its face. It exists to give a
  serious enquiry a number in ninety seconds, not to commit Solarworld to a price.
- **Pricing requires a verified email address.** Designing, sizing and the 3D assembly are open.
- **Preparing a quotation and releasing one are different permissions.** Sales cannot approve its
  own work.

---

## 2. Who uses it

Seven roles. One is external.

| Role | Sees | Can do | Cannot do |
| --- | --- | --- | --- |
| **Customer** | only records they raised | size a plant, price it indicatively, save it, submit it for a formal quotation | see anyone else's records, see the customer list, see the price book, approve anything, issue a price |
| **Sales** | the whole workspace | work the pipeline, prepare a formal quotation, send it for approval, issue an approved one, mark won/lost | approve a quotation — including their own |
| **Approver** | the whole workspace | everything sales can, plus release a quotation or return it with a reason | — |
| **Engineer** | the whole workspace | size and engineer projects | approve or issue prices |
| **Admin** | the whole workspace | manage members, branding, price books | — |
| **Owner** | the whole workspace | everything, including deleting the organization | — |
| **Viewer** | the whole workspace | read | write anything |

`LIVE` — the matrix lives in one place (`src/platform/types.ts`) and both the interface and the
Firestore rules are written from it. Eighteen tests cover the parts that must not drift.

**How a role is assigned today:** `GAP` — by writing the member document by hand. Self-signup makes
you the owner of a new workspace, which is wrong for a customer arriving from the website. The
invite flow is the largest missing piece; see [§10](#10-known-gaps).

---

## 3. The four workflows

### 3.1 The customer, self-serve `LIVE`

1. Lands on the site, sees the wireframe assembly resolve into **BESS Studio**.
2. **Start building** opens *What are we building today?* — power, discharge hours, charge hours,
   application. The card reads back live what those imply: usable energy, unit count, C-rate,
   conversion.
3. **Build it** plays the five-step commissioning sequence (~11 s, skippable) while the plant is
   sized and saved.
4. Lands in the workbench on their new project, with every input still editable.
5. **Create quotation** produces an **indicative estimate**, clearly marked as illustrative.
6. **Submit for a formal quotation** hands it to sales. Status becomes *With our sales team*.
7. Watches it progress — *Being prepared* → *Being approved* → *Formal quotation issued*.

**The gate:** steps 1–4 work without an account. Step 5 onwards needs a signed-in, **email-verified**
account. Until the address is verified, prices show as `Locked` and a banner explains why.

`ASK:` should step 5 require sign-in, or should an anonymous visitor get an indicative number and
be asked to sign in only to *save* it? Today it requires sign-in.

### 3.2 Sales `LIVE`

1. A submitted enquiry appears in **Quotes**.
2. **Pick up** — this is the moment the customer's estimate becomes a formal quotation. The
   customer keeps sight of it; they lose the pen.
3. Confirms details with the customer off-system, adjusts sizing, scope, terms and pricing.
4. **Send for approval**.
5. If returned, the approver's reason is shown at the top of the quotation.
6. Once approved, **Issue to customer**, then **Mark won** or **Mark lost**.

`GAP:` there is no queue view, no assignment, no SLA. Submitted enquiries sit in the main quote
list and have to be spotted.

### 3.3 The approver `LIVE`

1. Opens a quotation in *Pending approval*.
2. **Approve** — records who approved and when — or **Return for changes** with a reason.
3. Cannot be the same action as preparing: a salesperson looking at their own prepared quotation
   is offered no Approve button at all.

`GAP:` no notification. The approver has to go looking.

### 3.4 The engineer `LIVE`

1. Opens a project, works the **Design** and **Losses & degradation** tabs.
2. **Open 3D studio** — the parametric container assembly, carrying the project's configuration.
3. **Capture for offer** puts the assembly view on the quotation's cover page.
4. **Save to project** writes the studio configuration back.

---

## 4. Screen by screen

### 4.1 Landing — `/` `LIVE`

Dark, full-bleed, one accent.

- **Hero.** An isometric container assembles itself out of cells and wiring on a 2D canvas — cells
  settle, busbars run, the coolant loop closes, the shell draws, a scan passes. Then **BESS Studio**
  and *Your BESS design studio is here.* Reduced-motion users get the finished assembly at once.
- **Readout strip.** Four live figures from the reference enclosure.
- **Capabilities** — three cards.
- **Workflow** — four steps: define, engineer, price, issue.
- **Footer** — jouleWise credit and link.
- `/?build=1` opens the question immediately. This is where **New design** goes.

`ASK:` the marketing sections below the hero are thin. Do you want them to sell, or is this
effectively an internal tool with a front door?

### 4.2 The opening question `LIVE`

| Field | Options |
| --- | --- |
| Power | number + MW/kW toggle |
| Hours of discharge | 30 m, 1, 2, 3, 4, 6, 8, 12 h |
| Hours of charge | same |
| What is it for? | eight applications (§7.1) |

Live preview: usable energy, units × enclosure size, discharge/charge C-rate, power conversion.
Blocking warnings appear inline before you can continue.

### 4.3 The build sequence — `/start` `LIVE`

Five steps, ~2.2 s each, one continuous camera move over one scene. Skippable; reduced motion goes
straight through.

| Step | Shows | Headline figure |
| --- | --- | --- |
| 1 Duty cycle | the day drawn across an empty pad, charge blue, discharge green | MW at the point of connection |
| 2 Cells | the camera flies into one pack as its cells fill in | total cells, across N packs |
| 3 Enclosure | racks, busbars, coolant loop and shell close around that same pack | MWh per enclosure |
| 4 Plant | the fleet and its conversion land beside it | enclosures · MWh installed |
| 5 Costing | a commissioning sweep over the finished yard | day-one capital cost |

Every figure is read from the same sizing and finance result being written to the workspace while
it plays. The workbench opens when both have finished. Above 18 enclosures the yard draws 18 and
says so.

### 4.4 Sign-in — `/sign-in` `LIVE`

Split screen: dark brand panel left, form right. Email/password, Google, and **Open the demo
workspace** — which runs entirely on local storage and touches nothing in Firebase.

`GAP:` no password reset, no invite acceptance, no separate customer registration.

### 4.5 Dashboard — `/app` `LIVE`

Staff only; customers get a reduced *Overview*.

- Four tiles: open pipeline, won, fleet under quote (MWh + MW + enclosures), active customers.
- **Sales funnel** — quoted value by customer stage.
- **Quote value by status** — composition bar, won first.
- **Projects by application** — bar chart.
- **Recent quotations** and **Activity** (last 120 entries).

### 4.6 Customers — `/app/customers` `LIVE`

Staff only. List with segment, stage, owner, project and quote counts. Detail holds contacts,
country/city/website, notes, and the customer's projects and quotations.

### 4.7 Projects — `/app/projects` `LIVE`

The core screen. Four tiles across the top — rated power, contracted usable, installed DC,
delivered equipment price — then five tabs.

**Requirements** — application preset and its commercial risks; sizing mode (power × duration, or
usable-energy target); rated power; duration; hours allowed to charge; cycles per day; operating
days per year; depth of discharge; availability; site location; ambient temperature; altitude;
enclosure; power conversion; step-up transformer; grid voltage; power factor; project life;
capacity maintenance strategy.

**Losses & degradation** — usable DC window; charge and discharge DC efficiency; DC cable, PCS,
AC cable and transformer losses; auxiliary consumption; wheeling losses; dispatch availability.
Then the explicit chain: stored DC energy → usable at AC → delivered → charging energy → required
at the generation end. Degradation basis is either the supplied 20-year table or the modelled
curve, with all 21 anchors editable.

**Design** — what the sizing produced: units, racks, packs, cells, strings, DC window, footprint,
mass, conversion count, augmentation schedule.

**Performance & ageing** — usable energy over the project life against installed nameplate;
capacity retention against the supplied curve; annual energy discharged, with augmentation years
marked.

**Economics** — LCOS, NPV, IRR, annual gross benefit; cumulative cash position; annual net cash
flow; full cash-flow table.

Every control is a slider with a typed value beside it. Edits commit on idle or blur, not per
keystroke.

### 4.8 Quotes — `/app/quotes` `LIVE`

Tiles: quotation number and status, customer, total, valid until. Lifecycle buttons come from the
shared state machine, so the interface never offers a step the rules would refuse.

**Pricing** — line items by category, quantity, unit price, total, optional flag; discount, tax,
freight; currency.

**Scope & terms** — included, excluded, assumptions, incoterms, payment terms, delivery weeks,
warranty years, validity.

**Offer content** — the narrative on the offer document.

**Offer document** — the four-page A4 proposal (§6).

**One-page summary** — condensed proposal.

Exports: JSON, standalone offer HTML, print to PDF.

### 4.9 Catalogue — `/app/catalog` `LIVE`

Read-only reference: cells, packs, power conversion systems, transformers. Each row carries its
provenance — `supplied`, `indicative` or `assumed` — so an assumption is never mistaken for a
datasheet figure.

### 4.10 Settings — `/app/settings` `LIVE`

Organization identity and branding, with a live preview of what the customer sees. Landed cost
build-up. Commercial rates. Direct equipment rates. Services, operations and energy. Members and
what each role can do. Deployment notes.

### 4.11 3D Studio — `/app/studio` `LIVE`

See §5. `/studio` redirects here.

---

## 5. The 3D studio

A parametric container assembly in three.js, lazy-loaded so the first page of the site stays light.

**Layout.** Project explorer left (assembly tree down to individual packs, and a visibility tab);
canvas centre; component inspector right; statistics strip below.

**Views.** Isometric, top, front, side, reset. Orbit, zoom, pan.

**Scene controls.** Roof off · cutaway · explode (0–100 %) · electrical path.

**Inspector.** System overview — topology preset, cell equivalent, operating voltage, aggregate
capacity, string current, nominal duration. Calculated DC performance. Dimensions. Cooling and
controls — cold plates, dry-break ports. Protection — combiner, external PCS. Input provenance,
including any discrepancy between sources.

**Validation.** Live warnings against equipment limits — for example *maximum voltage exceeds
equipment limit, 1,518.4 V max / 1,500 V equipment*.

**Exports.** PNG at chosen resolution · JSON configuration in and out · component schedule CSV ·
assembled model GLB · device performance profile.

**Project integration.** **Capture for offer** puts the current view on the quotation cover.
**Save to project** writes the configuration back.

`ASK:` this is the most impressive part of the product and the least connected to the sales
conversation. What should a customer be able to do here, versus an engineer?

---

## 6. The offer document

Four A4 pages, print-to-PDF from the browser, laid out to the issued Solarworld proposal. Measured
to fit exactly — an on-screen badge warns if content overflows a page.

| Page | Content |
| --- | --- |
| 1 | Cover — title, capacity, hero figures, captured assembly view, why Solarworld, proposal details |
| 2 | Technical — specification tables, enclosure diagram, performance |
| 3 | Commercial — price build-up reconciling to the order value, scope, terms |
| 4 | Close — validity, assumptions, acceptance block, qualification |

Carries the organization's branding. jouleWise credit is a tenant setting.

---

## 7. What the numbers come from

### 7.1 Applications

C&I peak shaving · wholesale energy arbitrage · frequency regulation / FCAS · solar shifting /
RE firming · backup / UPS resilience · microgrid / diesel offset · EV charging buffer ·
grid-forming / inertia.

Each sets duration, cycles per day, days per year, depth of discharge, availability, augmentation
strategy and revenue basis, and carries its own commercial risks to raise.

### 7.2 Catalogue

Real product family: SB12100 4S, SB24100 8S, SB51100 16S, SB51314 16S, SB166314 52S, SB332314 104S.
Enclosures from 16 kWh cabinets to the 5.016 MWh 20-ft liquid-cooled container
(`SWESLC1331.2V314Ah`). Conversion from 5 kW hybrid to 5,000 kW central.

### 7.3 Sizing

Fleet size is `max(energy need, power need)` — a C-rate ceiling is a constraint, not a warning.
Cohort-based degradation with augmentation scheduling. Explicit loss chain. Charge-window
feasibility. Cell temperature from ambient and cooling strategy, Arrhenius ageing.

### 7.4 Cost

Landed build-up: FOB → ocean freight → CIF → FX → customs duty → inland clearance → delivered,
plus conversion. The offer's own exchange rate governs the quotation, so the build-up reconciles
to the order value.

### 7.5 Validation

Reproduces the supplied workbooks to within 0.004 % on energy and to the rupee on landed cost
(₹41,022,014.6125 at $68/kWh; ₹5,820,847,958 for the issued 350 MW proposal at $69/kWh). Locked by
tests.

---

## 8. Design language

Near-black surfaces (`#08090B`, panels `#0E1116`), hairline rules, square corners, uppercase
monospace captions, Solarworld green `#93BE49` as the single accent. One language across the
landing, the build sequence, the workbench and the 3D studio.

Printed documents keep their own light tokens — the workbench theme cannot reach into a page going
to a customer.

Charts use the deck hues stepped for the dark surface and validated there for lightness, chroma,
colour-vision separation and contrast. The palette order is what carries that safety, so slots are
consumed in order.

---

## 9. Running and deploying

```bash
npm install
npm run dev        # http://localhost:3400
npm run test       # 83 tests
npm run emulators  # local Firebase with the real rules engine
npm run login && npm run deploy   # → https://bessstudio-e55e1.web.app
```

Firebase Spark (free): Hosting, Auth, Firestore. No Cloud Functions, no Cloud Storage.

Multi-tenant Firestore: everything under `organizations/{orgId}/…`, so authorisation is one
membership check per path.

---

## 10. Known gaps

Ordered by how much they block the workflow above.

1. **No invite or registration flow** `GAP` — self-signup makes you an owner. A customer arriving
   from the website cannot get a customer role without manual intervention. **This blocks 3.1.**
2. **Firestore rules unproven** `PARTIAL` — reviewed and written from the same matrix as the
   client, but never exercised against a real project. Run the emulator before trusting them.
3. **No notifications** `GAP` — submission, approval request and approval are all silent.
4. **No sales queue** `GAP` — submitted enquiries are not separated from the quote list.
5. **No role switcher** `GAP` — roles are changed by editing the member document.
6. **No password reset** `GAP`.
7. **Customer registration is not separated from staff sign-in** `GAP` — one form for both.
8. **Offer document is single-template** `PARTIAL` — no per-tenant layout variation.
9. **Activity trail reads 120 entries** — deliberate, to stay inside the free tier.

---

*Developed and managed by jouleWise Technologies · www.joulewise.com*
