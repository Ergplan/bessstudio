# Roadmap

What the studio can become, in the order it pays back. Items marked **Built** are in the
application today; the rest are sized against the existing architecture so each one is an addition
rather than a rewrite.

*Developed and managed by jouleWise Technologies (www.joulewise.com).*

---

## Built today

| Capability | Where |
|---|---|
| Multi-tenant workspace with roles, membership and an append-only audit trail | `src/platform` |
| Customer, contact and pipeline management with a sales funnel | `src/app/pages/Customers.tsx` |
| Application-led sizing with cohort degradation and augmentation scheduling | `src/sizing/engine.ts` |
| Slider-driven loss chain and an editable year-by-year degradation schedule | `src/app/pages/ProjectDetail.tsx` |
| Landed-import costing: FOB, freight, exchange, duty and clearance, supply-only or turnkey | `src/catalog/pricing.ts` |
| Design checks: C-rate, DC window, ambient, altitude, cooling, throughput, shortfall | `src/sizing/engine.ts` |
| Lifetime economics: cost stack, cash flow, LCOS, NPV, IRR, payback | `src/sizing/finance.ts` |
| Versioned quotations with scope, terms and a one-page summary | `src/quoting`, `src/app/components/Proposal.tsx` |
| Four-page A4 offer document with a generated cut-away, print-to-PDF and HTML export | `src/quoting/offer.ts`, `src/app/components/Offer.tsx` |
| Equipment catalogue and per-organization price book in six currencies | `src/catalog` |
| Parametric 3D container assembly with electrical and coolant routing | `src/domain`, `src/scene` |
| Offline demo workspace so a demonstration never depends on the network | `src/platform/repo.ts` |

---

## Near term — completes the sell/deliver loop

**1. Store what was sent.** The four-page offer prints to PDF and exports as HTML today, but the
file is not kept. Render it server-side on “mark as sent” and store it against the quotation, so the
document a customer holds is always recoverable. Adding a single-line diagram and a site layout
plan to the technical page is the natural next increment.

**2. Approval workflow.** Discount and margin thresholds that route a quotation to an approver
before it can be marked sent, with the decision written to the activity trail. The role model and
`quote.approve` permission are already in place.

**3. Side-by-side option comparison.** Most customer conversations are about two or three
configurations — 2 h against 4 h, liquid against air, augment against oversize. Size several
variants under one project and compare capex, LCOS, footprint and NPV in one table, then quote the
chosen one.

**4. Tariff and load-profile import.** Replace the single demand-charge and energy-price figures
with an uploaded 8760-hour interval file and a tariff structure, then dispatch the battery against
it. This turns peak shaving and arbitrage from a rule of thumb into a simulated result, and it is
the single largest credibility gain available.

**5. Layout planner.** Place enclosures, PCS skids and transformers on a site boundary with
clearances, access roads and fire separation, and return a plot plan and cable schedule. The
geometry engine already computes footprints and service zones.

**6. Email and e-signature.** Send the proposal from the application, track opens, and capture
acceptance. Today a quotation is marked sent by hand.

## Medium term — widens the product

**7. Tender and RFP response mode.** Ingest a tender's technical schedule, map each requirement to
a design check or a scope line, and produce a compliance matrix with deviations. Utility and
government pipelines are won or lost on this document.

**8. Customer portal.** A read-only link per quotation where the customer sees the proposal, the
3D assembly, the degradation curve and the economics, and can ask questions in context. The
studio's presentation mode is most of the front end already.

**9. Grid-code and standards packs.** Region packs (CEA/CERC, IEC 62933, UL 9540A, IEEE 1547, G99,
AS 4777) that add jurisdiction-specific checks, required tests and document lists to the design
review, and drive the scope statements on the quotation.

**10. Live fleet telemetry.** Once a project is commissioned, stream state of charge, temperature,
cycles and measured capacity back against the record and plot actual against modelled degradation.
This closes the loop on the ageing model and turns the warranty into something observable — and it
is the foundation for a recurring-revenue service contract.

**11. Manufacturing and supply handover.** Convert a won quotation into a production order: cell
and pack demand against line capacity, long-lead items, serial number allocation and a delivery
schedule. For a vertically integrated manufacturer this connects the front end to the factory.

**12. Augmentation and warranty ledger.** Track each cohort's installed date, measured retention
and remaining warranty throughput, and forecast the next augmentation across the whole fleet rather
than one project at a time.

## Longer term — differentiates

**13. Optimiser.** Rather than sizing to an input, search the catalogue for the configuration that
minimises LCOS or maximises NPV subject to footprint, budget, grid limit and C-rate constraints.
All the constraints are already expressed in the engine.

**14. Degradation model calibration.** Replace the catalogue anchors with per-supplier warranty
curves and, once telemetry exists, fit the model to observed fleet behaviour.

**15. Hybrid plant modelling.** Co-locate solar and wind generation with the storage and model
curtailment recovery, DC coupling, shared inverters and export limits. The Solarworld EPC and
module business makes this the natural adjacency.

**16. Carbon and ESG reporting.** Embodied carbon per configuration, avoided emissions over the
project life, and the reporting lines that tender documents increasingly require.

**17. Second-life and end-of-life.** Residual value of retired cohorts, recycling cost and the
take-back obligations that are entering procurement terms.

**18. Offline field mode and mobile.** A service engineer's view of the commissioned fleet that
works without connectivity and reconciles on reconnect.

---

## Data the studio is still missing

These came up while wiring in the supplied workbooks and would each remove an assumption:

- **Measured degradation per cell vendor.** The schedule in use is one curve. Highstar, Ganfeng,
  Cornex and Cospower will each warrant something different, and the quotation should say which.
- **PCS DC window per approved vendor.** The offer lists five converter brands without ratings,
  which is why the 1 518.4 V finding cannot yet be closed against a specific model.
- **Auxiliary load against ambient.** 0.5 MWh/day each way is a single figure; HVAC draw at 45 °C
  in Bikaner is not the draw at 22 °C in Vilnius.
- **Freight and duty by destination.** One ocean-freight percentage and one duty rate cover every
  market today.
- **Pack and enclosure masses.** Taken as indicative for everything except the 104S pack.

## Platform work that supports the above

- **Firestore transactions and server-side numbering.** Quote numbers are allocated on the client
  today, which is safe for one user but will collide across a sales team. Move allocation to a
  counter document in a transaction, or to a Cloud Function.
- **Cloud Functions** for scheduled work: quotation expiry, pipeline digests, PDF rendering and
  outbound email.
- **Firebase Storage** for logos, customer attachments, tender documents and generated PDFs.
- **Invitation flow.** Adding a member currently requires a Firebase console step. A signed
  invitation link with a pending-member document closes that gap.
- **Rules test suite** using `@firebase/rules-unit-testing`, run in CI against the emulator.
- **Observability.** Firebase Analytics and Performance Monitoring, plus error reporting, so a
  failed sizing run in the field is visible.
- **Localisation.** The Indian, Gulf and European pipelines each want their own language, number
  format and paper size.
