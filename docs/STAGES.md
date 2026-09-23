# BESS Studio — stage register

The live record of the build defined in [`docs/SITE.md` §17](./SITE.md#17-how-this-gets-built).
`SITE.md` is the contract; this file is what actually happened.

> **Every stage is built and ready for acceptance.** S10 is deferred by decision; S12's release
> checks have been run but the release itself has not been performed — there are no deployment
> credentials in this environment, and deploying is a human act on an exact revision. Every fixture
> F01 to F08 has been run and passed.
>
> **Four of S12's checks cannot apply** to a browser engine, and are recorded as not applicable with
> what stands in their place rather than passed or dropped. They are in the S12 packet. Writing a check into this file is not evidence that it passed.
>
> **One check cannot be passed by testing.** §17.2 asks S6 for an observed beginner walkthrough or
> an explicit note that usability validation is pending. Nobody has watched a beginner use this,
> so it is **pending**, and S6 is ready for acceptance on everything else.
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
| **S3** | First charge/discharge lesson | S2 | **`READY FOR ACCEPTANCE`** | review pending | [packet](#s3--first-chargedischarge-lesson) |
| **S4** | PCS and BMS behaviour | S3 | **`READY FOR ACCEPTANCE`** | review pending | [packet](#s4--pcs-and-bms-behaviour) |
| **S5** | jouleWise ergOS EMS | S4 | **`READY FOR ACCEPTANCE`** | review pending | [packet](#s5--joulewise-ergos-ems) |
| **S6** | Lessons 1–6 | S5 | **`READY FOR ACCEPTANCE`** *(usability validation pending)* | review pending | [packet](#s6--lessons-1-to-6) |
| **S7** | Contract-demand UPS sizing | S6 | **`READY FOR ACCEPTANCE`** | review pending | [packet](#s7--contract-demand-ups-sizing) |
| **S8** | Lead-acid versus LFP | S7 | **`READY FOR ACCEPTANCE`** | review pending | [packet](#s8--lead-acid-against-lithium) |
| **S9** | Indian conditions and lifecycle cost | S8 | **`READY FOR ACCEPTANCE`** | review pending | [packet](#s9--indian-conditions-and-lifecycle-cost) |
| **S10** | Synchronised 3D | S9 | **`DEFERRED`** by decision — 2D first | — | — |
| **S11** | Project and quotation integration | **S9** *(revised by the S10 deferral)* | **`READY FOR ACCEPTANCE`** | review pending | [packet](#s11--project-and-quotation-integration) |
| **S12** | Release readiness | S11 | **`READY FOR ACCEPTANCE`** *(release not performed)* | review pending | [packet](#s12--release-readiness) |

## Fixtures

Definitions in [§18](./SITE.md#18-acceptance-fixtures). F01 to F08 have run and passed; the rest belong to stages that have not started.

| ID | Covers | Owner stage | State |
| --- | --- | --- | --- |
| F01 | ideal energy and SOC, both directions | S3 | **PASS** — `src/tests/sim.fixtures.test.ts` |
| F02 | converter balance, both directions | S3 | **PASS** — `src/tests/sim.fixtures.test.ts` |
| F03 | apparent-power headroom, tighter bound wins | S4 | **PASS** — `src/tests/sim.fixtures.test.ts` |
| F04 | backup reserve and the outage-mode transition | S5 | **PASS** — `src/tests/sim.s5.test.ts` |
| F05 | UPS sizing, the 500 kVA worked example | S7 | **PASS** — `src/tests/sim.ups.test.ts` |
| F06 | repeated outages, reserve carried forward | S8 | **PASS** — `src/tests/sim.chemistry.test.ts` |
| F07 | lifecycle cost, discounting and no-crossover | S9 | **PASS** — `src/tests/sim.india.test.ts` |
| F08 | cross-tenant access and provenance | S11 | **PASS** — `src/tests/rules.test.ts`, `src/tests/quoting.appendix.test.ts` |

## Where the arithmetic runs

Every number in this product is computed by code in this repository, under test. No language model
sizes a plant, prices one, or computes a figure that reaches a screen or a document: the engine is
TypeScript, it is deterministic, its inputs are hashed, and the suite is the record of what it is
expected to say. A model's job here is to help somebody state their requirement and to explain a
result once the engine has produced it — never to produce one.

The methods are the ordinary ones and are meant to be checkable against the public reference work
rather than taken on trust: energy sizing from the contracted duty through depth of discharge, the
usable state-of-charge window, the conversion path and the design-year retention; power sizing
against pack continuous current; degradation as a cycle-and-calendar model with an Arrhenius
temperature term; a discounted lifecycle ledger. Where a figure comes from a supplied document it
says so, and where it is a platform assumption it says that instead. A result that cannot be
reproduced from the inputs printed beside it is a defect, not a rounding difference.

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
npm run test        # 427 unit tests
npm run test:rules  # 48 Firestore rules tests, against the emulator
npm run build       # static export, 16 routes
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

## S3 — First charge/discharge lesson

**State:** READY FOR ACCEPTANCE — review pending
**Revision:** see the commit carrying this file
**Depends on:** S2 (READY FOR ACCEPTANCE)

### 1. Scope

Delivered: the engine, the first lesson, and F01 and F02.

- **`src/sim/battery.ts`** — the cell as a first-order Thevenin equivalent circuit: one
  open-circuit voltage curve, one series resistance with a temperature coefficient, coulomb
  counting for the state, and a lumped thermal mass. Every function takes one cell and the caller
  multiplies by the topology.
- **`src/sim/limits.ts`** — every ceiling, expressed as a limit on one cell's current so they can
  be compared at all: what the battery management system permits, the cell voltage cutoffs, the
  converter's DC window, its DC current limit, its rating after temperature derating, the
  connection limit, the hard state-of-charge floor, and the reserve the policy keeps in hand. The
  lowest wins and its name is reported.
- **`src/sim/ems.ts`** — the manual policy, which relays the learner's request and refuses to
  spend the reserve, with an explanation built from the values it decided on.
- **`src/sim/engine.ts`** — the orchestration, the energy accounting at every boundary it names,
  and a round-trip efficiency that is reported only from a complete cycle.
- **`src/sim/lessons.ts`**, **`src/app/pages/Lessons.tsx`**, **`/app/lessons`** — the catalogue of
  seven cards with one built and six saying which stage brings them, and the player: one-sentence
  goal, Play, the four-box stack with the limiting subsystem lit, four headline figures, two
  charts, three controls, the ergOS explanation, "what changed and why", and Reset. Reached from a
  project, per §3.0.

Explicitly deferred: the PCS and BMS state machines, hysteresis, latching and the event ordering
they need — those are S4, and the event log records limit engagements today without claiming to be
a state machine. Reactive power is untouched: §12.3's capability circle arrives with F03 in S4.

### 2. Environment

As S2. TypeScript engine in the browser, per the departure recorded in the S2 packet. No new
runtime dependency.

### 3. Checks

| Check | Command | Expected | Observed | Result |
| --- | --- | --- | --- | --- |
| Typecheck | `npx tsc --noEmit` | clean | clean | **PASS** |
| Unit suite | `npm run test` | all pass | **427 passed** (+40) | **PASS** |
| Rules suite | `npm run test:rules` | all pass | 48 passed | **PASS** |
| Static export | `npm run build` | `/app/lessons` present | 16 routes incl. `/app/lessons` | **PASS** |
| **F01** ideal energy and SOC | unit | 20 kW for 30 min from 50% delivers 10 kWh and ends at 40% | exact to 1e-9, both directions | **PASS** |
| **F02** converter balance | unit | 100 kW DC at 95% delivers 95 kW AC; charge uses the charge efficiency | 95.000 kW; 100 kW drawn puts 90 kW in at 90% | **PASS** |
| Charge/discharge signs | unit | positive discharges, negative charges, current follows | holds in both directions | **PASS** |
| Loss and boundary accounting | unit | each loss counted exactly once | DC − converter = AC; AC − auxiliaries = connection | **PASS** |
| Voltage cutoffs | unit | no cell taken outside its window | holds at both ends over a 2 h run | **PASS** |
| Current cutoffs | unit | BMS limit and converter DC limit both respected | holds at four request levels | **PASS** |
| SOC cutoffs | unit | never below empty or above full | holds at 300 s steps | **PASS** |
| Reproducibility | unit | same inputs, same answer | series, decisions and hash identical | **PASS** |
| Timestep convergence | unit | refining the step does not move the answer | 600 s to 15 s agree within 0.1 percentage point of charge, monotonically | **PASS** |
| Failed solver displays honestly | unit | a failure is a failure | status `failed`, reason given, `finishedAt` null | **PASS** |
| Invalid configuration displays honestly | unit | refused before anything is computed | refused, naming the field and the rule | **PASS** |
| Browser: open from project | browser | Lessons reachable from a project | project → Lessons → catalogue, 1 of 7 available | **PASS** |
| Browser: play | browser | the run plays | 0 → 25 min in 2.5 s, charge level falls 80% → 71.8% | **PASS** |
| Browser: change power | browser | the result changes | 2,000 kWh → 3,469.1 kWh at 2.5 MW | **PASS** |
| Browser: replay from the same state | browser | both runs start alike | both from 80%, stated on the page | **PASS** |
| Browser: reset | browser | back to the default | 2,000 kWh again, controls restored | **PASS** |
| Beginner limits | unit | ≤3 controls, ≤4 metrics, ≤2 charts | 3, 4, 2 | **PASS** |
| No page or console errors | browser | none | none | **PASS** |

### 4. Browser walkthrough

`scratchpad/lesson.mjs` — project → Lessons → the card → play → change the power → replay → reset,
reading the figures off the page at each step. The failure state is exercised in the unit suite
rather than the browser, because reaching it needs a configuration the controls cannot produce —
which is itself the point of bounding them.

### 5. Defects

| # | Defect | Severity | Status |
| --- | --- | --- | --- |
| D28 | The timestep convergence check failed by 3.6 percentage points of charge. The reserve was evaluated once per reporting step, so a plant sampled every ten minutes discharged past it for up to ten minutes before the policy noticed — exactly the failure §13.1 warns about. | **major** — found by the mandatory check, never shipped | **fixed**; the reserve is a limit in the chain, evaluated at every integration piece and owned by the EMS. The integration interval is now bounded separately from the reporting interval. |
| D29 | A record sealed before it was parsed was sealed over contents the parse was about to change, so its hash stopped matching the moment it was read back. The solver's new `maxSubStepSeconds` default exposed it. | major | **fixed**; parse, seal, parse again, in one place every record goes through. |
| D30 | The invalid-configuration check refused its own fixture: the fixture cell carried a thermal resistance ten times what the contract allows. | minor | **fixed**; and the engine now validates every input before computing anything. |
| D31 | The first sample of a series was a step late, so a chart of a run beginning at 80% began at 79.7%. | minor | **fixed**; the series convention is written into the schema — sample *i* is the state at the start of interval *i* and the power across it — and a closing sample carries the state the run ended in. |

### 6. Demonstration and rollback

Demo: sign in → **Projects** → any project → **Lessons** → *Charge and discharge* → **Play**, then
move the power dial and press Play again.
Rollback: `git revert` the S3 commits. No migrations; nothing is written to storage yet — a run is
computed on demand and held in the page. Persisting runs to `simRuns` is S11's, when a result
becomes part of a quotation.

### 7. Decision

**READY FOR ACCEPTANCE — review pending.** Next eligible stage: **S4 — PCS and BMS behaviour.**

---

## S4 — PCS and BMS behaviour

**State:** READY FOR ACCEPTANCE — review pending
**Revision:** `a9e1731`
**Depends on:** S3 (READY FOR ACCEPTANCE)

### 1. Scope

Delivered: the two subsystems that are allowed to refuse, as state machines, and F03.

- **`src/sim/pcs.ts`** — the converter. One active-power ceiling assembled from the four things
  that can set it: the apparent-power rating with reactive power taking its share first (§12.3's
  capability circle), the temperature derating, the DC current limit, and the DC voltage window.
  Eight states — standby, precharge, ready, charging, discharging, derated, faulted, recovery —
  each with the subsystem that owns it and a sentence of what it means, because a state nobody can
  read is not an explanation.
- **`src/sim/bms.ts`** — nine protections, each carrying a derating band, a trip threshold, a delay
  to hold past it, a hysteresis reset point, whether it latches, which direction of current it
  restrains, and where its numbers came from. Plus cell balancing and the drift between the state
  of charge the management system believes and the one that is true. Events are ordered by severity
  and then by code, so two faults in one step are reported in the same order every time.
- **`src/sim/engine.ts`** — both wired in. Each sub-step takes the tightest of the limit chain, the
  converter ceiling and the management system's veto, and the constraint that bound is now taken
  across every sub-step rather than the first one.
- **`src/app/pages/Lessons.tsx`** — both states with their meanings, and the event log up to the
  cursor: minute, owner, what engaged, and what would clear it if it latched.

Deferred by design: the supervisory policy itself is still the manual one. Peak shaving, solar
self-consumption, backup reserve and price scheduling are S5 and S6, and `policyAvailability` says
so rather than dispatching something unbuilt.

### 2. Environment

As S3. TypeScript engine in the browser, per the departure recorded in the S2 packet. No new
runtime dependency.

### 3. Checks

| Check | Command | Expected | Observed | Result |
| --- | --- | --- | --- | --- |
| Typecheck | `npx tsc --noEmit` | clean | clean | **PASS** |
| Unit suite | `npm run test` | all pass | **483 passed** (+56) | **PASS** |
| Rules suite | `npm run test:rules` | all pass | 48 passed | **PASS** |
| Static export | `npm run build` | 17 routes | 17 routes | **PASS** |
| **F03** headroom, tighter bound wins | unit | 100 kVA with 60 kvar leaves 80 kW; a tighter DC current limit beats it | 80.000 kW; with a 200 A limit at 320 V the DC current limit wins at 64.000 kW, the circle behind it at 80 kW; outside the window, nothing at all | **PASS** |
| Requested versus achieved | unit | what is achieved never exceeds what is asked, and shortfalls are named | holds at four request levels in both directions | **PASS** |
| Capability circle *plus* current and voltage | unit | all four converter ceilings apply together | rating, derating, DC current and DC window each bind in turn | **PASS** |
| BMS veto | unit | the management system can hold the plant to nothing | contactors open, both directions zero | **PASS** |
| BMS derating | unit | the permitted current falls in proportion inside the band | linear from band start to zero at the trip point | **PASS** |
| Trip delay | unit | a threshold crossed briefly does not trip | held past for less than the delay clears without tripping | **PASS** |
| Hysteresis | unit | an alarm clears only once the signal comes back past the reset point | re-entering the band does not re-clear | **PASS** |
| Latching and reset | unit | a latched fault survives the signal recovering | stays raised until reset is called, and names what it is waiting for | **PASS** |
| Competing constraints | unit | the tightest wins and is the one named | the named constraint is the smallest ceiling at every sample | **PASS** |
| Event ordering | unit | deterministic with two faults in one step | trip before alarm before limit before info, then by code | **PASS** |
| Weak cell | unit | one weak cell limits the pack, and a healthy average does not override it | pack held by the weak cell's terminal voltage, not by the mean | **PASS** |
| Temperature | unit | the hot preset derates, the cool one does not | hot binds on the over-temperature protection; cool never derates | **PASS** |
| Cooling failure | unit | temperature rises, derates, then trips, and does not come back down at idle | rises adiabatically after the loop stops; derate then trip | **PASS** |
| Communication loss | unit | the plant stops, and the reason is named | alarm immediately, factor zero, trip after 5 s | **PASS** |
| **No hidden one-step overshoot** | unit | no sample outside a protection limit at any step size | per-cell current within the permitted limit at every sample, at 15 s, 60 s, 300 s and 600 s | **PASS** |
| Voltage cutoff, end of step | unit | the cutoff holds at the *end* of the interval, not the start | minimum cell voltage respected to 1e-6 V at 600 s steps | **PASS** |
| State and constraint agree | unit | a converter is never reported meeting a request a limit is holding back | holds at every dispatching sample across three configurations | **PASS** |
| Nothing refused silently | unit | every refusal names a constraint and logs an event against whoever decided | reserve, ceiling and current limit each named, owned and logged | **PASS** |
| Alarm severity reserved | unit | a ceiling doing its job is a limit, not an alarm | only `info` and `limit` from a full or empty battery | **PASS** |
| Browser: default run | browser | states read, log empty | converter *discharging*, management *normal*, "nothing has engaged yet" | **PASS** |
| Browser: the reserve | browser | the policy's refusal is visible | constraint *Reserve held back*, ergOS lit, EMS event at 0 min | **PASS** |
| Browser: handover | browser | the constraint changes hands during the run | BMS current limit at 0 min → EMS reserve at 24 min, both logged | **PASS** |
| Browser: full battery | browser | charging a full battery is explained | constraint *State of charge ceiling*, converter *derated*, BMS event | **PASS** |
| Browser: log follows the cursor | browser | only what has happened is shown | 1 event at minute 0–39, 2 from minute 40 | **PASS** |
| No page or console errors | browser | none | none | **PASS** |

### 4. Browser walkthrough

`scratchpad/s4.mjs` — the lesson at four settings (1 MW from 80%, 2.5 MW from 10%, 2.5 MW from 30%,
2.5 MW charging from 100%), reading the two states, the named constraint, the lit subsystem and the
event log off the page at each, and walking the position slider through the derating run to confirm
the log only ever shows what has already happened.

### 5. Defects

| # | Defect | Severity | Status |
| --- | --- | --- | --- |
| D32 | A policy that asked for nothing while the learner asked for something named no constraint and logged no event. The plant sat in standby with the explanation as the only clue, which is the silence §11.3 exists to forbid. Found by opening the lesson at the reserve and asking why nothing happened. | **major** | **fixed**; the policy names its own hold, the engine takes that name as the binding constraint and logs it against the EMS. |
| D33 | A full battery refusing to charge was logged as an **alarm**. Alarm and trip belong to the protections in §12.4; a ceiling doing its job is a limit, and conflating them makes both severities meaningless. | major | **fixed**; limit-chain events are always `limit`, and the message distinguishes held-below from held-to-nothing. |
| D34 | The converter could read *discharging* in the same moment a limit was named as holding it back, because its state used a tolerance twenty times looser than the solver's. Two readings of one moment that contradicted each other. | major | **fixed**; the state uses the solver's own tolerance, and a test asserts the two can never disagree. |
| D35 | The binding constraint was read from the first sub-step only, so a ceiling that engaged half way through a reporting interval produced a step with a visible shortfall and nothing named as its cause. Found by the test written for D34. | major | **fixed**; the tightest ceiling across every sub-step of the interval is the one reported, and its event is timestamped at the sub-step that engaged it. |
| D36 | At rest the lesson player described the closing sample, which dispatches nothing — so a learner opening a finished run was told the converter was in standby for no reason anybody had given. | minor | **fixed**; the state, the explanation and the limiting subsystem describe the last interval that dispatched; the headline figures still describe the state the run ended in. |

### 6. Demonstration and rollback

Demo: **Projects** → any project → **Lessons** → *Charge and discharge* → raise the power to
2,500 kW and lower the starting charge to 30%. The plant runs against the management system's
current limit, then hands over to the policy's reserve at 24 minutes; both are named, owned and
timestamped in the log.
Rollback: `git revert a9e1731`. No migrations; nothing is written to storage.

### 7. Decision

**READY FOR ACCEPTANCE — review pending.** Next eligible stage: **S5 — jouleWise ergOS EMS.**

---

## S5 — jouleWise ergOS EMS

**State:** READY FOR ACCEPTANCE — review pending
**Revision:** `9d13f92`
**Depends on:** S4 (READY FOR ACCEPTANCE)

### 1. Scope

Delivered: the supervisory layer, the comparison, and F04.

- **`src/sim/ems.ts`** — five policies: manual, peak shaving, self-consumption, backup reserve and
  a price schedule. Each decides only on what it needs, and each returns a goal, an action, the
  rule that fired, the values it fired on and one plain sentence — the five rows §11.3 fixes for
  the always-visible card. An absence is never a silent zero: a policy handed no telemetry holds
  and names what is missing rather than shaving against an assumed nothing.
- **Stale telemetry and the fallback.** The timeout and the fallback are configuration on the
  policy, not constants in the engine, because §11.3 says there is no universal response and none
  will be claimed. Two are supported — stop, or hold the last setpoint — and every decision records
  the telemetry's age and whether the fallback applied.
- **The setpoint cadence**, kept separate from the integration step and from the reporting
  interval. A step between decisions says it held the previous setpoint rather than pretending to
  have decided again.
- **`localIslandControl`** — while the grid is absent the policy is not consulted at all. The
  converter forms the island and follows the site load and the plant's own auxiliaries, locally.
  This is what makes §11.2's no-break claim checkable rather than asserted: there is no code path
  from the load to the battery that passes through the supervisory layer.
- **`src/sim/compare.ts`** — a fixed schedule against an ergOS policy on the same day, both keeping
  every converter limit and every battery protection. Peak import, self-consumption, curtailment,
  delivered and stored energy, ending charge and an illustrative cost. The ending charge is
  disclosed whether or not anybody asked, valued at the closing price, and carried across before
  any benefit is attributed.
- **The engine gained site-level accounting** — site load, generation, grid import and export kept
  apart, and curtailment named. None of §11.4's metrics can be read from the plant's own terminals.
- **`src/app/pages/Lessons.tsx`** — the ergOS card, with **Why?** opening the rule, the policy
  version, the telemetry age, whether the setpoint was held, and the ceilings restated as power.

Deferred by design: the lesson cards that these policies are for are S6. The comparison is an
engine capability with unit coverage here; it gets its screen in S6 alongside lessons 2 to 5.

### 2. Environment

As S4. TypeScript engine in the browser, per the departure recorded in the S2 packet. No new
runtime dependency.

### 3. Checks

| Check | Command | Expected | Observed | Result |
| --- | --- | --- | --- | --- |
| Typecheck | `npx tsc --noEmit` | clean | clean | **PASS** |
| Unit suite | `npm run test` | all pass | **517 passed** (+34) | **PASS** |
| Rules suite | `npm run test:rules` | all pass | 48 passed | **PASS** |
| Static export | `npm run build` | 17 routes | 17 routes | **PASS** |
| **F04** reserve holds under normal economics | unit | a 2 MW discharge request at the reserve boundary consumes none of the protected energy | nothing discharged; charge never below the reserve by more than 1e-9 | **PASS** |
| **F04** an outage may use the emergency reserve | unit | to its allowed minimum, and no further | falls below the 50% reserve, stops at the 10% emergency floor | **PASS** |
| **F04** the transition is explained | unit | logged, both ways | `grid-lost` at 18:00 naming the emergency floor; `grid-restored` naming what is protected again | **PASS** |
| Every explanation resolves to logged values | unit | goal, action, rule and reason on every decision of every policy | holds across all six policies over a full day | **PASS** |
| No figure quoted that nobody measured | unit | an absent profile holds the policy rather than reading as zero | every decision `peak-shaving/no-load-telemetry`, nothing dispatched | **PASS** |
| Reserve respected | unit | under every policy | charge never below the floor in any run in the suite | **PASS** |
| Infeasible dispatch reduced | unit | the policy reduces before issuing | 9 MW asked, 2.5075 MW issued, action `reduce`, reduction logged as an EMS event | **PASS** |
| BMS remains authoritative | unit | over every policy, not only the manual one | at 60 °C ambient every policy stays inside the cell's voltage window and 0–100% charge | **PASS** |
| Stale telemetry follows the specified fallback | unit | as configured, and recorded | `fallback/stop` from the timeout onward, age recorded; `hold-last-setpoint` holds 400 kW | **PASS** |
| Setpoint cadence distinct from the step | unit | one decision per cadence, the rest held | 24 decisions and 264 held steps at an hourly cadence over a day at 5-minute steps | **PASS** |
| Comparison uses identical inputs | unit | proven, not asserted | scenario hash with the policy pointer normalised away, plant and parameter hashes identical | **PASS** |
| Comparison discloses ending SOC | unit | always, and reconciles before attributing | reconciled delta = raw delta − stored energy at the closing price, to 1e-6 | **PASS** |
| A worse outcome is reported as worse | unit | no flattering the candidate | a backwards schedule comes back costing more, and the disclosure says so | **PASS** |
| **No-break control does not depend on the EMS** | unit | the load is served through an outage with the supervisory telemetry gone | telemetry lost at noon, grid lost at 18:00; load served for the whole island, every decision `local/island` | **PASS** |
| An empty island is reported, not papered over | unit | the shortfall is named | charge stops at the emergency floor and the unserved load is recorded | **PASS** |
| Island only where the topology supports it | unit | a plant with no transfer equipment cannot island | the event says so and the site goes dark | **PASS** |
| Browser: the ergOS card | browser | goal, observed, action, requested/delivered, reason | all five present, action *discharge*, 1,000 kW requested → 1,000 kW delivered | **PASS** |
| Browser: Why? opens the rule | browser | rule, policy version, telemetry age, setpoint, ceilings | `manual/relay`, `manual-1`, 0 s, issued this step, three ceilings in kW | **PASS** |
| Browser: the policy's own refusal | browser | named, and said once | action *hold*, constraint *Reserve held back*, no duplicated sentence | **PASS** |
| Browser: attribution | browser | a ceiling's refusal is not read as an ergOS decision | charging a full battery reads action *charge*, constraint *State of charge ceiling* | **PASS** |
| No page or console errors | browser | none | none | **PASS** |

### 4. Browser walkthrough

`scratchpad/s5.mjs` — the lesson at three settings, reading the ergOS card off the page: the five
rows, the **Why?** disclosure opened, the policy's own refusal at the reserve, and a ceiling's
refusal while charging a full battery.

### 5. Defects

| # | Defect | Severity | Status |
| --- | --- | --- | --- |
| D37 | An island was limited as though its export limit were zero, so a plant that *could* form an island dispatched nothing into it. The no-break test found it immediately — which is the argument for writing that test. | **critical** — an unfixed version would have shown backup power failing at the moment it was needed | **fixed**; an island is limited by its own balance: the site load plus the plant's auxiliaries, less its generation. |
| D38 | A declared outage islanded any plant, whether or not it had the transfer equipment to do it with. §15 lesson 4 asks for a supported topology and this ignored the question. | major | **fixed**; `islandCapable` decides, the event says which case it is, and the site going dark is recorded as unserved load rather than silently served. |
| D39 | The island carried the site load but not the plant's own auxiliaries, which are on the island too. 22 kW went unserved every step of every outage. | major | **fixed**; local control follows the whole island balance. |
| D40 | The action on the ergOS card read *reduce* whenever anything held the plant back, crediting ergOS with refusals the battery management system had made. | major | **fixed**; the action is what the policy decided; what became of it is the requested-against-delivered row and the named constraint. |
| D41 | Where the policy was itself the reason there was no dispatch, the engine appended its own suffix to the policy's sentence: "the reserve held back held it to 0 kW". | minor | **fixed**; the suffix belongs to a request that was made and then held back downstream. |
| D42 | `presets` claimed to be the list a test could walk instead of trusting a hand-written one, and was itself a hand-written list missing the new plant, four policies and every scenario. Every check written against it passed for the wrong reason. | minor | **fixed**; the list is derived, and now includes scenarios. |

### 6. Demonstration and rollback

Demo: **Projects** → any project → **Lessons** → *Charge and discharge*. The ergOS card sits under
the four-box stack; **Why?** opens the rule it fired, the values it fired on and the ceilings
underneath it. Drop the starting charge to 10% and the policy refuses in its own words.
Rollback: `git revert 9d13f92`. No migrations; nothing is written to storage.

### 7. Decision

**READY FOR ACCEPTANCE — review pending.** Next eligible stage: **S6 — Lessons 1–6.**

---

## S6 — Lessons 1 to 6

**State:** READY FOR ACCEPTANCE — review pending. **Usability validation pending:** no beginner has
been observed using this, and §17.2 asks for that to be said rather than assumed.
**Revision:** `8268f6d`
**Depends on:** S5 (READY FOR ACCEPTANCE)

### 1. Scope

Delivered: the six cards §15 names, and a player that knows nothing about any of them.

A card now says what it runs, what the learner may move, which four figures to put at the top and
which two charts to draw. The player draws whatever it is handed. That is what keeps §15.1's limits
— three controls, four figures, two charts — the same for the sixth card as for the first, and a
test walks every card rather than trusting that each was written carefully.

| Card | The question | What the learner moves |
| --- | --- | --- |
| 1. Charge and discharge | Where does the energy go, and why does the charge level change? | direction, power, starting charge |
| 2. Reduce the evening peak | How does storage cut the demand a site draws from the grid? | import target, starting charge |
| 3. Use more solar | Why charge at noon and discharge later? | array size, starting charge |
| 4. Keep backup ready | Why stop selling energy while there is still charge left? | reserve, outage length, starting charge |
| 5. Follow a price schedule | Why does the timing of charging matter? | cheap window, how hard it buys, starting charge |
| 6. When the battery says slow down | Who wins when a request exceeds a limit? | condition, power, starting charge |

Cards 2 and 5 carry the §11.4 comparison: the site without storage, and a fixed schedule. Both
baselines are policies the engine runs in full with every converter limit and every battery
protection in force, and both disclose the ending charge before anything is attributed to anything.

Card 7 — UPS sizing — says which stage brings it and cannot be opened. §17.1.

### 2. Environment

As S5. TypeScript engine in the browser, per the departure recorded in the S2 packet. No new
runtime dependency.

### 3. Checks

| Check | Command | Expected | Observed | Result |
| --- | --- | --- | --- | --- |
| Typecheck | `npx tsc --noEmit` | clean | clean | **PASS** |
| Unit suite | `npm run test` | all pass | **535 passed** (+18) | **PASS** |
| Rules suite | `npm run test:rules` | all pass | 48 passed | **PASS** |
| Static export | `npm run build` | 17 routes | 17 routes | **PASS** |
| ≤3 controls, ≤4 metrics, ≤2 charts | unit | enforced on every built card | 6 of 6 inside the limits, and each draws exactly what it declared | **PASS** |
| Every card runs on its own defaults | unit | complete, and something happens | all six complete; each moves energy and moves the charge level | **PASS** |
| Outputs agree across diagram and plots | unit | the figures and the charts are two readings of one run | closing charge on the chart equals the run's closing charge to 1e-9; the peak figure equals the peak the chart reaches | **PASS** |
| The diagram agrees with the text | unit | the lit subsystem is the one that bound | owner recorded by the run, not inferred; named for every named constraint and for nothing else | **PASS** |
| Browser: lesson 1 | browser | plays, changes, resets | 0 → 16 min; charge level 40.8% → 76.1% at 100% starting charge; restored on reset | **PASS** |
| Browser: lesson 2 | browser | the target is held, and the comparison shows against what | highest import 1,522 kW against a 1,500 kW target, held 100% of the day; without storage, 2,166 kW | **PASS** |
| Browser: lesson 3 | browser | where the generation went | 12,000 kWh generated, 11,069 used as it was made, 931 stored, none thrown away | **PASS** |
| Browser: lesson 4 | browser | the outage is carried on the reserve | 1.0 h of 1 h carried, nothing unserved, 50% → 50.7% | **PASS** |
| Browser: lesson 5 | browser | buying and selling, against a fixed schedule | ₹91,598 against ₹91,710, both ending at 10% — reported as it came out | **PASS** |
| Browser: lesson 6 | browser | a different subsystem refuses in each condition | the hot condition reaches the over-temperature protection; the normal one does not | **PASS** |
| Browser: reset, every card | browser | back to exactly what it opened with | all six restore their opening figure | **PASS** |
| Baseline comparison keeps every protection | unit | no "EMS off" baseline | both sides complete, charge inside 0–100%, disclosures carried | **PASS** |
| Prices illustrative | unit | wherever one is quoted | every scheduling decision says so, and the card's expected outcomes say so | **PASS** |
| Backup uses a supported topology | unit | the backup card runs on a plant that can island | `islandCapable`, with a declared outage | **PASS** |
| Unbuilt card is visibly unavailable | unit + browser | says which stage, cannot be opened | card 7 marked *Not built yet*, 6 of 7 openable | **PASS** |
| No page or console errors | browser | none across all six | none | **PASS** |
| **Observed beginner walkthrough** | — | a beginner observed using it | not done | **PENDING** — recorded, not waived |

### 4. Browser walkthrough

`scratchpad/s6.mjs` — the catalogue reached from a project, then every card in turn: read the
figures, the charts, the controls and the ergOS card; play; move the first control to its minimum;
read the comparison; reset; confirm the opening figure came back. Six cards, one case each.

### 5. Defects

| # | Defect | Severity | Status |
| --- | --- | --- | --- |
| D43 | The grid import limit was applied to the plant as though it had the connection to itself. A plant charging at its rating while the site was already drawing two megawatts asked the connection for the sum, and the overflow came back as **load nobody served** — the site going dark because the battery was busy filling itself. Found in lesson 4, which reported both "outage carried in full" and "809 kWh unserved" on the same run. | **critical** | **fixed**; the connection is shared. What the plant may import is the limit less what the site is already drawing through it; what it may export is the limit plus whatever the site absorbs. |
| D44 | The four-box diagram guessed which subsystem to light by pattern-matching the wording of the constraint printed beside it. Two readings of one decision, inferred separately. | major | **fixed**; the run records the owner, and the diagram reads it. A test asserts an owner for every named constraint and none for an idle step. |
| D45 | Lesson 2 reported the target held for only 63% of the day while never exceeding it by more than 1.5%. The policy decides on the load at the start of an interval and the site climbs through it, so a plant holding a target perfectly reports a hair above it at every sample. | major — it taught the opposite of what was happening | **fixed**; within two per cent counts as held, and the figure says so. |
| D46 | Lesson 3's last two figures read "Exported 0, Thrown away 0" on its own defaults, so half the card said nothing. | major | **fixed**; the four figures now account for every kilowatt-hour the array made: used as it was made, stored for later, exported. |
| D47 | Lesson 4 opened on a two-hour outage its own default reserve could not carry, so the card's first impression was the site going dark. | minor | **fixed**; the default outage is one hour, which the default reserve carries. Making it longer is one of the three controls, and is the point. |
| D48 | A price window said *when* but not *how hard*, so lesson 5's window control barely mattered: the plant filled at its rating inside ninety minutes whatever the window. | minor | **fixed**; a window carries a power fraction, and the card has a control for it. |

### 6. Demonstration and rollback

Demo: **Projects** → any project → **Lessons**. Six cards. Open *Reduce the evening peak*, drag the
target down to 600 kW and watch the battery empty before the evening does; open *Keep backup ready*
and set the outage to five hours to see the same thing from the other end.
Rollback: `git revert 8268f6d`. No migrations; nothing is written to storage.

### 7. Decision

**READY FOR ACCEPTANCE — review pending, with usability validation recorded as pending.** Next
eligible stage: **S7 — Contract-demand UPS sizing.**

---

## S7 — Contract-demand UPS sizing

**State:** READY FOR ACCEPTANCE — review pending
**Revision:** `be105c8`
**Depends on:** S6 (READY FOR ACCEPTANCE)

### 1. Scope

Delivered: lesson 7, the sizing behind it, and F05.

- **`src/sim/ups.ts`** — contract demand → site power → protected power → protected apparent power
  → energy at the load; and then, kept separate, the continuous rating after headroom and the
  nominal battery after the path losses and the usable state-of-charge window. Every figure carries
  the assumption that produced it in the strip a reader can open.
- **Equipment from the catalogue**, multiplied out of real rows: module and rack counts derived from
  the enclosure entry, converters filtered by whether their DC window contains the string's voltage,
  and — where nothing fits — an answer that says commercial selection is pending rather than an
  invented rating.
- **Three result cards**: selected requirement, next supported power size, longer runtime option,
  the last only where the converter and the discharge rate still hold.
- **Test this system** and **Resize system** as separate actions, with the held system shown as the
  system under test beside what the duty would need.
- **Lesson 7** — three controls (contract demand, load to protect, backup duration), four figures,
  two charts, a *Simulate grid failure* action rather than a fourth control, and the coupled run
  behind it: grid healthy, grid fails, protected load carried locally, grid returns.

Not claimed anywhere: continuity. §15.3 is explicit that an energy model cannot establish zero-break
transfer, voltage quality or protection coordination, and every panel says so.

### 2. Environment

As S6. TypeScript engine in the browser, per the departure recorded in the S2 packet. No new
runtime dependency.

### 3. Checks

| Check | Command | Expected | Observed | Result |
| --- | --- | --- | --- | --- |
| Typecheck | `npx tsc --noEmit` | clean | clean | **PASS** |
| Unit suite | `npm run test` | all pass | **570 passed** (+35) | **PASS** |
| Rules suite | `npm run test:rules` | all pass | 48 passed | **PASS** |
| Static export | `npm run build` | 17 routes | 17 routes | **PASS** |
| **F05** the worked example | unit | 500 kVA × 0.90 × 50% = 225 kW; 250 kVA at 0.90; 56.25 kWh for 15 min; 270 kW / 300 kVA with 20% headroom | all four exact to 1e-9 | **PASS** |
| **F05** 56.25 kWh is not the battery | unit | the nominal estimate is separately derived | 84.94 kWh — the load energy over the path efficiency, divided by the usable window and the retained capacity | **PASS** |
| **F05** every preset | unit | all six contract demands, recalculated not looked up | the §15.3 table reproduced exactly; 120 preset combinations produce no bad number | **PASS** |
| kVA against kW | unit | site power factor is not applied twice | a 450 kW contract and a 500 kVA contract give the same protected load | **PASS** |
| Power factor effect | unit | required kVA changes at unchanged kW | 0.90 → 0.80 leaves 225 kW and raises 250 kVA to 281.25 | **PASS** |
| Measured load supersedes | unit | replaces the estimate, never added to it | 120 kW measured is 120 kW protected, and the estimate warning is dropped | **PASS** |
| Load-fraction boundary | unit | more protected share, more requirement | monotone across 25 / 50 / 75 / 100%, reaching 450 kW | **PASS** |
| Duration boundary | unit | more energy, same inverter | 5 min → 120 min raises the energy 24-fold and leaves 270 kW / 300 kVA unchanged | **PASS** |
| Discharge-rate limit on a short outage | unit | power binds, not energy | 5 minutes of 225 kW selects on power; the configuration's own continuous rating covers it | **PASS** |
| Catalogue compatibility | unit | real rows, and a DC window that contains the string | counts integral, converter window contains the string's nominal voltage, caveats state what is illustrative | **PASS** |
| Insufficient initial reserve | unit | reported, not papered over | from 30% charge a two-hour duty comes back *insufficient readiness* with the runtime it can reach | **PASS** |
| Fixed-system test versus resize | unit | holding does not resize | the held system keeps its enclosure, its count and its converters under a harder duty, and names what it cannot meet | **PASS** |
| Resize after holding | unit | grows when asked to | continuous rating rises from 375 kW to 7,523 kW for a 5 MVA duty | **PASS** |
| The coupled run | unit | the sizing estimate is confirmed, not trusted | grid lost and restored as events; every sample of the outage carried locally, nothing unserved | **PASS** |
| Economic dispatch never eats the reserve | unit | nothing discharged before the outage | zero to 1e-6 W at every pre-outage sample | **PASS** |
| BMS authoritative through an outage | unit | cell limits hold | no cell below its minimum at any sample of a two-hour island | **PASS** |
| No verified no-break claim | unit | on every setting | "continuity is not verified" on all six contract demands | **PASS** |
| Browser: the default | browser | 500 kVA / 50% / 15 min reads correctly | 225 kW protected, 270 kW required, 85 kWh estimate, 15 min achieved on 3 × SWESLC832V314Ah | **PASS** |
| Browser: simulate grid failure | browser | the outage runs from the button | runtime 15 min of 15 asked for | **PASS** |
| Browser: a harder duty | browser | resizes when it should | 100% for 120 min → 450 kW, 1,359 kWh estimate, 6 units | **PASS** |
| Browser: test versus resize | browser | the held system is tested, not resized | the 375 kW system asked to carry 5,400 kW reports three shortfalls and 0 min achieved; *Resize system* then reaches 7,523 kW and 15 min | **PASS** |
| No page or console errors | browser | none | none | **PASS** |

### 4. Browser walkthrough

`scratchpad/s7.mjs` — the default setting, the assumptions strip, *Simulate grid failure*, a harder
duty, then **Test this system** against a five-megavolt-ampere contract and **Resize system** after
it, reading the result cards, the shortfalls and the readiness at each step.

### 5. Defects

| # | Defect | Severity | Status |
| --- | --- | --- | --- |
| D49 | A 270 kW requirement was met with fifty-four five-kilowatt hybrid inverters wired to a string four times their DC window. The kilowatts added up and nothing else did. | **critical** — the configuration cannot be connected, let alone built | **fixed**; a converter is a candidate only where its DC window contains the string's nominal voltage, and no selection exceeds twenty units of one kind. |
| D50 | "The smallest compatible combination" was read one way and gave eleven cabinets and eleven inverters where one of each would do; read the other way it gave a five-megawatt-hour container for an eighty-five kilowatt-hour requirement. | major | **fixed**; among the combinations within twice the least energy that meets the requirement, the fewest units wins — stated as the arbitrary line it is, and checked both ways. |
| D51 | While a system was held for testing, the result cards showed a freshly sized configuration as *Selected requirement* — equipment nobody has, on a panel about the equipment they do. | major | **fixed**; the held system is shown as *The system under test*, with *What this duty would need* beside it. |
| D52 | The button reading **Simulate grid failure** announced itself as "Play", so it could not be asked for by name — and a browser check looking for it by name could not find it either. | major — accessibility | **fixed**; the accessible name is the words on the button. |

### 6. Demonstration and rollback

Demo: **Projects** → any project → **Lessons** → *UPS support by contract demand*. Leave it at
500 kVA, 50%, 15 minutes and press **Simulate grid failure**. Then press **Test this system**, raise
the contract demand to 5,000 kVA and the protected share to 100%, and read what the system you
already have does with that.
Rollback: `git revert be105c8`. No migrations; nothing is written to storage.

### 7. Decision

**READY FOR ACCEPTANCE — review pending.** Next eligible stage: **S8 — Lead-acid versus LFP.**

---

## S8 — Lead-acid against lithium

**State:** READY FOR ACCEPTANCE — review pending
**Revision:** `c2b11e5`
**Depends on:** S7 (READY FOR ACCEPTANCE)

### 1. Scope

Delivered: a distinct VRLA model, the equal-service comparison, and F06. It is a second step inside
lesson 7, per §15.4, not an eighth card.

- **`src/sim/vrla.ts`** — a fitted Peukert-style constant-power model with a rate-dependent average
  discharge voltage, a temperature correction, a bulk-and-absorption recharge model and a float-life
  rule of thumb. It refuses to answer outside the bounds it was fitted for — under five minutes,
  over eight hours, outside 0–45 °C — because a number produced outside a model's applicability is
  worse than no number. Every result says it is a fit rather than a datasheet.
- **`src/sim/chemistry.ts`** — equal service, not equal labels. Both options carry the same
  protected load for the same autonomy, each sized against its own curves, and everything that
  differs is disclosed: the DC bus, the management system, the floor area, the mass, and the
  recharge time that decides readiness for the *next* outage.
- **F06** — a day of three fifteen-minute outages an hour apart, with the charge carried from one to
  the next, on both chemistries.
- **The lesson** — the comparison table, the three-outage day and the disclosures sit under the
  sizing panels of lesson 7.

Not claimed: lifecycle cost, which is S9, and calendar life for lithium, which is left blank rather
than guessed. Flooded, gel and other lead-acid technologies are not represented by this VRLA data,
and LFP figures are never applied to NMC.

### 2. Environment

As S7. TypeScript engine in the browser, per the departure recorded in the S2 packet. No new
runtime dependency.

### 3. Checks

| Check | Command | Expected | Observed | Result |
| --- | --- | --- | --- | --- |
| Typecheck | `npx tsc --noEmit` | clean | clean | **PASS** |
| Unit suite | `npm run test` | all pass | **605 passed** (+35) | **PASS** |
| Rules suite | `npm run test:rules` | all pass | 48 passed | **PASS** |
| Static export | `npm run build` | 17 routes | 17 routes | **PASS** |
| **F06** charge carried forward | unit | each outage starts where the last left it | on both chemistries, every event starts below the previous one; the third never starts full | **PASS** |
| **F06** recharge less than the withdrawal | unit | bounded by the charger and the window | on both chemistries, what goes back between events is less than what came out, and more than nothing | **PASS** |
| **F06** the shortfall is reported | unit | a later event that cannot be carried says so | first carried in full, a later one short, with the minutes it did carry | **PASS** |
| **F06** a limited window is not an unlimited one | unit | the charger's rate changes the outcome | 1 C leaves the third event higher than 0.02 C | **PASS** |
| A model of lead-acid, not lithium | unit | the rate effect is present and monotone | 100% of the twenty-hour rating at 20 h, under 45% at 15 min, under 35% at 5 min | **PASS** |
| The Peukert relation it claims | unit | matches the closed form independently | to 1e-12 at five durations | **PASS** |
| Constant-power discharge, not an Ah rating | unit | sizing uses the curve at the duration | the label-based count is less than half the sized one | **PASS** |
| Refuses outside its bounds | unit | infeasible rather than extrapolated | 1 min, 10 h, 60 °C and −5 °C all return no number and say why | **PASS** |
| Recharge is the slow part | unit | absorption dominates per point of charge | the last fifth is over 2.5× slower per point than the bulk phase | **PASS** |
| Never faster than the cells permit | unit | the charger cannot exceed the cell limit | a 5 C charger and a 0.2 C cell give the same time | **PASS** |
| Equal service, not equal energy | unit | both sized for the same duty, to different energies | 91 kWh of lead-acid against 783 kWh of lithium for 225 kW for 15 minutes | **PASS** |
| Everything that differs is disclosed | unit | bus, management, space, recharge | all four present in the differences | **PASS** |
| Same end-of-life threshold for both | unit | 80%, held to both | end-of-life autonomy below beginning-of-life on both | **PASS** |
| No chemistry's data generalised to another | unit | stated on every comparison | LFP not applied to NMC; flooded and gel not represented by VRLA | **PASS** |
| No invented lithium service life | unit | blank, with the reason | `serviceLifeYears` null, and the note says why | **PASS** |
| Warm room shortens life, not autonomy | unit | separate effects | 25 °C → 35 °C halves float life and leaves autonomy unchanged | **PASS** |
| The schedule does not resize the equipment | unit | the day tests what was sized | the same three outages carried in full by a two-hour design and not by a fifteen-minute one | **PASS** |
| Browser: the comparison | browser | both configurations, the day, the differences | 3 strings of 64 blocks against 3 enclosures; 5.8 t against 7.8 t; 17.2 m² against 8.1 m² | **PASS** |
| Browser: the three-outage day | browser | the lead-acid case degrades across the day | 15 of 15, then 7 of 15, then 2 of 15 — against 15, 15, 15 for lithium | **PASS** |
| Browser: a longer design | browser | carries all three | at two hours of autonomy the lead-acid case carries 15, 15, 15 | **PASS** |
| No page or console errors | browser | none | none | **PASS** |

### 4. Browser walkthrough

`scratchpad/s8.mjs` — lesson 7 at three autonomies, reading the comparison table, the three-outage
day and the differences off the page at each.

### 5. Defects

| # | Defect | Severity | Status |
| --- | --- | --- | --- |
| D53 | The state of charge was measured against the energy available *at the discharge rate*, while recharge was measured against the twenty-hour rating — a battery filled in one currency and emptied in another. It made a fifteen-minute outage cost three per cent of a pack sized to be emptied by it. | **critical** — the comparison's central number was meaningless | **fixed**; charge is a fraction of nominal energy throughout, and delivering a watt-hour at a high rate costs more than a watt-hour of it, which is the Peukert effect stated in the bookkeeping. |
| D54 | Every block was put in one series stack, giving a 1,728 V battery for a fifteen-minute design and 8,736 V for a two-hour one. | **critical** — not a thing anybody installs | **fixed**; blocks make a string at the converter's DC voltage and strings go in parallel, and a test holds the string between 500 and 1,000 V at every duration. |
| D55 | Sizing used the whole pack while the run refused to discharge the bottom tenth, so a system sized for fifteen minutes carried 13.6 of them. | major | **fixed**; sizing is against the usable window — readiness less the floor — and says what window it used. |
| D56 | Recharging "to full" ran the absorption phase to exactly 100%, where a decaying current takes indefinitely long: it returned 17.3 hours and would have returned any number asked of it. | major | **fixed**; it stops at 99%, and the note says that is where it stopped and why. |
| D57 | The three-outage day re-sized the battery for the outages instead of testing the battery that had been sized for the chosen autonomy, so the schedule silently changed the equipment it was meant to be testing. | major | **fixed**; the day is put to the configuration on the screen, and a test pins that. |

### 6. Demonstration and rollback

Demo: **Lessons** → *UPS support by contract demand* → scroll to **Lead-acid or lithium, for the
same service**. Read the three-outage day at the default fifteen minutes, then set the backup
duration to 120 minutes and read it again.
Rollback: `git revert c2b11e5`. No migrations; nothing is written to storage.

### 7. Decision

**READY FOR ACCEPTANCE — review pending.** Next eligible stage: **S9 — Indian conditions and
lifecycle cost.**

---

## S9 — Indian conditions and lifecycle cost

**State:** READY FOR ACCEPTANCE — review pending
**Revision:** `626bd83`
**Depends on:** S8 (READY FOR ACCEPTANCE)

### 1. Scope

Delivered: three operating scenarios, the lifecycle ledger, and F07.

- **`src/sim/india.ts`** — three illustrative Indian operating scenarios, and not one city name
  between them: a conditioned office or IT room at 25 °C with an outage a month; a warm industrial
  electrical room at 35 °C with one a day; and three interruptions an hour apart with a recharge
  window too short to use. Each states the **room** temperature and the **battery** temperature
  separately, with the rise between them declared as an exposed assumption. Teaching tariffs of ₹6,
  ₹9 and ₹12 per kilowatt-hour, labelled as teaching values on every result.
- **`src/sim/lifecycle.ts`** — a ledger of dated lines. A missing price is carried as unknown,
  listed beside the total and never counted as zero; the total says it is incomplete. Tax is
  explicit and nothing about it is assumed. Recurring costs escalate and capital ones do not.
  Replacement timing comes from evidence where there is some — the float-life model's response to
  temperature — and from declared sensitivity cases where there is none.
- **The panels** — an operating-conditions selector, a horizon of 5, 10 or 15 years, the tariff, and
  a switch between no prices entered and an illustrative quotation, all inside lesson 7's second
  step rather than as beginner controls.

Not claimed: any market price, any GST rate, any recycling arrangement, any avoided-outage benefit,
and any lithium service life.

### 2. Environment

As S8. TypeScript engine in the browser, per the departure recorded in the S2 packet. No new
runtime dependency.

### 3. Checks

| Check | Command | Expected | Observed | Result |
| --- | --- | --- | --- | --- |
| Typecheck | `npx tsc --noEmit` | clean | clean | **PASS** |
| Unit suite | `npm run test` | all pass | **636 passed** (+31) | **PASS** |
| Rules suite | `npm run test:rules` | all pass | 48 passed | **PASS** |
| Static export | `npm run build` | 17 routes | 17 routes | **PASS** |
| **F07** undiscounted total | unit | 1,000,000 + 400,000 + 500,000 − 100,000 | ₹1,800,000 exactly | **PASS** |
| **F07** discounted total | unit | the closed-form sum at 10% real | ₹1,517,042.56, matching an independently computed annuity to 1e-6 | **PASS** |
| **F07** zero discount rate | unit | equals the undiscounted total | equal to 1e-9 | **PASS** |
| **F07** no crossover | unit | reported as none, not as a failure | null against a ledger cheaper in every year | **PASS** |
| **F07** a crossover that exists | unit | the year named, checked by hand | year 9, where the cumulative totals actually cross | **PASS** |
| Escalation applies to the right lines | unit | recurring escalates, capital does not | matches a hand-summed escalating annuity | **PASS** |
| A missing price is not a zero | unit | listed, and the total marked incomplete | 16 unknown lines per option by default, total incomplete, nothing counted as free | **PASS** |
| No market price claimed | unit | every price null until entered | battery, conversion, disposal, residual and both tax fields null | **PASS** |
| No assumed tax | unit | rate and credit eligibility unstated | both null, with a note saying so | **PASS** |
| Replacement on evidence | unit | temperature drives the lead-acid interval | 4.7 years at 26 °C against 2.0 at 38 °C; lithium on declared cases | **PASS** |
| No fixed replacement rule | unit | nothing hard-codes three years or ten | the lithium evidence is `sensitivity`, and says why | **PASS** |
| Room and battery kept apart | unit | two temperatures, with the rise declared | every preset states both and the basis for the difference | **PASS** |
| No city, state or national average | unit | none anywhere in the presets | eight city names and two average phrasings all absent | **PASS** |
| The day is an example, not a lifetime | unit | annual repetition stated explicitly | every preset says so | **PASS** |
| Schedule independent of design autonomy | unit | more autonomy, same three outages | 3 outages asked at both 15 and 60 minutes; the equipment grows, the schedule does not | **PASS** |
| Teaching tariffs labelled | unit | ₹6/₹9/₹12, not DISCOM tariffs | labelled on the constant and in every comparison's disclosures | **PASS** |
| End of life not priced without an arrangement | unit | unknown, with the rules named | disposal unknown on both options; the Battery Waste Management Rules and the scrap-sale warning carried | **PASS** |
| Avoided-outage losses excluded | unit | outside the base total | stated in every comparison | **PASS** |
| Neither result forced | unit | one case each way | lead-acid cheaper in a conditioned room over 5 years; lithium carries more of the repeated-interruption day | **PASS** |
| Crossover only where they cross | unit | sign changes at the named year | holds across all three presets | **PASS** |
| 5, 10 and 15-year views | unit | same inputs, three horizons | all three complete with the right number of years | **PASS** |
| Tariff moves only what a tariff touches | unit | monotone in the tariff | ₹6 < ₹9 < ₹12 on the same configuration | **PASS** |
| Protected load charged to neither | unit | only the losses are charged | 1,000 kWh at 95% charges 50 kWh, and the basis says so | **PASS** |
| Cooling not counted twice | unit | only beyond the auxiliaries | no cooling lines at zero incremental; ten at 500 kWh, with the reason | **PASS** |
| Browser: no prices entered | browser | incomplete, and no crossover claimed | 16 unpriced lines each, "no crossover is stated, because the totals are incomplete" | **PASS** |
| Browser: with a quotation | browser | complete totals and a verdict | ₹48.68 lakh against ₹2.36 cr, no crossover within 10 years | **PASS** |
| Browser: the three presets | browser | temperature and readiness follow the preset | 25/26 °C, 35/38 °C, 30/32 °C; 1 of 3 outages carried by lead-acid against 3 of 3 | **PASS** |
| Browser: horizon and tariff | browser | both change the totals | 10 → 15 years and ₹9 → ₹12 both move it, in the right direction | **PASS** |
| No page or console errors | browser | none | none | **PASS** |

### 4. Browser walkthrough

`scratchpad/s9.mjs` — the default with nothing priced, then an illustrative quotation, then each of
the three operating presets, then fifteen years, then ₹12/kWh, reading the ledger, the crossover
statement and the unpriced lines at each step.

### 5. Defects

| # | Defect | Severity | Status |
| --- | --- | --- | --- |
| D58 | A crossover year was named from two totals that were each missing sixteen prices. It was the most confident figure on the screen and the least supported. | **major** | **fixed**; incomplete totals yield no crossover, and the panel says why rather than going quiet. |
| D59 | The lithium configuration is several times the energy the duty needs, because the smallest unit in the catalogue is that size — so part of the cost difference was product granularity being read as chemistry. | major | **fixed**; where a configuration exceeds twice what the duty needs, the comparison says so and says what would change it. |

### 6. Demonstration and rollback

Demo: **Lessons** → *UPS support by contract demand* → scroll to **The conditions it runs in**.
Switch to *Repeated interruptions, limited recharge* and read the outages carried; then switch
prices from **None entered** to **Illustrative quotation** and watch the crossover statement change
from a refusal into an answer.
Rollback: `git revert 626bd83`. No migrations; nothing is written to storage.

### 7. Decision

**READY FOR ACCEPTANCE — review pending.** Next eligible stage: **S11 — Project and quotation
integration** (S10 deferred by decision).

---

## S11 — Project and quotation integration

**State:** READY FOR ACCEPTANCE — review pending
**Revision:** `1806ed2`
**Depends on:** S9 (READY FOR ACCEPTANCE). S10 is deferred by decision, and this stage's dependency
was revised to S9 accordingly.

### 1. Scope

Delivered: the learning-to-design conversion, immutable results linked to a project revision, the
engineering appendix, and F08.

- **`src/quoting/appendix.ts`** — the appendix §16 allows, and the three rules it enforces: it
  releases nothing, it warrants nothing, and it is tied to an exact design revision. For a UPS
  proposal it also carries the contract demand with its units, the critical load and whether it was
  measured, both power factors, the UPS output, the chemistry selected, the battery capacity, the
  requested and achieved autonomy, the outage-start charge, redundancy, recharge and the continuity
  status — with indicative contract-demand sizing in a section that says so.
- **`src/quoting/conversion.ts`** — a lesson's duty becomes a design. The power and the duration
  come across; the teaching plant does not. Every figure states where it came from, and the design
  lists what it still needs before it is about anywhere.
- **Immutable results** — a run kept from a lesson carries the project and the design revision it
  was produced against, is written once, and is refused an update by the rules from every role.
- **Two approvals, two people** — `evidence.approve` is a new permission held by engineers, owners
  and admins; `quote.approve` is held by approvers, owners and admins. Neither role that holds one
  and not the other can reach the other.

### 2. Environment

As S9. TypeScript engine in the browser, per the departure recorded in the S2 packet. No new
runtime dependency.

### 3. Checks

| Check | Command | Expected | Observed | Result |
| --- | --- | --- | --- | --- |
| Typecheck | `npx tsc --noEmit` | clean | clean | **PASS** |
| Unit suite | `npm run test` | all pass | **665 passed** (+29) | **PASS** |
| Rules suite | `npm run test:rules` | all pass | **54 passed** (+6) | **PASS** |
| Static export | `npm run build` | 17 routes | 17 routes | **PASS** |
| **F08** another customer's run by identifier | rules | refused | refused; own run still readable | **PASS** |
| **F08** their design and their quotation | rules | refused | both refused | **PASS** |
| **F08** a listing that would return both | rules | refused | collection read refused | **PASS** |
| **F08** another workspace entirely | rules | read, list and write all refused | all three refused | **PASS** |
| **F08** a run written under another workspace's name | rules | refused | refused | **PASS** |
| **F08** staff of this workspace still see it | rules | yes, and not the other one | holds | **PASS** |
| **F08** a changed parameter set cannot reuse the result | unit | refused, naming what moved | refused; scenario, plant and parameter set each named | **PASS** |
| **F08** nor its badge | unit | the badge does not carry across | falls to illustrative on every mismatch | **PASS** |
| **F08** a tampered run record | unit | refused before anything is read from it | refused: the seal no longer matches | **PASS** |
| **F08** a run that did not complete | unit | refused, with its failure | refused, quoting the failure | **PASS** |
| Immutable results | rules | no update from any role | refused for customer, sales, engineer, approver, admin and owner | **PASS** |
| A run links to a project revision | unit | project and design hash carried, and survive storage | round-trips unchanged | **PASS** |
| A design change flags the quotation | unit | stale, with what it invalidated | assumptions, performance and price all named; review required | **PASS** |
| The same design twice is the same revision | unit | identical hash | identical | **PASS** |
| The appendix carries what §16 lists | unit | nominal, usable, AC boundary, efficiency, evidence | all present, in three sections | **PASS** |
| Modelled performance is never a warranty | unit | said, and no guarantee anywhere | "not a warranty" present; no unqualified guarantee | **PASS** |
| The appendix releases nothing | unit | said plainly | "releases, prices or issues" nothing | **PASS** |
| Evidence approval is not price approval | unit | separate permissions, separate roles | engineer has one, approver the other, neither has both | **PASS** |
| Indicative stays distinct from reviewed | unit | separate sections and statuses | heading, status and note differ; a warning while unreviewed | **PASS** |
| The chemistry is named | unit | LFP, VRLA or not selected | all three | **PASS** |
| The conversion carries the duty, not the plant | unit | power and duration only | 270 kW for 15 minutes; catalogue defaults unchanged | **PASS** |
| The conversion says where each figure came from | unit | provenance on every one | "an estimate from contract demand, not a measurement" | **PASS** |
| The conversion produces a design that runs | unit | the sizing engine accepts it | both lessons size without a bad number | **PASS** |
| Browser: the appendix on a quotation | browser | sections, rows, limitations, actions | plant section with the design revision; both actions available | **PASS** |
| Browser: tie and approve | browser | both recorded, both then disabled | "approved by Demo Engineer … covers the model and its assumptions, and no price" | **PASS** |
| Browser: keep a result | browser | written once, button reads kept | held, and appears in the appendix as *Achieved under the stated scenario* | **PASS** |
| Browser: the design moves | browser | the quotation says so | "The design has moved on since this quotation was prepared" | **PASS** |
| Browser: the conversion | browser | provenance and outstanding items | three figures with their sources, six outstanding items | **PASS** |
| No page or console errors | browser | none | none | **PASS** |

### 4. Browser walkthrough

`scratchpad/s11.mjs` and `scratchpad/s11b.mjs` — the appendix on a quotation, tying it to a design
revision and approving the engineering evidence; then the whole path: keep a result from a lesson,
take the lesson's duty into the design, and return to the quotation to find it flagged against the
revision it was prepared from, with the kept run's scenario and badge beside it.

### 5. Defects

None found that survived to this commit. The two things this stage changed about earlier work were
deliberate extensions rather than fixes: the stored envelope gained the project and design revision
a result belongs to, and the permission table gained the evidence approval that §16 requires to be
separate from pricing.

### 6. Demonstration and rollback

Demo: **Quotations** → any quotation → **Engineering appendix** → **Tie this quotation to the
current design**. Then **Lessons** → *Charge and discharge* from that project → **Keep this result
with the project** → **Take this duty into the design** → **Apply it**. Return to the quotation:
the appendix now carries the kept run and says the design has moved on.
Rollback: `git revert 1806ed2`. The stored envelope's two new fields default to empty, so documents
written before it are read unchanged.

### 7. Decision

**READY FOR ACCEPTANCE — review pending.** Next eligible stage: **S12 — Release readiness.**

---

## S12 — Release readiness

**State:** READY FOR ACCEPTANCE — review pending. **The release has not been performed:** there are
no deployment credentials in this environment, and releasing is a human act on an exact revision.
**Revision under test:** `9cdca23`
**Depends on:** S11 (READY FOR ACCEPTANCE)

### 1. Scope

Delivered: the checks §17.2 asks for, run against one revision; performance budgets declared before
they were measured; a rollback and a restore actually exercised; and an honest account of the four
checks that cannot apply here.

### 2. What cannot be checked, and why

§17.2 asks for production-like compute and jobs, job cancellation and timeouts, worker failure,
cache isolation and quotas. **The engine runs in the browser**, per the departure recorded in the S2
packet, so there is no worker, no job queue and no server cache to exercise. These are recorded as
**NOT APPLICABLE** against that departure rather than dropped or marked passed, each with whatever
stands in its place:

| Check | Why it cannot apply | What stands in its place | Evidence |
| --- | --- | --- | --- |
| Job cancellation | A run is synchronous. There is no job to cancel. | A run is bounded before it starts: a scenario that would exceed the cap is refused with what to change. | `release.perf.test.ts` |
| Timeouts | Nothing waits on anything. | The same cap, which is what makes the run finite. | `release.perf.test.ts` |
| Worker failure | There is no worker. | A run that fails is reported as failed, with its reason and a null finish time, never as an empty success. | `sim.engine.test.ts` |
| Cache isolation | There is no cache. | A result is refused for a configuration it was not produced for, and its evidence badge is refused with it; another tenant's result is refused by the rules. | `quoting.appendix.test.ts`, `rules.test.ts` |
| Quotas | No server compute to meter. | The sub-step cap, and six-significant-figure rounding that bounds a stored document. | `release.perf.test.ts`, `sim.contracts.test.ts` |
| Retention | No automatic retention policy exists. | Stated rather than implied: a kept run lives until its owner or an administrator deletes it, and the rules permit exactly those two. Nothing expires on its own. | `rules.test.ts` |
| Observability | No server to instrument. | The activity log for what people did, the event log for what the plant did, and a failed run that says why. Both are records rather than telemetry, and neither is claimed as monitoring. | — |

### 3. Checks

| Check | Command | Expected | Observed | Result |
| --- | --- | --- | --- | --- |
| Typecheck | `npx tsc --noEmit` | clean | clean | **PASS** |
| Unit suite | `npm run test` | all pass | **672 passed** | **PASS** |
| Rules suite | `npm run test:rules` | all pass | 54 passed | **PASS** |
| Static export | `npm run build` | 17 routes | 17 routes | **PASS** |
| Every route answers | browser | 200, with a heading | 15 routes, all 200, all headed | **PASS** |
| No 404 served | browser | none | none, across every entity page in the workspace | **PASS** |
| End-to-end smoke, all seven lessons | browser | each plays, changes and resets | 7 of 7: four figures, two charts, played, one control moved, reset restored the opening figure | **PASS** |
| The chemistry comparison | browser | both tables render | comparison 9 rows, lifecycle 5 rows | **PASS** |
| Critical journey: the offer | browser | every tab renders | all six tabs, 17,099 characters on the offer document | **PASS** |
| Export integrity | browser | self-contained, complete, no artefacts | 557 kB, 7 images inlined, 0 external references, no NaN or undefined, no scripts | **PASS** |
| Performance: a lesson run | unit | inside 400 ms, declared first | every lesson inside its budget | **PASS** |
| Performance: a day comparison | unit | inside 2,000 ms | inside | **PASS** |
| Performance: sizing and finance | unit | inside 150 ms | inside | **PASS** |
| Performance: the India comparison | unit | inside 2,500 ms | inside, on all three presets | **PASS** |
| Page load | browser | recorded, not budgeted | 0.6–0.8 s for every page except the two 3D routes, at 4.8 and 5.7 s | **RECORDED** — no budget was declared for these beforehand, so none is claimed now |
| The sub-step cap | unit | refuses, and says what to change | refused, naming the cap and the remedy | **PASS** |
| Rollback exercised | `git revert HEAD` | the previous revision builds and passes | 665 tests passed, 17 routes built | **PASS** |
| Restore exercised | `git reset --hard 9cdca23` | back to the exact tested revision | 672 tests passed, 17 routes built, working tree clean at `9cdca23` | **PASS** |
| Release the exact tested revision | — | the revision above, and no other | **not performed** — no deployment credentials here | **NOT DONE**, deliberately |

### 4. Browser walkthrough

`scratchpad/smoke.mjs` — every route, then all seven lessons played, changed and reset, then the
comparison, then every tab of a quotation. 74 seconds end to end.
`scratchpad/export.mjs` — the offer exported and the file inspected.
`scratchpad/crawl.mjs` — every entity page in the workspace, for 404s and page errors.

### 5. Defects

| # | Defect | Severity | Status |
| --- | --- | --- | --- |
| D60 | The engine declared a cap on how many pieces one run may be advanced in, with a comment about not hanging a browser — and never used it. A solver setting nobody in the interface can reach, but anybody with a console can, took the tab with it. The performance suite found it by hanging. | **critical** | **fixed**; the cap refuses the run and says what to change. It refuses rather than coarsening, because an answer computed at a fidelity nobody asked for is exactly the failure §13.1 is about, and it would be invisible. |
| D61 | The **Offer HTML** button exported nothing unless the offer document tab had already been opened, because the node it reads only exists while that tab is showing. It looked like it worked. | major | **fixed**; it shows the document first, as the print button already did. The exported file is now checked for completeness rather than assumed. |

### 6. Demonstration and rollback

Demo: the smoke script above, or **Quotations** → any quotation → **Offer HTML**, and open the file
that lands.
Rollback: exercised rather than described. `git revert HEAD` on `9cdca23` leaves a tree that passes
665 tests and builds 17 routes; `git reset --hard 9cdca23` restores the tested revision, which
passes 672 and builds 17. Nothing in this release migrates data, so a rollback needs no restore
step beyond the code.

### 7. Decision

**READY FOR ACCEPTANCE — review pending, and the release itself not performed.** Everything S12 can
check here has been checked against `9cdca23`; the four checks that belong to a server this does not
have are recorded as not applicable with what stands in their place. Releasing is a human act, on
that revision and no other.

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

## R3 — the studio answering a five-kilowatt question

Not a stage. A user ran the studio for 5 kW of backup and got one five-megawatt-hour container, a
2 507.5 kW converter and ₹5.55 crore, headed "0.01 MW" and "0.0 MWh", with lessons they described
as having no story. Three complaints, one session, recorded here because none of them is a numbered
goal and all three were real.

**Revision:** `e635415`

### What was wrong, and how it was found

The studio was run across fourteen duties from 5 kW to 100 MW and twelve edge cases, and each was
read against its own cost lines rather than against a summary. Six faults came out of the sweep
that no single design would have shown.

| # | Defect | Severity | Status |
| --- | --- | --- | --- |
| D62 | Every design started from the flagship container because that is what the form held. A 5 kW backup supply came back as one container, a 2 507.5 kW converter and ₹5.55 crore — with warnings attached, which is not the same as an answer. | **critical** | **fixed**; equipment follows the duty unless pinned, and 5 kW now fits one 16 kWh wall rack at ₹3.88 lakh |
| D63 | Every converter carried the flat ₹32.5 lakh allowance the supply offer bundles with a container, whatever it was: 81% of the 5 kW system's price, and about seventy times what a 5 kW hybrid inverter costs. | **critical** | **fixed**; the bundle applies at the 2 507.5 kW it was quoted for and the rate card's per-kW figure elsewhere. The reference container is unchanged at ₹32.5 lakh |
| D64 | The landed build-up charged $68/kWh FOB for every enclosure, so a 261 kWh cabinet cost the same per kilowatt-hour as a 5 MWh container. Cabinets fit a small duty more tightly, so the sizing proposed 46 cabinets where 3 containers were cheaper. | **critical** | **fixed**; the quoted rate applies to the container it was struck for, others scale on the book's own relative rates |
| D65 | Candidates were ranked on the quotation's own scope. Supply-only pays for boxes and nothing else, so 88 cabinets genuinely undercut 5 containers — the 83 extra foundations and commissioning visits appear on nobody's invoice. The studio proposed exactly that for 2.5 MW, and 240 cabinets for 20 MW. | major | **fixed**; candidates are compared at turnkey scope whatever the offer sells |
| D66 | The unit caps that decided when to give up were 24, so every candidate for 50 MW was rejected and the fit silently fell back to the form's own defaults — seventeen transformers chosen by nobody. | major | **fixed**; caps are absurdity bounds now, and cost decides |
| D67 | `pack-16s-314` carries 50 A continuous beside a cabinet its own schedule rates at 5 kW, which at 51.2 V is 98 A. Taken at 50 A the engine refused every small design outright. Every other pack in the schedule is 0.5 C; this one read as 0.16 C. | major | **reconciled to the cabinet rating and marked `assumed`** — it needs confirming against the pack data sheet before issue |
| D68 | No transformer below 1 600 kVA existed, so a 250 kW plant was quoted six times the transformer it wants — ₹37 lakh of iron on a ₹1 crore system. No price at all for the 5 000 kVA converter or the 6 300 kVA transformer. | major | **fixed**; 500 and 1 000 kVA distribution-class units added, and every catalogue product now carries a price |
| D69 | Nothing checked the connection voltage. A 5 kW plant presented 230 V at its inverter terminals while declaring a 33 kV connection. | major | **fixed**; a design says when nothing in it can reach the voltage it claims |
| D70 | Power and energy were written in MW and MWh whatever the number. Five kilowatt-hours of contracted energy read "0.0 MWh" — not a rounding slip but a wrong answer. | major | **fixed**; the unit follows the number, across the workbench, the build sequence and the whole proposal |
| D71 | The equipment selectors read from the form rather than from the design, so the 5 kW page showed a container, a 2 507.5 kW converter and a 3 150 kVA transformer beside a headline correctly reporting one wall rack. | major | **fixed** |
| D72 | §15.1 ends the lesson loop with "Reset, Next lesson, or take it back to the design". There was no next lesson, and nothing said why the seven cards were in that order. | major | **fixed**; three acts, a takeaway per card, and a closing beat written from the run |
| D73 | The price lesson read grid import as the plant's purchases, when it carries the site's load too; and its day starts half full, so the plant could deliver more than it drew and appear to have made energy. | major | **fixed**; the round trip is stated from the losses and the open position is disclosed rather than netted away |

### What the studio now costs, across four orders of magnitude

Delivered equipment, default price book, landed-import basis.

| Duty | Fitted | Installed DC | Capex | ₹/kWh DC |
| --- | --- | --- | --- | --- |
| 5 kW × 1 h backup | 1 × SB51314 rack, 1 × 5 kW | 16 kWh | ₹3.88 L | 24,127 |
| 50 kW × 2 h peak | 1 × SWESLC832V314Ah, 1 × 125 kW | 261 kWh | ₹42.98 L | 16,454 |
| 250 kW × 2 h peak | 5 × SWESLC832V314Ah, 2 × 125 kW, 500 kVA | 1.31 MWh | ₹2.15 cr | 16,498 |
| 1 MW × 4 h microgrid | 23 × SWESLC832V314Ah, 8 × 125 kW, 1 600 kVA | 6.01 MWh | ₹9.38 cr | 15,609 |
| 2.5 MW × 4 h solar | 5 × SWESLC1331.2V314Ah, 1 × 2 507.5 kW, 3 150 kVA | 25.08 MWh | ₹25.01 cr | 9,972 |
| 10 MW × 4 h arbitrage | 11 × SWESLC1331.2V314Ah, 2 × 5 000 kW, 2 × 6 300 kVA | 55.18 MWh | ₹55.83 cr | 10,118 |
| 100 MW × 4 h arbitrage | 110 × SWESLC1331.2V314Ah, 20 × 5 000 kW, 17 × 6 300 kVA | 551.76 MWh | ₹554.79 cr | 10,055 |

Monotone in plant size throughout, and no fitted design on the ladder carries an error-level
warning.

### Checks

| Check | Command | Expected | Observed | Result |
| --- | --- | --- | --- | --- |
| Typecheck | `npx tsc --noEmit` | clean | clean | **PASS** |
| Unit suite | `npm run test` | all pass | **705 passed** (+28 on the S12 baseline) | **PASS** |
| Static export | `npm run build` | 17 routes | 17 routes | **PASS** |
| Scenario sweep | 14 duties, 5 kW → 100 MW | monotone cost, no error-level design | monotone, none | **PASS** |
| Edge cases | 12, including usable-energy mode, 0.25 h, pinned equipment, 500 MW | no throw, no silent fallback | none | **PASS** |
| Reference container | unit | converter unchanged at ₹32.5 lakh | ₹3,250,000 exactly | **PASS** |
| Small-plant documents | unit | no real quantity written as nothing | none in title, configuration table, qualifications or appendix | **PASS** |
| Cold browser walkthrough | 5 kW from the opening question | headline, selectors and price agree | agree; no page error | **PASS** |
| Lesson story | unit + browser | a closing sentence per card, changing with the controls | 7 of 7 | **PASS** |

### The three decisions, and what they changed

Put to the customer with the evidence, and taken. Revision `912c862`.

| Decision | Taken | Effect |
| --- | --- | --- |
| **The 314 Ah rack pack** — the schedule's 50 A against its own cabinet's 5 kW rating | *Check the market.* The standard rate quoted for 314 Ah cells is 0.5 C; published racks in this format carry 150 A continuous or a 200 A BMS, some rate 1 C, and nothing is rated near 50 A | 150 A continuous, 200 A maximum, marked `assumed` until the data sheet lands. The conservative reading of the published range |
| **Augmentation** — oversize on day one, or top up across the term | *Periodic, whatever the duty cycle* | The 2.5 MW / 10 MWh reference opens at 15 MWh and ₹15.28 cr instead of 25 MWh and ₹25.01 cr. `oversize-day1` stays selectable |
| **Scope** — supply-only, turnkey, or both | *Both on the quotation* | The order value stays the equipment at the gate; the installed cost travels beside it, labelled indicative and outside the scope offered |

Showing the installed cost exposed **D74**: the book's lot rates are grid-scale, and ₹27 lakh of
detailed engineering plus ₹4.7 lakh of commissioning per unit charged in full against a 16 kWh wall
battery made its installed cost ₹42 lakh — eleven times the equipment. **Fixed**: engineering
follows the square root of the plant and per-unit services the size of the unit, both floored and
anchored on the reference design so the book's own figures are unchanged where they were set.

### The ladder as it now stands

| Duty | Fitted | Installed DC | Supply-only | Installed | ₹/kWh DC |
| --- | --- | --- | --- | --- | --- |
| 5 kW × 1 h backup | 1 × SB51314 rack, 1 × 5 kW | 16 kWh | ₹3.88 L | ₹5.70 L | 24,127 |
| 50 kW × 2 h peak | 1 × SWESLC832V314Ah, 1 × 125 kW | 261 kWh | ₹42.98 L | ₹56.35 L | 16,454 |
| 250 kW × 2 h peak | 4 × SWESLC832V314Ah, 2 × 125 kW, 500 kVA | 1.05 MWh | ₹1.79 cr | ₹2.25 cr | 17,114 |
| 1 MW × 4 h microgrid | 23 × SWESLC832V314Ah, 8 × 125 kW, 1 600 kVA | 6.01 MWh | ₹9.38 cr | ₹11.64 cr | 15,609 |
| 2.5 MW × 4 h solar | 3 × SWESLC1331.2V314Ah, 1 × 2 507.5 kW, 3 150 kVA | 15.05 MWh | ₹15.28 cr | ₹20.67 cr | 10,155 |
| 10 MW × 4 h arbitrage | 11 × SWESLC1331.2V314Ah, 2 × 5 000 kW, 2 × 6 300 kVA | 55.18 MWh | ₹55.83 cr | ₹74.97 cr | 10,118 |
| 100 MW × 4 h arbitrage | 110 × SWESLC1331.2V314Ah, 20 × 5 000 kW, 17 × 6 300 kVA | 551.76 MWh | ₹554.79 cr | ₹743.33 cr | 10,055 |

Installed cost runs 1.2× to 1.5× the equipment throughout, highest at the small end, which is where
installation is the largest share of a job.

**Checks after the three decisions:** typecheck clean, **711 unit tests pass**, 17 routes export,
and the 5 kW design reads 5 kW / 5 kWh / 16.1 kWh / ₹3.88 L with ₹5.70 L installed beside it.

### R4 — the five-kilowatt correction

The customer's own note on the 5 kW / 1 h design, item by item. Four of the seven were defects.

| # | Raised | Finding | Status |
| --- | --- | --- | --- |
| D75 | "Remove the default 1 × 16.1 kWh enclosure. Select an appropriately sized battery." | The supplied schedule lists SB51100, SB24100 and SB12100 and the catalogue never built an enclosure around any of them, so the smallest thing the studio could propose was a 16 kWh rack. A duty needing 6.1 kWh of nameplate was answered with 16 — an absence of product, not a sizing decision | **fixed**; SB51100 and SB24100 added as systems. 5 kW / 1 h now fits 2 × SB51100 = 10.24 kWh |
| D76 | "Charging duration: calculate separately from charging power and efficiency; do not assume it equals discharge duration." | It was copied from the discharge duration in three places, and the charge power behind it ignored the conversion path entirely: restoring 5 kWh at the meter takes 5 ÷ RTE, so every charge-limited plant was undersized by the round-trip loss | **fixed**; charge power is grossed up for the round trip and the window is derived from the loss chain. `recoveryDurationH` is reported as a result |
| D77 | "Show nominal capacity separately from usable energy." | The page showed nameplate alone. A reader could not tell an oversized plant from a lossy one | **fixed**; nominal and day-one usable both on the headline |
| D78 | "Display 1 × 5 kW PCS. Do not round to 0.01 MW." | The rounding was fixed in R3; the *second converter* was not. A recharge window copied from the discharge asked 5.6 kW of a 5 kW plant and bought a converter to supply it | **fixed** as part of D76 |
| — | "Recalculate the C-rate on the selected battery's nominal capacity" | Already computed from nominal capacity; it read 0.31 C because the nominal capacity was wrong. It now reads 0.49 C on 10.24 kWh | no defect |
| — | "All sizing calculations should run in code" | Already true, and now stated in the contract above | no defect |

**The 5 kW / 1 h design as it now stands:** 5 kW rated, 5 kWh contracted over 1.00 h, **10.24 kWh
nominal** in 2 × SB51100 racks, **5.83 kWh usable on day one**, 1 × PCS 5 kW hybrid, no transformer,
connection at 230 V, **1.12 h to recharge at rated power**, 0.49 C. ₹3.12 lakh delivered, ₹4.67 lakh
installed. It carries `c-rate-margin` and `charge-rate-margin`: two racks give 5.12 kW against a
5 kW duty, so the plant runs at 98% of the pack's continuous rating. That is a real margin and worth
a decision — a third rack removes it.

### R5 — two manufacturer data sheets, and what could be read of them

Two documents were put to the studio to check against: CATL's energy-storage brochure and REPT's
*Energy Storage Battery Solution* brochure. **Neither could be opened.** This environment's network
policy refused both hosts at the egress proxy — `www.catl.com:443` and `www.reptbattero.com:443`
each answered 403 to CONNECT — so nothing was read from either document. Published specification
summaries of the same REPT products were used instead, which is weaker evidence, and the difference
is now recorded rather than smoothed over.

**`src/catalog/sources.ts`** is the register that records it: each external document, how much of it
was actually in front of us (`read`, `secondary`, `unreachable`), and figure by figure what it
corroborates or contradicts. `src/tests/sources.test.ts` holds it to that — a figure must point at
something that exists, a corroboration must still be true of the catalogue as it stands, and a
contradiction must be visible in the file it contradicts, citing the register, rather than noted in
the bibliography and forgotten.

| Published figure | Bears on | Verdict |
| --- | --- | --- |
| 314 A continuous, 628 A peak (314 Ah CB71/CB75) | `pack-16s-314`, at 150 A `assumed` | **corroborates** — 50 A is ruled out, and 150 A is under half what the cell sustains, so the pack and its BMS are the limit, not the chemistry |
| 71 × 173 × 207 mm, 5.60 ± 0.15 kg | `cell-lfp-314` | **corroborates** — within a millimetre and 20 g; the same industry-standard format |
| Internal resistance ≤ 0.3 mΩ | `validation/sam_reference.py RESISTANCE_MOHM` | **contradicts** — see below |
| 10 000 cycles (12 000 ultra-long-life) | `cell-lfp-314`, at 8 000 | **open** — a different manufacturer's cell; ours stays at the supplied, lower figure |
| 20 ft container at 6.26 MWh on 392 Ah cells | `enc-5mwh-20ft`, at 5.015 MWh | **open** — see below |

**The contradiction was ours.** The PySAM harness ran its round-trip band from 0.18 mΩ per cell,
described in the code as *"the published AC impedance for the 314 Ah prismatic in this catalogue"*.
The catalogue carries no impedance field; there was no such published figure. The band now runs from
the one externally published resistance for this format we have — 0.3 mΩ read as if it were already
DC, doubled to 0.6 mΩ for the realistic end, because a data sheet's internal resistance for an LFP
prismatic is normally the 1 kHz AC impedance. The studio's flat 92.6% DC round trip is still on the
conservative side of the ohmic floor in all six validation cases, but the headroom fell by about a
third; `docs/VALIDATION.md` now derives the tightest case and its margin from the run instead of
asserting a crossover in prose.

**"Containers are not made to order."** Put that way, the granularity question stops being about
rounding and becomes answerable: a 20 ft container is a standard product, the ladder moves when the
cell generation moves, and the only honest answer to *why does 5 MWh buy two containers* is what
every rung on that ladder would do with the same duty. `src/sizing/ladder.ts` computes it from the
same cascade that sized the plant — `src/tests/ladder.test.ts` holds the two to the same
kilowatt-hour — and it is on screen under the cascade, unpriced, with the catalogue rung marked as
the only quotable one.

**It also overturns what this register said one section ago.** The claim that the 6.26 MWh container
was *"the real fix for the granularity"* is wrong, and the ladder is how that was found. At 1 MW /
5 MWh:

| Standard size | Reaches the meter | Units | Installed | Beyond the duty |
| --- | ---: | ---: | ---: | ---: |
| 3.44 MWh | 2.36 MWh | 3 | 10.32 MWh | 41% |
| 5.0 MWh | 3.43 MWh | 2 | 10.00 MWh | 37% |
| **5.016 MWh — ours** | **3.44 MWh** | **2** | **10.03 MWh** | **38%** |
| 6.26 MWh | 4.29 MWh | 2 | 12.52 MWh | 72% |
| 6.9 MWh | 4.73 MWh | 2 | 13.80 MWh | 89% |

A single container would have to carry **7.29 MWh** of nameplate to deliver 5 MWh at the connection
in year one — about a fifth of a nameplate goes to the usable window, the depth of discharge, the
path and the auxiliaries before anything reaches a meter. That is larger than anything anyone lists.
Every larger rung still needs two units and leaves *more* nameplate standing idle, not less: the
6.9 MWh container would deliver 89% more than the duty asks for, against 38% for ours. So two
containers is not waste at this size, and buying a bigger box would have been a worse answer.

The ladder does earn its keep higher up: at 5 MW / 25 MWh the 6.26 MWh rung is six units at 3% spare
against eight of ours at 10%. That is where a price for the current generation would be worth
asking for.

**What was not done, and why.** The 6.26 MWh container is still not in the catalogue. There is no
price for it here, and a unit entered at an invented price would move every quotation in the studio
on a number nobody supplied. The same rule that keeps the 8 000-cycle figure in place keeps this out
until a price and a data sheet arrive — but it can now be *named* on screen without being sold,
which was the useful half of adding it.

**Four vendor sites, four refusals.** `catl.com`, `reptbattero.com`, `en.highstar.com` and
`sunwodaenergy.com` are all blocked by this environment's network policy, along with the reseller
listings and the one PDF copy of a Sunwoda data sheet that search turned up. Web search is the only
channel that works, which means every manufacturer figure in the register is `secondary` and none of
it is a data sheet. Highstar is an approved vendor on our own 314 Ah cell and its product page
cannot be read from here. Three independent manufacturers now publish 10 000–12 000 cycles for this
cell format against the 8 000 our schedule carries; that is a question for the supplier, not a
change to make from search results.

### R6 — the two things the build was still missing

Two gaps, both of the same kind: something the code already knew that nothing could see.

**1. The design the studio did not pick.** `fitEquipment` ranks candidates on the money the customer
pays — the quoted scope — and computes the turnkey answer beside it so it can tell when the two are
different plants. That second answer was computed and then dropped: a comment in `sizeSystem` said
*"what else the fit found travels to the rationale"*, and it never did. So the engine knew, at
0.25–1 MW, that a cabinet fleet would be cheaper once installation was in the price, and nobody who
could act on it ever saw it. It now travels on `rationale.cheaperInstalled` and renders under **Why
this much equipment**, with both plants priced on the same installed basis and a line saying which
scope this quotation is on. Shown, not acted on: ranking on a scope nobody is buying is what once
put twenty-five cabinets at ₹10.23 crore against two containers at ₹9.98 crore.

**2. Nothing guarded the browser.** The unit suite proves the engine's arithmetic and says nothing
about the screen; the earlier crawls were done by hand and left no artefact, which is why "every
link is broken" could happen twice. `npm run test:browser` builds the export, serves it the way a
static host would, and drives it:

| Check | What it catches |
| --- | --- |
| Every exported route, discovered rather than listed | A page that stops being written, or starts 404ing an asset |
| No console error, no failed request, no empty shell | A route that returns 200 and renders nothing |
| Every internal link on the landing page resolves | The broken-links complaint, encoded |
| All five project tabs open without a page error | A card that throws only on one tab |
| **The cascade's printed working multiplies out** | The screen and the engine disagreeing |
| The ladder's delivered column rises with nameplate | A table sorted on one column and computed on another |

The fifth is the one worth having. The cascade prints its own arithmetic — `5,016 kWh × 0.9500 ×
0.8500 × 0.9457 − 167 kWh = 3,664 kWh` — and the test parses that line off the rendered page and
multiplies it out. A formatter that drops a factor, a component reading the wrong field, a card
showing the previous design: all of them pass a unit suite and a smoke crawl, and all of them put a
wrong number in front of a buyer. This is the only check in the repository that reads the page back.

It runs against `out/`, so it is its own command rather than part of `npm run test`: a suite that
needs a four-minute build before it can run is a suite people skip if it shares a command with one
that does not.

**Also fixed:** the ladder's closing note fired at one unit, where there is nothing to buy fewer of.

### R7 — the site, read by somebody who knows nothing about batteries

The whole site was walked as a beginner would walk it: every page, every lesson, in order, reading
only what is on the screen. **The honest rating afterwards is 3 out of 10** — conversationally
aware, operationally useless.

| After the whole site, could a beginner… | |
| --- | :---: |
| Say a battery loses a few per cent every pass, and roughly why | **yes** |
| Name four reasons somebody buys one | **yes** |
| Say that something refuses requests, and that it matters | **yes** |
| Separate a megawatt from a megawatt-hour | **no** |
| Say what the converter physically is, or why it sets the power rating | **no** |
| Say what a cell, a pack, a rack and an enclosure are | **no** |
| Read the energy cascade on a design | **no** |
| Say what depth of discharge, the usable window or retention mean | **no** |

The last four are the ones that matter, because they are the studio. A reader can finish all seven
cards and still meet **every word in the cascade cold** — nameplate, usable window, depth of
discharge, retention, deliverable energy. Not one of them is used in a lesson.

**The contract already required the fix and it had not been done.** §15.1: *"Jargon is taught on
first use — the default label is Battery charge level (SOC), not SOC."* The prose honoured that; the
screen did not. The first card shows a converter, auxiliaries, a battery management system, an
energy management system, a reserve floor and a string voltage inside its first minute, and nothing
on the page says what any of them is.

**What was built.** Four things, none of them a gate — §15.1 forbids a tutorial gate and a quiz, and
there is neither:

1. **`src/sim/glossary.ts`** — 25 terms as data: the full name, the abbreviation spelt out, the
   unit, one plain sentence, where the reader first meets it, and which terms that sentence leans
   on. `src/tests/glossary.test.ts` refuses any definition whose prerequisite is introduced later,
   so the list can grow but cannot get out of order. It also ties the glossary to the cascade: every
   step the studio draws must have a word that explains it.
2. **A primer in front of the seven cards** — power × duration = energy, worked, with the point
   that the same 4 MWh is three completely different plants. Not an eighth lesson: §15 fixes the
   catalogue at seven. The whole glossary opens from it.
3. **The words each card introduces, taught before the run** — declared on `story.teaches`, shown
   open by default, because a reader who does not know they are missing words will not open a box
   that says they might. Capped at six a card by test.
4. **Progress and a handover** — which cards are finished, "3 of 7", and Continue going to the first
   card *not* done rather than the last one opened. It is marked on playing a card through to the
   end, not on opening it, and kept in the browser rather than the workspace: one person's reading
   is not a fact about the organisation. At the end, **What you now know** names each thing learned
   beside the screen in the studio that uses it, so the learning does not stay in the lessons.

**Checks:** `src/tests/glossary.test.ts` (7), `src/tests/progress.test.ts` (4, including storage
that is missing, corrupt and full), and `browser/learning.test.ts` (5) which reads the rendered page
— that every glossary term is reachable with its definition, that the first card teaches its own
words with "Battery management system (BMS)" spelt out, and that progress survives a reload.

**Rating with these in place: 6 out of 10.** A reader can now separate power from energy, name what
each box is, and read the cascade. What is still missing is practice — nothing asks them to do
anything and tell them whether they were right, and §15.1's ban on quizzes means that needs a
different shape than a test. That is the next honest increment.

### Still open for a decision

1. **The pack data sheet.** `pack-16s-314` stays `assumed` at 150 A / 200 A until the supplier's
   sheet replaces it — now corroborated in direction by a published 314 A continuous rating for the
   cell format (`src/catalog/sources.ts`), which is not the same as having the sheet. Nothing else
   in the schedule is `assumed`.
2. **jouleWise on a white-labelled proposal**, still open from R2.
3. **The current-generation container.** A 6.25–6.9 MWh 20 ft unit would let a 5 MWh duty buy one
   container instead of two. Needs a data sheet and a landed price before it can enter the
   catalogue; both blocked on documents this environment cannot reach.
4. **Network access for manufacturer documents.** Adding `catl.com` and `reptbattero.com` to the
   environment's allowed domains — or widening its network access level — would let the brochures be
   read directly and the `secondary` entries in the register be upgraded or corrected.

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
