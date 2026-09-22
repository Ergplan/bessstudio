# BESS Studio — stage register

The live record of the build defined in [`docs/SITE.md` §17](./SITE.md#17-how-this-gets-built).
`SITE.md` is the contract; this file is what actually happened.

> **Nothing here has been built or tested.** Every stage below is `PLANNED`. No stage has been
> accepted, no fixture has been run, and writing a check into this file is not evidence that it
> passed. All proposed tests are **NOT RUN**.

**Delivery states:** PLANNED → BUILDING → TESTING → READY FOR ACCEPTANCE → ACCEPTED, and **BLOCKED**
when a prerequisite or a mandatory check fails.

**To start a stage**, use the instruction in [§17.3](./SITE.md#173-the-instruction-to-start-a-stage).

---

## Register

| Stage | Goal | Depends on | State | Accepted | Evidence |
| --- | --- | --- | --- | --- | --- |
| **S0** | Baseline and acceptance contract | — | `PLANNED` | — | — |
| **S1** | Finish the quoting tool | S0 | `PLANNED` | — | — |
| **S2** | Model contracts and evidence | S1 | `PLANNED` | — | — |
| **S3** | First charge/discharge lesson | S2 | `PLANNED` | — | — |
| **S4** | PCS and BMS behaviour | S3 | `PLANNED` | — | — |
| **S5** | jouleWise ergOS EMS | S4 | `PLANNED` | — | — |
| **S6** | Lessons 1–6 | S5 | `PLANNED` | — | — |
| **S7** | Contract-demand UPS sizing | S6 | `PLANNED` | — | — |
| **S8** | Lead-acid versus LFP | S7 | `PLANNED` | — | — |
| **S9** | Indian conditions and lifecycle cost | S8 | `PLANNED` | — | — |
| **S10** | Synchronised 3D *(deferrable)* | S9 | `PLANNED` | — | — |
| **S11** | Project and quotation integration | S10 | `PLANNED` | — | — |
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
| Opening experience unchanged — landing, opening question, build sequence | `src/app/landing/`, `src/app/pages/Start.tsx` | manual; no stage may modify these |
| Sales cannot approve its own quotation | `src/quoting/lifecycle.ts`, `firestore.rules` | 18 unit + 35 rules tests |
| A customer sees only their own records | `src/platform/workspace.tsx`, `firestore.rules` | rules tests |
| Pricing requires a verified email | `src/platform/types.ts`, `firestore.rules` | rules tests |
| A role cannot be minted — invitation names it, or it is `customer` | `firestore.rules` | rules tests |
| Audit trail append-only, under the writer's own name | `firestore.rules` | rules tests |
| Sizing reproduces the supplied workbooks | `src/sizing/`, `src/catalog/pricing.ts` | 103 unit tests |

Baseline commands:

```bash
npm run test        # 103 unit tests
npm run test:rules  # 35 Firestore rules tests, against the emulator
npm run build       # static export
```

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
