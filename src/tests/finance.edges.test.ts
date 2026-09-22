import { describe, expect, it } from 'vitest';
import { defaultSizingInput, sizeSystem, type SizingInput } from '../sizing/engine';
import { annualBenefitUsd, chargingEnergyMWh, costLines, evaluateFinance } from '../sizing/finance';
import { defaultPriceBook, type PriceBook } from '../catalog/pricing';
import { applications } from '../sizing/applications';
import { energySchedule, offerTotals } from '../quoting/offer';

/**
 * The finance model, checked against itself.
 *
 * Every figure on the economics tab is derived from the cash-flow table beside it. Where a
 * headline number is computed by a second route — a discount rate applied twice, an escalation
 * applied to the wrong base — the table and the headline disagree and the reader trusts neither.
 * These tests rebuild each headline from the rows and require the two to meet.
 */

const sized = (over: Partial<SizingInput> = {}) => sizeSystem({ ...defaultSizingInput(), ...over });
const book = (over: Partial<PriceBook> = {}): PriceBook => ({ ...defaultPriceBook, ...over });
const npvOf = (rate: number, flows: number[]) => flows.reduce((s, f, t) => s + f / (1 + rate) ** t, 0);

describe('the cost stack', () => {
  it('stacks contingency, margin and tax in that order and in that order only', () => {
    const s = sized();
    for (const pb of [book(), book({ contingencyPct: 0, marginPct: 0, taxPct: 0 }), book({ contingencyPct: 12, marginPct: 20, taxPct: 18 }), book({ supplyScope: 'turnkey', taxPct: 18 }), book({ costingMode: 'direct', supplyScope: 'turnkey' })]) {
      const f = evaluateFinance(s, pb);
      const stacked = f.subtotalUsd * (1 + pb.contingencyPct / 100) * (1 + pb.marginPct / 100) * (1 + pb.taxPct / 100);
      expect(f.capexUsd).toBeCloseTo(stacked, 6);
      expect(f.capexUsd).toBeCloseTo(f.subtotalUsd + f.contingencyUsd + f.marginUsd + f.taxUsd, 6);
      expect(f.subtotalUsd).toBeCloseTo(f.equipmentUsd + f.bopUsd + f.servicesUsd, 6);
    }
  });

  it('gives every line a total that is its quantity times its rate', () => {
    for (const pb of [book(), book({ costingMode: 'direct', supplyScope: 'turnkey' }), book({ landed: { ...defaultPriceBook.landed, pcsBasis: 'per-installed-kw' } })]) {
      for (const l of costLines(sized({ powerMW: 12, durationH: 4 }), pb)) {
        expect(l.totalUsd, `${pb.costingMode} ${l.id}`).toBeCloseTo(l.quantity * l.unitCostUsd, 6);
        expect(l.quantity, `${pb.costingMode} ${l.id} quantity`).toBeGreaterThan(0);
      }
    }
  });

  it('charges more for a bigger plant, every time', () => {
    let previous = 0;
    for (const powerMW of [1, 2, 5, 10, 25, 50, 100]) {
      const capex = evaluateFinance(sized({ powerMW }), defaultPriceBook).capexUsd;
      expect(capex, `${powerMW} MW`).toBeGreaterThan(previous);
      previous = capex;
    }
  });

  it('moves capex with the margin and nothing else', () => {
    const s = sized();
    const low = evaluateFinance(s, book({ marginPct: 5 })), high = evaluateFinance(s, book({ marginPct: 25 }));
    expect(high.capexUsd).toBeGreaterThan(low.capexUsd);
    expect(high.subtotalUsd).toBeCloseTo(low.subtotalUsd, 6);
  });
});

describe('the cash flow', () => {
  const s = sized({ powerMW: 10, durationH: 4 });
  const f = evaluateFinance(s, defaultPriceBook);

  it('starts with the capex and nothing else', () => {
    const y0 = f.rows[0];
    expect(y0.year).toBe(0);
    expect(y0.capexUsd).toBeCloseTo(f.capexUsd, 6);
    expect(y0.benefitUsd).toBe(0);
    expect(y0.opexUsd).toBe(0);
    expect(y0.chargingUsd).toBe(0);
    expect(y0.netUsd).toBeCloseTo(-f.capexUsd, 6);
  });

  it('nets, discounts and accumulates each row consistently', () => {
    let running = 0;
    const r = defaultPriceBook.discountRatePct / 100;
    for (const row of f.rows) {
      expect(row.netUsd, `year ${row.year} net`).toBeCloseTo(row.benefitUsd - row.opexUsd - row.chargingUsd - row.capexUsd, 6);
      expect(row.discountedUsd, `year ${row.year} discounted`).toBeCloseTo(row.netUsd / (1 + r) ** row.year, 6);
      running += row.netUsd;
      expect(row.cumulativeUsd, `year ${row.year} cumulative`).toBeCloseTo(running, 6);
    }
    expect(f.rows.map(x => x.year)).toEqual(f.rows.map((_, i) => i));
  });

  it('escalates operating cost at inflation and nothing faster', () => {
    const infl = defaultPriceBook.inflationPct / 100;
    // Operating cost tracks the installed fleet, which augmentation grows, so the ratio is only
    // exact across years where no augmentation landed.
    const years = f.rows.filter(x => x.year > 0);
    for (let i = 1; i < years.length; i++) {
      if (f.rows[years[i].year].capexUsd > 0) continue;
      expect(years[i].opexUsd / years[i - 1].opexUsd, `year ${years[i].year}`).toBeCloseTo(1 + infl, 3);
    }
  });

  it('carries every augmentation into the year it lands in', () => {
    const aug = sizeSystem({ ...defaultSizingInput(), powerMW: 10, durationH: 4, augmentation: 'periodic', projectYears: 20 });
    const fa = evaluateFinance(aug, defaultPriceBook);
    expect(aug.augmentations.length).toBeGreaterThan(0);
    for (const a of aug.augmentations) expect(fa.rows[a.year].capexUsd, `augmentation in year ${a.year}`).toBeGreaterThan(0);
    const scheduled = new Set(aug.augmentations.map(a => a.year));
    for (const row of fa.rows) if (row.year > 0 && !scheduled.has(row.year)) expect(row.capexUsd, `year ${row.year}`).toBe(0);
    expect(fa.augmentationUsd).toBeCloseTo(fa.rows.filter(x => x.year > 0).reduce((t, x) => t + x.capexUsd, 0), 6);
  });

  it('buys a later augmentation at a lower price than the same units today', () => {
    const aug = sizeSystem({ ...defaultSizingInput(), powerMW: 10, durationH: 4, augmentation: 'periodic' });
    const declining = evaluateFinance(aug, book({ batteryPriceDeclinePct: 8 })).augmentationUsd;
    const flat = evaluateFinance(aug, book({ batteryPriceDeclinePct: 0 })).augmentationUsd;
    expect(declining).toBeLessThan(flat);
  });
});

describe('the headline numbers', () => {
  const s = sized({ powerMW: 10, durationH: 4 });

  it('discounts the net flows once to reach the net present value', () => {
    for (const discountRatePct of [0, 4, 9, 20]) {
      const f = evaluateFinance(s, book({ discountRatePct }));
      expect(f.npvUsd, `${discountRatePct}%`).toBeCloseTo(npvOf(discountRatePct / 100, f.rows.map(x => x.netUsd)), 4);
      expect(f.npvUsd, `${discountRatePct}%`).toBeCloseTo(f.rows.reduce((t, x) => t + x.discountedUsd, 0), 4);
    }
    expect(evaluateFinance(s, book({ discountRatePct: 0 })).npvUsd)
      .toBeGreaterThan(evaluateFinance(s, book({ discountRatePct: 20 })).npvUsd);
  });

  it('returns an internal rate of return that actually zeroes the flows', () => {
    for (const pb of [book(), book({ energySellPerMWh: 260 }), book({ demandChargePerKWMonth: 40 })]) {
      const f = evaluateFinance(s, pb);
      if (f.irrPct === null) continue;
      expect(Math.abs(npvOf(f.irrPct / 100, f.rows.map(x => x.netUsd))) / f.capexUsd, 'residual at the IRR').toBeLessThan(1e-3);
    }
  });

  it('refuses an internal rate of return for a project that never returns anything', () => {
    const f = evaluateFinance(s, book({ demandChargePerKWMonth: 0, energySellPerMWh: 0, capacityPaymentPerKWYear: 0, dieselPerLitre: 0 }));
    expect(f.rows.filter(x => x.year > 0).every(x => x.netUsd <= 0)).toBe(true);
    expect(f.irrPct).toBeNull();
    expect(f.paybackYears).toBeNull();
    expect(f.npvUsd).toBeLessThan(0);
  });

  it('puts payback where the cumulative cash flow crosses zero', () => {
    const f = evaluateFinance(s, book({ demandChargePerKWMonth: 40 }));
    expect(f.paybackYears).not.toBeNull();
    const t = f.paybackYears!;
    const before = f.rows[Math.floor(t)], after = f.rows[Math.floor(t) + 1];
    expect(before.cumulativeUsd, 'still under water the year before').toBeLessThan(0);
    expect(after.cumulativeUsd, 'above water the year after').toBeGreaterThanOrEqual(0);
    // Straight-line between the two years it sits between.
    const interpolated = before.cumulativeUsd + (t - before.year) * (after.cumulativeUsd - before.cumulativeUsd);
    expect(Math.abs(interpolated) / f.capexUsd, 'crossing lands on zero').toBeLessThan(1e-6);
  });

  it('builds the levelised cost from the same rows it prints', () => {
    for (const discountRatePct of [0, 9, 15]) {
      const f = evaluateFinance(s, book({ discountRatePct }));
      const r = discountRatePct / 100;
      const cost = f.rows.reduce((t, x) => t + (x.capexUsd + x.opexUsd + x.chargingUsd) / (1 + r) ** x.year, 0);
      const energy = f.rows.reduce((t, x) => t + x.dischargedMWh / (1 + r) ** x.year, 0);
      expect(f.lcosPerMWhUsd, `${discountRatePct}%`).toBeCloseTo(cost / energy, 6);
      expect(f.lcosPerMWhUsd, `${discountRatePct}%`).toBeGreaterThan(0);
    }
  });

  it('raises the levelised cost when the energy to charge with costs more', () => {
    const cheap = evaluateFinance(s, book({ chargeSource: 'grid', energyBuyPerMWh: 20 }));
    const dear = evaluateFinance(s, book({ chargeSource: 'grid', energyBuyPerMWh: 200 }));
    expect(dear.lcosPerMWhUsd).toBeGreaterThan(cheap.lcosPerMWhUsd);
    // Charging is a cost, never a benefit: the revenue side must not move with it.
    expect(dear.annualBenefitUsd).toBeCloseTo(cheap.annualBenefitUsd, 6);
  });

  it('counts the energy it says it delivers', () => {
    const f = evaluateFinance(s, defaultPriceBook);
    expect(f.lifetimeDischargeMWh).toBeCloseTo(f.rows.reduce((t, x) => t + x.dischargedMWh, 0), 6);
    expect(f.lifetimeDischargeMWh).toBeCloseTo(s.years.reduce((t, y) => t + y.deliveredMWh, 0), 6);
  });
});

describe('revenue and charging, for every duty the platform offers', () => {
  it('prices a benefit and a charging bill for every application, both finite and neither negative', () => {
    for (const app of applications) {
      const s = sizeSystem(defaultSizingInput(app.id));
      const benefit = annualBenefitUsd(s, defaultPriceBook);
      expect(Number.isFinite(benefit), app.name).toBe(true);
      expect(benefit, app.name).toBeGreaterThan(0);
      for (const y of s.years.filter(y => y.year > 0)) {
        const mwh = chargingEnergyMWh(s, y);
        expect(Number.isFinite(mwh), `${app.name} year ${y.year}`).toBe(true);
        expect(mwh, `${app.name} year ${y.year}`).toBeGreaterThanOrEqual(0);
        // Nobody buys more energy than the plant can put in, plus the wheeling gross-up.
        expect(mwh, `${app.name} year ${y.year} against charge energy`).toBeLessThanOrEqual(y.chargeMWh * 2 + 1e-6);
      }
    }
  });

  it('still buys the auxiliary energy an idle plant consumes, and only that', () => {
    // Thermal management, the BMS and the controller do not stop because nobody is cycling the
    // plant. With no cycles there is nothing to put back in, so the whole charging bill is the
    // auxiliary load, grossed up for wheeling like any other imported unit.
    const idle = sized({ cyclesPerDay: 0 });
    const grossUp = 1 / (1 - idle.input.losses.openAccessLoss);
    for (const y of idle.years.filter(y => y.year > 0)) {
      expect(y.deliveredMWh, `year ${y.year} delivered`).toBeCloseTo(0, 6);
      expect(y.chargeMWh, `year ${y.year} charge`).toBeGreaterThan(0);
      expect(chargingEnergyMWh(idle, y), `year ${y.year} bought`).toBeCloseTo(y.chargeMWh * grossUp, 6);
    }
  });

  it('buys more energy the harder the plant is worked', () => {
    let previous = 0;
    for (const cyclesPerDay of [0, 0.5, 1, 2, 4]) {
      const s = sized({ cyclesPerDay });
      const bought = chargingEnergyMWh(s, s.years[1]);
      expect(bought, `${cyclesPerDay} cycles a day`).toBeGreaterThan(previous);
      previous = bought;
    }
  });
});

describe('the performance table a customer is handed', () => {
  /**
   * Each column has to multiply into the next. A reader who takes the annual cycles beside the
   * energy dispatched in one of them must arrive at the energy supplied — otherwise the first
   * thing anyone checks on the document is the first thing that fails.
   */
  it('multiplies out, on every duty and both augmentation strategies', () => {
    for (const app of applications) for (const augmentation of ['none', 'periodic', 'oversize-day1'] as const) {
      const s = sizeSystem({ ...defaultSizingInput(app.id), augmentation });
      for (const r of energySchedule(s).filter(r => r.year > 0)) {
        const byHand = r.cycles! * r.usablePerCycleMWh / 1000;
        // The cycle count is printed as a whole number, so the reader's arithmetic can differ by
        // the half cycle that rounding moved — on a standby duty of seventeen cycles a year that
        // is three percent, and it is the only difference there is allowed to be.
        const slack = 0.5 * r.usablePerCycleMWh / 1000;
        expect(Math.abs(byHand - r.suppliedGWh), `${app.name} / ${augmentation} year ${r.year}`).toBeLessThanOrEqual(slack + 1e-9);
      }
    }
  });

  it('adds its own columns to the totals it prints', () => {
    const s = sizeSystem({ ...defaultSizingInput(), augmentation: 'periodic' });
    const rows = energySchedule(s).filter(r => r.year > 0), totals = offerTotals(s);
    expect(totals.cycles).toBe(rows.reduce((t, r) => t + r.cycles!, 0));
    expect(totals.suppliedGWh).toBeCloseTo(rows.reduce((t, r) => t + r.suppliedGWh, 0), 9);
    expect(totals.chargingGWh).toBeCloseTo(rows.reduce((t, r) => t + r.chargingGWh, 0), 9);
    // Nobody puts less in than they take out.
    expect(totals.chargingGWh).toBeGreaterThan(totals.suppliedGWh);
  });

  it('never dispatches more per cycle than the plant can usably hold', () => {
    for (const augmentation of ['none', 'periodic', 'oversize-day1'] as const) {
      const s = sizeSystem({ ...defaultSizingInput(), augmentation, powerMW: 8, durationH: 3 });
      for (const y of s.years.filter(y => y.year > 0)) {
        expect(y.deliveredPerCycleMWh, `${augmentation} year ${y.year}`).toBeLessThanOrEqual(Math.max(y.usableMWh, s.requiredUsableMWh) + 1e-9);
        expect(y.deliveredPerCycleMWh, `${augmentation} year ${y.year}`).toBeGreaterThan(0);
      }
    }
  });
});
