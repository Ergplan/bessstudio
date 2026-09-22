# BESS Studio — stage register

The live record of the build defined in [`docs/SITE.md` §17](./SITE.md#17-how-this-gets-built).
`SITE.md` is the contract; this file is what actually happened.

> **S0 is complete and ready for acceptance.** S1 onward are `PLANNED` — not built, not tested.
> No simulation fixture (F01–F08) has been run; writing a check into this file is not evidence that
> it passed.

**Delivery states:** PLANNED → BUILDING → TESTING → READY FOR ACCEPTANCE → ACCEPTED, and **BLOCKED**
when a prerequisite or a mandatory check fails.

**To start a stage**, use the instruction in [§17.3](./SITE.md#173-the-instruction-to-start-a-stage).

---

## Register

| Stage | Goal | Depends on | State | Accepted | Evidence |
| --- | --- | --- | --- | --- | --- |
| **S0** | Baseline and acceptance contract | — | **`READY FOR ACCEPTANCE`** | review pending | [packet](#s0--baseline-and-acceptance-contract) |
| **S1** | Finish the quoting tool | S0 | `PLANNED` | — | — |
| **S2** | Model contracts and evidence | S1 | `PLANNED` | — | — |
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
| A customer sees only their own records | `src/platform/workspace.tsx`, `firestore.rules` | rules tests |
| Pricing requires a verified email | `src/platform/types.ts`, `firestore.rules` | rules tests |
| A role cannot be minted — invitation names it, or it is `customer` | `firestore.rules` | rules tests |
| Audit trail append-only, under the writer's own name | `firestore.rules` | rules tests |
| Sizing reproduces the supplied workbooks | `src/sizing/`, `src/catalog/pricing.ts` | 103 unit tests |

Baseline commands:

```bash
npm run test        # 110 unit tests
npm run test:rules  # 38 Firestore rules tests, against the emulator
npm run build       # static export
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
