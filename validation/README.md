# Checking the sizing engine against something that is not it

Two ways of not taking the engine's word for it.

## `npm run audit` — ten sizes, line by line

Writes [`docs/SIZING-AUDIT.md`](../docs/SIZING-AUDIT.md): every step from the two numbers a person
types to the quantity of equipment on the invoice, for ten duties from five kilowatts to fifty
megawatts. Needs nothing installed.

Assertions catch a rule being broken. This catches a rule that was never right, by putting the whole
chain on one page where it can be followed by hand. Its first run found four faults: a granularity
figure measured on the wrong chain, auxiliary consumption on the air-cooled racks a hundred times
what a management board draws, converter rounding that appeared nowhere, and an auxiliary allowance
that turned 1.87 enclosures into 3 with nothing on the page to say so.

## `npm run validate` — the same cases through NREL SAM

Writes [`docs/VALIDATION.md`](../docs/VALIDATION.md). Needs `pip install nrel-pysam` (47 MB), which
is why it is not part of `npm test`: a suite that fails when an optional dependency is missing is a
suite people learn to skip.

1. `export-cases.test.ts` writes `cases.json` — the studio's own answers and every assumption behind
   them, in a form another model can be asked the same questions in.
2. `sam_reference.py` configures SAM's battery from the studio's own catalogue — the same cell, the
   same string geometry, the same state-of-charge window, the same temperature — and writes
   `sam.json`.
3. `compare.py` joins them, reports the divergence against tolerances declared ahead of the
   measurement, and exits non-zero if a check that should agree does not.

**SAM is not the authority.** It is a second implementation written from a different starting point,
and where two such implementations disagree the disagreement names an assumption somebody has to
own. Some of those assumptions are SAM's: its `BatteryStateful` models ohmic loss and nothing else,
so on round-trip efficiency it gives a floor on the loss rather than a verdict, and its three
lifetime models disagree with each other by twenty points at year twenty. The report says so where
it matters rather than presenting a single number as settled.

Anything only one of the two models computes — equipment selection, landed cost, augmentation
scheduling and quotations on the studio's side; weather, irradiance and market dispatch on SAM's —
is listed as not compared rather than guessed at.

Both reports are committed, so the divergence is in the repository for somebody who has installed
neither.
