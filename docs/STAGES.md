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
| **S2** | Model contracts and evidence | S1 | **`READY FOR ACCEPTANCE`** | review pending | [packet](#s2--model-contracts-and-evidence) |
| **S3** | First charge/discharge lesson | S2 | `BUILDING` | — | — |
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
npm run test        # 387 unit tests
npm run test:rules  # 48 Firestore rules tests, against the emulator
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

## S2 — Model contracts and evidence

**State:** READY FOR ACCEPTANCE — review pending
**Revision:** see the commit carrying this file
**Depends on:** S1 (READY FOR ACCEPTANCE)

### 1. Scope

Delivered: the record contracts every later stage is written against — units, sign conventions,
parameter provenance, input validation, configuration hashing, immutable run snapshots, and tenant
authorization on the new records in the rules.

- **`src/sim/units.ts`** — one canonical unit per quantity (W, Wh, A, Ah, V, s, °C, Ω, VA, var)
  carried everywhere inside the engine, with a compile-time brand so watts cannot be assigned where
  watt-hours are wanted. Values enter through a constructor naming the unit given — `kW(2.5)`,
  `minutes(30)` — and leave through a reader naming the unit wanted. There is no way to spell a
  bare conversion factor in calling code. Crossings that have no answer (power over zero time,
  charge at zero voltage) throw rather than returning infinity, and the cell-to-pack crossings take
  the topology explicitly.
- **`src/sim/signs.ts`** — one application convention (**positive = discharging**), and an adapter
  per library that disagrees. pandapower's storage element is positive for charging and its adapter
  flips; PyBaMM and PySAM agree and their adapters are the identity, present and tested anyway
  because a decision on the record is not the same as an absence.
- **`src/sim/provenance.ts`** — the three §14 badges as data, with the rule that a badge above
  illustrative needs a source and a validated badge needs a review date, and that a single missing
  parameter drops the whole result to illustrative. Applicability ranges travel with the parameters
  and produce the sentence shown when a condition falls outside them.
- **`src/sim/hash.ts`** — a 128-bit change-detection hash over a canonical form with the
  presentational fields removed, so a rename does not invalidate a cached result and a changed
  parameter does.
- **`src/sim/records.ts`** — the ten §13.2 records as strict schemas, each versioned and sealed.
  Units are named in the field rather than in a comment, so a record read back cannot be
  misinterpreted by code that never saw the schema.
- **`src/sim/store.ts`** — the persistence envelope (`orgId`, `ownerUid`, `updatedAt` outside the
  record so a rule can read them), round-trip encode/decode, series rounded to six significant
  figures for storage, and the single place the cache question is asked.
- **`src/sim/presets.ts`** — one illustrative LFP teaching plant, shaped like the catalogue's 5 MWh
  enclosure so a learner recognises it in the studio, with every parameter the catalogue does not
  carry listed and labelled as illustrative.
- **`firestore.rules`** — `simScenarios` and `simRuns`, with `allow update: if false` on runs.

Explicitly deferred: **the Python simulation service and its Google Cloud VM.** See §7 below.

### 2. Environment

As S1. New runtime dependency: none — `zod` was already in use. No Python, no service, no container.

### 3. Checks

| Check | Command | Expected | Observed | Result |
| --- | --- | --- | --- | --- |
| Typecheck | `npx tsc --noEmit` | clean | clean | **PASS** |
| Unit suite | `npm run test` | all pass | **387 passed** (+40) | **PASS** |
| Rules suite | `npm run test:rules` | all pass | **48 passed** (+7) | **PASS** |
| Static export | `npm run build` | 15 routes | 15 routes | **PASS** |
| Round-trip persistence | unit | a scenario and a run survive storage unchanged | `toEqual` on both | **PASS** |
| kW/MW conversion | unit | exact both ways | exact, over five magnitudes | **PASS** |
| minute/hour conversion | unit | exact both ways | exact | **PASS** |
| Invalid units rejected | unit | power over zero time, charge at zero volts | `RangeError` on each | **PASS** |
| Invalid ranges rejected | unit | inverted voltage window, efficiency > 1, zero capacity | rejected, each with the reason | **PASS** |
| Invalid topologies rejected | unit | zero, fractional and negative series/parallel | rejected | **PASS** |
| Hash changes with material inputs | unit | 500 configurations differing by 1 mW | 500 distinct hashes | **PASS** |
| Hash ignores immaterial inputs | unit | rename, reorder, re-id | hash unchanged | **PASS** |
| Immutable run snapshots | rules | no role may edit a run | update and overwrite refused for all six roles | **PASS** |
| Evidence badges present | unit | a badge on every parameter set, and no claim without evidence | enforced in the schema | **PASS** |
| Tenant authorization on the new records | rules | in the rules, not only the UI | 7 rules tests, incl. a foreign `orgId` and another owner's records | **PASS** |
| Tampered record detected | unit | a record edited in the database fails to decode | throws, naming the hash | **PASS** |

### 4. Browser walkthrough

None. S2 adds no user-visible surface: the contracts are consumed by S3, which is the first stage
with a screen. The S0 and S1 browser checks were re-run as regression and are unchanged.

### 5. Defects

| # | Defect | Severity | Status |
| --- | --- | --- | --- |
| D27 | The first converter schema accepted a converter that could not reach its own rating at the bottom of its own DC window — the same defect the R2 audit had just found in the catalogue. | minor — caught in this stage, never shipped | **fixed**; the schema refuses it, with the current it would need |

### 6. Demonstration and rollback

Demo: none yet — `npm run test src/tests/sim.contracts.test.ts` is the demonstration until S3 puts
a screen on it.
Rollback: `git revert` the S2 commit. No migrations: the two new collections are empty until S3
writes to them, and the rules changes only add paths.

### 7. Decision

**READY FOR ACCEPTANCE — review pending.** Next eligible stage: **S3 — first charge/discharge
lesson.**

> **A recorded departure from §13.4, under the §17.1 rule that a genuine requirement change is
> recorded with its rationale and consequences.**
>
> §13.4 proposes a **Python simulation service on a Google Cloud VM**, and §13 proposes PyBaMM,
> PySAM and pandapower behind it. That service has no host: the Terraform environment is not in
> this repository, and §13.4 itself records that until it is pointed at, *"the deployment target is
> named but not specified, and no stage depends on it."*
>
> **The engine is therefore written in TypeScript and runs in the browser**, against exactly the
> contracts above. The rationale:
>
> - The application is a static export. A Python service cannot be reached from it without a host,
>   and there is no host.
> - §15.1 requires the lesson loop to replay **from the same initial state** the moment a learner
>   changes one control. A round trip to a job queue makes that a wait; in the browser it is
>   immediate, and §15's "a simulated day playing back in under a minute" becomes trivially true
>   without touching solver accuracy.
> - Of the six components in §13, four are *already* application models by that table's own
>   description — the EMS policy, the PCS and BMS coordination, and the orchestration between them.
>   Only the battery's electrical/thermal response and the long-horizon dispatch pathway proposed a
>   library, and a first-order Thevenin equivalent circuit is a few dozen lines in any language.
>
> **The consequences, stated rather than glossed:**
>
> - PyBaMM's SPM/SPMe/DFN models, PySAM's annual pathway and pandapower's power flow are **not**
>   available. Everything that needed them stays `GAP`: electrochemical fidelity beyond an
>   equivalent circuit, AC network power flow, and any cross-engine comparison. The sign adapters
>   for all three are written and tested, so the later pathway is a port rather than a rewrite.
> - No asynchronous job, cancellation, progress or worker-failure surface exists, because there is
>   no worker. **S12's checks that name those things cannot pass as written** and will be recorded
>   there as not applicable or as blocked, not quietly dropped.
> - Nothing about this changes what a result may claim. The badges, applicability ranges and
>   validation fixtures are unchanged, and a browser-side engine earns exactly the same
>   `illustrative` badge the teaching parameters allow.
>
> If the Terraform environment is produced later, the contracts, records, hashes, sign adapters and
> fixtures all carry across unchanged, and the Python service becomes a second engine behind the
> same `SimulationRun.engine` field — which exists for that reason.

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
