# BESS Studio — stage register

The live record of the build defined in [`docs/SITE.md` §17](./SITE.md#17-how-this-gets-built).
`SITE.md` is the contract; this file is what actually happened.

> **S0 and S1 are complete and ready for acceptance.** S2 onward are `PLANNED` — not built, not
> tested. No simulation fixture (F01–F08) has been run; writing a check into this file is not
> evidence that it passed.
>
> **Two rounds of work have landed since S1 outside the numbered register** — the studio
> experience, and then an audit of the maths, the documents and the interface. Neither opened a
> stage, because neither was one: both were work against the invariant table below, and both
> found invariants this file had already claimed as covered. They are recorded at
> [Work since S1](#work-since-s1) rather than as stages, and the invariant table now says what is
> actually enforcing each one.

**Delivery states:** PLANNED → BUILDING → TESTING → READY FOR ACCEPTANCE → ACCEPTED, and **BLOCKED**
when a prerequisite or a mandatory check fails.

**To start a stage**, use the instruction in [§17.3](./SITE.md#173-the-instruction-to-start-a-stage).

---

## Register

| Stage | Goal | Depends on | State | Accepted | Evidence |
| --- | --- | --- | --- | --- | --- |
| **S0** | Baseline and acceptance contract | — | **`READY FOR ACCEPTANCE`** | review pending | [packet](#s0--baseline-and-acceptance-contract) |
| **S1** | Finish the quoting tool | S0 | **`READY FOR ACCEPTANCE`** | review pending | [packet](#s1--finish-the-quoting-tool) |
| **S2** | Model contracts and evidence | S1 | **`BLOCKED`** — Terraform location unknown | — | — |
| **S3** | First charge/discharge lesson | S2 | `PLANNED` | — | — |
| **S4** | PCS and BMS behaviour | S3 | `PLANNED` | — | — |
| **S5** | jouleWise ergOS EMS | S4 | `PLANNED` | — | — |
| **S6** | Lessons 1–6 | S5 | `PLANNED` | — | — |
| **S7** | Contract-demand UPS sizing | S6 | `PLANNED` | — | — |
| **S8** | Lead-acid versus LFP | S7 | `PLANNED` | — | — |
| **S9** | Indian conditions and lifecycle cost | S8 | `PLANNED` | — | — |
| **S10** | Synchronised 3D | S9 | **`DEFERRED`** by decision — 2D first | — | — |
| **S11** | Project and quotation integration | **S9** *(revised by the S10 deferral)* | `PLANNED` | — | — |
| **S12** | Release readiness | S11 | `PLANNED` | — | — |

## Fixtures

All **NOT RUN**. Definitions in [§18](./SITE.md#18-acceptance-fixtures).

| ID | Covers | Owner stage | State |
| --- | --- | --- | --- |
| F01 | ideal energy and SOC, both directions | S3 | NOT RUN |
| F02 | converter balance, both directions | S3 | NOT RUN |
| F03 | apparent-power headroom, tighter bound wins | S4 | NOT RUN |
| F04 | backup reserve and the outage-mode transition | S5 | NOT RUN |
| F05 | UPS sizing, the 500 kVA worked example | S7 | NOT RUN |
| F06 | repeated outages, reserve carried forward | S8 | NOT RUN |
| F07 | lifecycle cost, discounting and no-crossover | S9 | NOT RUN |
| F08 | cross-tenant access and provenance | S11 | NOT RUN |

## What is already true, and must stay true

The invariants every stage inherits. Breaking one reopens the stage that broke it.

| Invariant | Where it is enforced | Covered by |
| --- | --- | --- |
| Opening experience unchanged | `src/app/landing/`, `src/app/pages/Start.tsx` | S0 browser walkthrough |
| Single-level release never writes the approval fields | `src/quoting/lifecycle.ts`, `firestore.rules` | unit + rules tests |
| Under `two-step`, sales cannot approve its own quotation | `src/quoting/lifecycle.ts`, `firestore.rules` | unit + rules tests |
| The offer fits four A4 pages for every quotation | `src/app/offerStyles.ts` | S0 fit sweep |
| A customer is never notified about another customer's record | `src/platform/notifications.ts` | unit tests |
| The sales queue is exactly the roles holding `quote.prepare` | `src/platform/notifications.ts` | unit tests |
| Every project carries an owner, whichever path created it | `src/platform/projects.ts` | unit tests |
| A quotation moves only through the lifecycle, never by setting a status | `src/app/pages/QuoteDetail.tsx` | browser walkthrough |
| Changing currency converts amounts, never relabels them | `src/quoting/quote.ts` | unit tests — **and was broken outside INR until 22 Sep**; see [Work since S1](#work-since-s1) |
| Every quotation line multiplies out: quantity × rate is the amount printed | `src/catalog/pricing.ts`, `src/quoting/quote.ts` | unit tests |
| A customer's stage advances with the work and never retreats | `src/platform/stages.ts` | unit tests |
| Only the demonstration workspace is seeded | `src/platform/auth.tsx` | code; needs a live signup |
| A customer sees only their own records | `src/platform/workspace.tsx`, `firestore.rules` | rules tests |
| Pricing requires a verified email | `src/platform/types.ts`, `firestore.rules` | rules tests |
| A role cannot be minted — invitation names it, or it is `customer` | `firestore.rules` | rules tests |
| Audit trail append-only, under the writer's own name | `firestore.rules` | rules tests |
| Sizing reproduces the supplied workbooks | `src/sizing/`, `src/catalog/pricing.ts` | 103 unit tests |
| Every catalogue figure agrees with the cell it is built from, and every converter can reach its rating at its own minimum voltage | `src/catalog/products.ts` | unit tests over the whole catalogue |
| Energy is conserved: charge covers discharge and the losses, and auxiliaries are spent once a day rather than once a cycle | `src/sizing/engine.ts` | unit tests |
| A fleet well above its contract accounts for every megawatt-hour of the difference | `src/sizing/engine.ts` | unit tests |
| NPV, IRR and LCOS mean what they say | `src/sizing/finance.ts` | first-principles audit |
| The studio geometry is the sum of its stated allowances | `src/domain/model.ts` | first-principles audit |
| The studio checks against the project's converter, not a placeholder, and divides every per-unit figure by the same day-one fleet | `src/platform/studioBridge.ts` | unit tests |
| A studio lesson reads the live model, never fixed copy | `src/domain/learn.ts`, `src/domain/tour.ts` | unit tests |
| Every design-review finding has an explanation | `src/domain/learn.ts` | unit test reads the codes out of the model |
| Every mechanical assumption has an explanation | `src/domain/learn.ts` | unit test reads the keys out of the schema |
| The guided walk never narrates routing the view is hiding | `src/domain/tour.ts` | unit tests |
| A path trace lights only the path that was asked for | `src/geometry/primitives.ts` | unit tests |
| A component clipped away by the section keeps no label | `src/scene/section.ts` | unit tests |
| Every listed shortcut works, and every binding is listed | `src/scene/shortcuts.ts` | unit tests |
| A full identifier finds exactly one component | `src/domain/find.ts` | unit tests |
| A measurement reads the same whichever point was picked first | `src/scene/measure.ts` | unit tests |
| A caption in the scene never swallows a click meant for the model | `src/scene/Viewer.tsx` | browser walkthrough |
| The site never overlaps two units, and everything placed sits inside the plot | `src/geometry/site.ts` | unit tests |
| The site is laid out at the selected product's dimensions, modelled interior or not | `src/geometry/site.ts`, `src/app/pages/Studio.tsx` | unit tests |
| Augmentation units have a reserved pad on the plot from day one | `src/geometry/site.ts` | unit tests |
| A site is drawn as shells, never as a fleet of full assemblies | `src/geometry/site.ts` | unit test bounds the box count |
| Nothing white-labelled says the demonstration tenant's name | `src/state/store.ts`, `src/scene/Viewer.tsx` | code; browser walkthrough |
| The studio fits the viewport on a 1440×800 laptop | `app/globals.css`, `src/style.css` | browser measurement |
| The same plant costs the same money whichever of the six currencies it is quoted in | `src/catalog/pricing.ts` | unit tests across every currency |
| A total across records never adds two currencies together | `src/catalog/pricing.ts` | unit tests |
| Every figure printed for the customer is one the engine computed, at the depth of discharge and cycle count it was computed at | `src/quoting/offer.ts`, `src/sizing/engine.ts` | unit tests; the performance table must multiply out |
| No input a person can type or paste leaves the model with a negative, infinite or impossible figure | `src/sizing/engine.ts` | adversarial unit tests at both ends of every control |
| Every headline economic figure is rebuildable from the cash-flow table printed beside it | `src/sizing/finance.ts` | unit tests |
| Every design check has a written name, not a tidied-up code | `src/sizing/engine.ts`, `src/domain/model.ts` | unit tests read the codes out of the source |
| Prose that quotes a modelled constant quotes the one the model uses | `src/domain/learn.ts`, `src/domain/tour.ts` | unit tests |
| The exported offer opens and prints correctly from disk, with its pictures | `src/quoting/export.ts` | browser walkthrough from `file://` |
| Every control has an accessible name | `src/app`, `src/components` | browser sweep of ten routes and five studio panels |
| The workspace never scrolls sideways, from 1920 down to 1024 | `app/globals.css` | browser measurement at five sizes |

Baseline commands:

```bash
npm run test        # 347 unit tests
npm run test:rules  # 41 Firestore rules tests, against the emulator
npm run build       # static export, 15 routes
```

---

## S0 — Baseline and acceptance contract

**State:** READY FOR ACCEPTANCE — review pending
**Revision:** see the commit carrying this file
**Depends on:** —

### 1. Scope

Delivered: baseline audit of the application against `SITE.md`; the harness for every later stage;
the four decisions of 22 Sep implemented and covered (single-level approval, GCloud VM target, 2D
first, 3D unchanged).

Deferred: nothing in S0. S10 deferred by decision, recorded above.

### 2. Environment

Node v22.22.2 · Next 16.3.5 · vitest 4.1.11 · @firebase/rules-unit-testing 5.0.2 ·
firebase-tools 15.30.2 · Firestore emulator 1.22.0 on OpenJDK 21 · Chromium via playwright-core.

### 3. Checks

| Check | Command | Expected | Observed | Result |
| --- | --- | --- | --- | --- |
| Typecheck | `npx tsc --noEmit` | clean | clean | **PASS** |
| Unit suite | `npm run test` | all pass | **110 passed** | **PASS** |
| Rules suite | `npm run test:rules` | all pass | **38 passed** | **PASS** |
| Static export | `npm run build` | 14 routes | 14 routes | **PASS** |
| Opening experience unchanged | browser | landing → *BESS Studio* | as expected | **PASS** |
| Build sequence unchanged | browser | five named steps, then the workbench | five steps, lands on the project | **PASS** |
| Single-level release | browser | one account: draft → issued | **Issue quotation** → `sent` | **PASS** |
| Release does not claim approval | record | `issuedBy` set, `approvedBy` null | `{"issuedBy":"Demo Engineer","approvedBy":null}` | **PASS** |
| Offer carries internal approval | browser | block present on page 4 | present | **PASS** |
| Offer fits A4, **every** quote | browser | 0 overflow on all four pages | 0 across all three seeded quotes | **PASS** |

### 4. Browser walkthrough

`scratchpad/s0.mjs` — landing, build sequence, single-level release, offer document.
`scratchpad/fitall.mjs` — page fit across every seeded quotation.
No page errors and no console errors in any run.

### 5. Defects

| # | Defect | Severity | Status |
| --- | --- | --- | --- |
| D1 | The internal approval block pushed offer page 4 over A4 by 77px | major — introduced in this stage | **fixed**; page margin and block layout reworked |
| D2 | Page-4 fit is **data-dependent** — tuning to one quotation left another 11px over | major — would have shipped as an intermittent bug | **fixed**; now measured across every seeded quote, worst case 0 |
| D3 | `issue` first wrote `approvedByUid`, claiming an approval nobody gave, and the rules refused it | major | **fixed**; separate `issuedBy`/`issuedAt` fields |

Baseline defects carried forward, not introduced here: §10 of `SITE.md` — no sales queue, no
notifications, no password reset. **These are S1's scope.** None affects safety, data integrity or
permissions, so none blocks a later stage.

### 6. Demonstration and rollback

Demo: `npm run dev` → landing → **Start building** → build sequence → project → **Create
quotation** → **Issue quotation** → **Offer document** → print.
Rollback: `git revert` the S0 commit. No migrations; `approvalMode` is absent on existing
organizations and reads as `single`.

### 7. Decision

**READY FOR ACCEPTANCE — review pending.** Next eligible stage: **S1 — finish the quoting tool**.

> **S2 is blocked on information, not code:** the GCloud Terraform environment is not in this
> repository and I have no record of it. Repository, path and VM shape needed before S2 is planned.

---

## S1 — Finish the quoting tool

**State:** READY FOR ACCEPTANCE — review pending
**Revision:** see the commit carrying this file
**Depends on:** S0 (READY FOR ACCEPTANCE)

### 1. Scope

Delivered — R01: the sales queue, notifications, password reset.

- **Sales queue** at `/app/queue`, in the staff navigation. Waiting enquiries **oldest first**, so
  the first of the day is not the last seen, with how long each has waited. Work in hand listed
  separately. Two tiles: waiting, in hand.
- **Notifications** — a bell with an unread count, and a panel. Items are **derived** from the
  quotations already being watched rather than stored: no new collection, no extra Firestore reads,
  and nothing that can go stale. Only a single `notificationsSeenAt` timestamp is written, and only
  when the panel is opened.
- **Password reset** on the sign-in form, via Firebase.

Deferred: email notification (needs a mail sender; see §10 of `SITE.md`). Assignment and SLA on the
queue — not in R01.

### 2. Environment

As S0. No new runtime dependencies.

### 3. Checks

| Check | Command | Expected | Observed | Result |
| --- | --- | --- | --- | --- |
| Typecheck | `npx tsc --noEmit` | clean | clean | **PASS** |
| Unit suite | `npm run test` | all pass | **130 passed** (+20) | **PASS** |
| Rules suite | `npm run test:rules` | all pass | **41 passed** (+3) | **PASS** |
| Build | `npm run build` | `/app/queue` present | 15 routes incl. `/app/queue` | **PASS** |
| Customer submits → queue | browser | 1 waiting, tiles 1/0 | 1 waiting, tiles 1/0 | **PASS** |
| Queue shows waiting time | browser | a duration | `0 min` | **PASS** |
| Bell counts, opens, clears | browser | 1 → item listed → 0 after opening | 1 → *New enquiry · JW-Q-2026-0001* → 0 | **PASS** |
| Pick up moves it | browser | tiles 0/1 | tiles 0/1 | **PASS** |
| Customer cannot reach the queue | browser | blocked, no nav link | *"Not your queue"*, 0 nav links | **PASS** |
| Password reset offered | browser | present on sign-in | present | **PASS** |
| Reset does not reveal whether an account exists | unit + code | same reply either way | same reply; `user-not-found` mapped to it | **PASS** |
| **S0 regression** | browser | opening experience, build sequence, single-level release, offer fit | all unchanged, 0 overflow on every quote | **PASS** |

**Negative cases covered by unit tests:** a customer is not told about their own submission; a
customer never sees another customer's record; no customer name leaks into a customer's own
notification; only an approver is told something awaits approval; a draft generates nothing; the
exact last-seen instant reads as seen, not unread; a future-skewed clock never reads negative.

### 4. Browser walkthrough

`scratchpad/s1.mjs` — the full customer → queue → bell → pick-up path, plus the customer being
refused the queue. `scratchpad/s0.mjs` and `scratchpad/fitall.mjs` re-run as regression. No page or
console errors in any run.

**One result worth explaining, because it looks wrong and is not:** on submitting, the customer's
bell showed **1**. That is a *Quotation issued* notification for a different quotation the demo seed
already gives them in `sent`. It is their own record. The unit tests assert separately that a
customer is never notified of their own submission and never sees another customer's record.

### 5. Defects

| # | Defect | Severity | Status |
| --- | --- | --- | --- |
| D4 | The notification test helper dropped its overrides, so twelve tests exercised an empty fixture and failed | minor — in the test, not the code | **fixed** |
| D5 | A test asserted every non-viewer staff role gets a queue; `engineer` deliberately has no `quote.prepare` | minor — wrong premise in the test | **fixed**; the test now asserts the queue set *equals* the permission set, so the two cannot drift |

No defects in shipped behaviour. Baseline defects from S0 unchanged.

### 6. Demonstration and rollback

Demo: sign in → **Queue** in the sidebar. As a customer, submit a design; as sales, watch it arrive,
open the bell, pick it up, and see it move to *In hand*.
Rollback: `git revert` the S1 commit. No migrations; `notificationsSeenAt` is absent on existing
members and reads as "nothing seen".

### 7. Decision

**READY FOR ACCEPTANCE — review pending.** Next eligible stage: **S2 — model contracts and
evidence**, currently **BLOCKED**: the GCloud Terraform environment is not in this repository and I
have no record of it. Repository, path and VM shape needed before S2 can be planned.

---

## Work since S1

Not a stage. Two rounds of work landed against the invariant table rather than against the
register, because neither delivered a numbered goal from `SITE.md` §17. They are recorded here so
the register is not silent about the commits between S1 and whatever opens next.

### R1 — the studio experience

The project's own equipment carried into the studio; white-labelling; a learning layer on every
component; a guided walk; a site view with the fleet, the converters and the reserved augmentation
pads; section, measure, search and a keyboard. Covered by the studio invariants above.

### R2 — audit of the maths, the documents and the interface

An adversarial pass over the sizing engine, the finance model, the customer documents and every
screen. It found defects in four things this file had already listed as covered, which is the part
worth recording: an invariant with a tick beside it is a claim, and three of these claims were
wrong.

| # | Defect | Severity | Status |
| --- | --- | --- | --- |
| D6 | The landed build-up's rupee rate was applied to every currency, so the same plant was quoted at $152,815,801, €152,815,801 and AED 152,815,801 — a factor of about a hundred, on a document a customer signs. Only the rupee quotation was right. | **critical** | **fixed**; the offer rate applies to rupee amounts only, and a test prices the same plant in all six currencies and requires one amount of money |
| D7 | The offer's own price build-up printed its rupee figures into a column headed with the quotation currency, so a ₹44.8 m enclosure appeared as a $44.8 m one and the order value beside it stopped reconciling. | **critical** | **fixed**; the build-up restates through the offer's rate on the way out |
| D8 | Auxiliary consumption is stated per day and was subtracted once per cycle. A plant cycling six times a day paid for its cooling six times over: the reference project bought 31 GWh a year to deliver 16, a round trip of 52% against an 87% chain, and was sized for a load it would never carry. | **critical** | **fixed**; the day's discharge-side auxiliary energy is shared across the cycles that carry it. The reference plant went from 7 enclosures to 5 and from ₹36.12 cr to ₹26.39 cr |
| D9 | Four screens added quotation totals across currencies and labelled the sum with one of them; the project page converted at the reference table while the quotation raised from it used the offer rate — ₹1.39 cr on one screen, ₹1.53 cr on the next. | major | **fixed**; every amount is restated before it is added |
| D10 | Cycle life was quoted at whatever depth the customer operated at rather than the data sheet's, the ageing model treated 8,000 cycles at 90% DoD as 8,000 full ones, and the throughput warranty shrank the more gently the plant was operated. | major | **fixed**; the cell spec carries `cycleLifeDod` and all three read it |
| D11 | `normaliseSizingInput` normalised nothing numeric: a pasted depth of discharge of 5, a negative rated power (negative charge energy in every year row), a zeroed loss chain and a retention table containing a zero all survived into the model. | major | **fixed**; every figure is held inside the range it means something in |
| D12 | The performance table invited the reader to multiply annual cycles by energy per cycle and get the energy supplied; the answer was 8% high on the default case and 50% high on an oversized plant. | major | **fixed**; both columns are the figures the supplied energy is built from, and the derate is stated |
| D13 | An augmentation purchased in year 8 was grossed up for margin but not for tax. | major | **fixed** |
| D14 | The exported offer referenced its logos by path, so a proposal saved and emailed arrived with empty boxes where the branding should be. | major | **fixed**; images travel inline, verified by opening the file from disk with no server |
| D15 | The studio divided the converter's current by the end-of-life fleet and the auxiliaries by the day-one fleet, and reported the battery's own capability as an equipment fault. | major | **fixed**; one fleet count, the one the studio is drawing |
| D16 | The plant configuration table printed the pack's continuous rating in both the charge and discharge column, telling a customer a 0.23 C plant ran at 0.50 C. | minor | **fixed** |
| D17 | "95% at year 1 and 74% at year 15" sat one page from a table showing 77% for year 15 — the unit's schedule against the fleet's, neither labelled. | minor | **fixed** |
| D18 | The 5 kW hybrid converter's DC current limit was below what its own rating needs at the bottom of its voltage window. | minor | **fixed** |
| D19 | A full-depth cycle landed exactly on the depth-of-discharge warning's threshold and said nothing. | minor | **fixed** |
| D20 | The site lesson claimed a single row of seven units would run "over 315 m", five times the truth: it was multiplying the unit count by the plot's own length. | minor | **fixed** |
| D21 | The lessons and the guided walk said cells age twice as fast for every 10 °C; the model doubles every 12. | minor | **fixed**; one exported constant, and a test requires the prose to quote it |
| D22 | Design checks read "Dc Window High" and "Pcs Granularity"; the projects list read "Ev Charging Buffer". | minor | **fixed**; every check and application has a written name |
| D23 | At 1024×768 the workspace scrolled sideways by up to 170px. | minor | **fixed**; no horizontal overflow from 1920 down to 1024 |
| D24 | Sign out, Reset camera and Fit to selection were icons with a tooltip and no accessible name. | minor | **fixed**; a sweep of ten routes and five studio panels now comes back clean |
| D25 | Every page began with a request to fonts.googleapis.com, so first paint was in Helvetica and the product's appearance depended on a third party. | minor | **fixed**; the typefaces are served from the export |
| D26 | The customer picker rendered as a light grey box in a dark page. | minor | **fixed** |

**Checks after R2**

| Check | Command | Expected | Observed | Result |
| --- | --- | --- | --- | --- |
| Typecheck | `npx tsc --noEmit` | clean | clean | **PASS** |
| Unit suite | `npm run test` | all pass | **347 passed** (+71 on the S1 baseline) | **PASS** |
| Rules suite | `npm run test:rules` | all pass | **41 passed** | **PASS** |
| Static export | `npm run build` | 15 routes | 15 routes | **PASS** |
| Buttons and links | browser crawl | no 404, no page error, no blank page | none on any route | **PASS** |
| Accessible names | browser sweep | every control named | every control named | **PASS** |
| Horizontal overflow | browser, 1920→1024 | none | none | **PASS** |
| Offer opened from `file://` | browser | all pictures decode | 7 of 7 | **PASS** |
| Currency | unit | one amount of money in all six | within a tenth of a percent | **PASS** |

**Not addressed, and open for a decision:** whether a white-labelled proposal should carry the
jouleWise name at all. It currently appears in the footer and in the "Supplied through" row. That
is a commercial decision, not a defect.

---

## Acceptance packet template

Copy per stage. A skipped, quarantined, unavailable or not-run mandatory check **is not a pass**.

```markdown
### S_ — <goal>

**State:** BUILDING | TESTING | READY FOR ACCEPTANCE | ACCEPTED | BLOCKED
**Revision:** <commit sha>
**Depends on:** S_ (state: ___)

**1. Scope**
- Delivered: <requirement IDs>
- Explicitly deferred: <what, and why>

**2. Environment**
- Engine and library versions, fixtures, parameter sources, solver settings, seeds.

**3. Checks**
| Check | Command | Expected | Observed | Result |
| --- | --- | --- | --- | --- |

**4. Browser walkthrough** — user-visible changes, including failure states and an accessible route.

**5. Defects** — found, fixed, remaining, affected regression results.

**6. Demonstration and rollback** — steps to demo; how to roll back; whether migrations reverse.

**7. Decision** — ACCEPTED by <actor> on <date, revision>, or
   READY FOR ACCEPTANCE — review pending. Next eligible stage: S_.
```

---

*Developed and managed by jouleWise Technologies · www.joulewise.com*
