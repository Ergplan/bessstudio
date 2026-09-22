import { describe, expect, it } from 'vitest';
import {
  crossoverYear, defaultDiscounting, inr, ledgerFor, replacementYears, totals, unstatedTax,
  type CostAssumptions, type LedgerLine,
} from '../sim/lifecycle';
import {
  TARIFF_LABEL, batteryTempC, compareInIndia, illustrativeCosts, indiaPresets, presetById,
  quotedCosts, teachingTariffs,
} from '../sim/india';

/**
 * S9 — Indian operating conditions and what they cost, and F07.
 *
 * The fixture is a small ledger checked by hand, because §18 is explicit that live market data is
 * never the only reproducible financial fixture. Everything else here is about the ways a lifecycle
 * comparison is normally rigged: a missing price counted as free, a replacement interval assumed
 * rather than evidenced, and a crossover found because one was wanted.
 */

/* --------------------------------------------------------------------- F07 -- */

describe('F07 — a small ledger, checked by hand', () => {
  /**
   * Expected, stated before the run. A ledger of four lines:
   *   year 0  −1,000,000  initial cost
   *   year 5    −400,000  one replacement
   *   years 1–10  −50,000 a year  annual expenses
   *   year 10   +100,000  terminal residual
   *
   * Undiscounted: 1,000,000 + 400,000 + 500,000 − 100,000 = **1,800,000**.
   * At 10% real: 1,000,000 + 400,000/1.1^5 + 50,000 × Σ(1/1.1^n, n=1..10) − 100,000/1.1^10
   *            = 1,000,000 + 248,368.53 + 307,228.36 − 38,554.33 = **1,517,042.56**.
   * Tolerance: 1e-6 relative. Every term is a closed-form sum.
   */
  const ledger: LedgerLine[] = [
    { year: 0, category: 'equipment', label: 'Initial cost', inr: 1_000_000, basis: 'Fixture.' },
    { year: 5, category: 'replacement', label: 'One replacement', inr: 400_000, basis: 'Fixture.' },
    ...Array.from({ length: 10 }, (_, i): LedgerLine => ({
      year: i + 1, category: 'amc', label: 'Annual expenses', inr: 50_000, basis: 'Fixture.',
    })),
    { year: 10, category: 'residual', label: 'Terminal residual', inr: -100_000, basis: 'Fixture.' },
  ];

  it('totals undiscounted to the hand-checked figure', () => {
    const t = totals(ledger, 10, { basis: 'real', ratePerYear: 0.1, escalationPerYear: 0 });
    expect(t.undiscountedInr).toBeCloseTo(1_800_000, 6);
  });

  it('discounts to the hand-checked figure', () => {
    const t = totals(ledger, 10, { basis: 'real', ratePerYear: 0.1, escalationPerYear: 0 });
    // Computed independently of the implementation.
    let annuity = 0;
    for (let n = 1; n <= 10; n++) annuity += 1 / 1.1 ** n;
    const expected = 1_000_000 + 400_000 / 1.1 ** 5 + 50_000 * annuity - 100_000 / 1.1 ** 10;
    expect(expected).toBeCloseTo(1_517_042.56, 2);
    expect(t.discountedInr).toBeCloseTo(expected, 6);
  });

  it('agrees with the undiscounted total at a zero discount rate', () => {
    const t = totals(ledger, 10, { basis: 'real', ratePerYear: 0, escalationPerYear: 0 });
    expect(t.discountedInr).toBeCloseTo(t.undiscountedInr, 9);
    expect(t.discountedInr).toBeCloseTo(1_800_000, 6);
  });

  it('runs its cumulative total year by year, for a crossover to be read from', () => {
    const t = totals(ledger, 10, defaultDiscounting());
    expect(t.byYear).toHaveLength(11);
    expect(t.byYear[0].cumulativeDiscountedInr).toBeCloseTo(1_000_000, 6);
    for (let i = 1; i < t.byYear.length; i++) {
      expect(t.byYear[i].cumulativeDiscountedInr)
        .toBeCloseTo(t.byYear[i - 1].cumulativeDiscountedInr + t.byYear[i].discountedInr, 6);
    }
    expect(t.byYear[10].cumulativeDiscountedInr).toBeCloseTo(t.discountedInr, 6);
  });

  it('shows no crossover where there is none', () => {
    // The same ledger against one that is cheaper at every year: it never crosses, and the answer
    // to "which year does it cross" is that it does not.
    const cheaper = ledger.map(l => ({ ...l, inr: l.inr === null ? null : l.inr * 0.5 }));
    const a = totals(ledger, 10, defaultDiscounting());
    const b = totals(cheaper, 10, defaultDiscounting());
    expect(crossoverYear(a, b)).toBeNull();
  });

  it('finds the crossover where there is one, and names the year', () => {
    // A cheaper start with a heavier replacement crosses the other way part way through.
    const cheapStart: LedgerLine[] = [
      { year: 0, category: 'equipment', label: 'Initial cost', inr: 400_000, basis: 'Fixture.' },
      { year: 3, category: 'replacement', label: 'Replacement', inr: 400_000, basis: 'Fixture.' },
      { year: 6, category: 'replacement', label: 'Replacement', inr: 400_000, basis: 'Fixture.' },
      { year: 9, category: 'replacement', label: 'Replacement', inr: 400_000, basis: 'Fixture.' },
    ];
    const dear: LedgerLine[] = [{ year: 0, category: 'equipment', label: 'Initial cost', inr: 1_000_000, basis: 'Fixture.' }];
    // Cumulative at 10%: 400,000 at year 0; 700,527 after the first replacement; 926,315 after the
    // second; 1,095,950 after the third — so it passes the flat million in year nine, not before.
    const year = crossoverYear(totals(cheapStart, 10, defaultDiscounting()), totals(dear, 10, defaultDiscounting()));
    expect(year).not.toBeNull();
    expect(year).toBe(9);
  });

  it('escalates recurring costs and not capital ones', () => {
    const t = totals(ledger, 10, { basis: 'real', ratePerYear: 0, escalationPerYear: 0.05 });
    // Only the ten annual lines escalate: the capital and residual lines are untouched.
    let annual = 0;
    for (let n = 1; n <= 10; n++) annual += 50_000 * 1.05 ** n;
    expect(t.undiscountedInr).toBeCloseTo(1_000_000 + 400_000 + annual - 100_000, 6);
  });
});

describe('a missing price is not a zero', () => {
  const withGaps: LedgerLine[] = [
    { year: 0, category: 'equipment', label: 'Store', inr: null, basis: 'A dated quotation is required.' },
    { year: 0, category: 'integration', label: 'Conversion', inr: 500_000, basis: 'Fixture.' },
  ];

  it('lists what it could not price, and says the total is incomplete', () => {
    const t = totals(withGaps, 10, defaultDiscounting());
    expect(t.undiscountedInr).toBe(500_000);
    expect(t.complete).toBe(false);
    expect(t.unknown).toHaveLength(1);
    expect(t.unknown[0].basis).toMatch(/dated quotation is required/i);
    expect(t.notes.join(' ')).toMatch(/incomplete/i);
  });

  it('says a complete total is complete', () => {
    const t = totals(withGaps.map(l => ({ ...l, inr: l.inr ?? 1 })), 10, defaultDiscounting());
    expect(t.complete).toBe(true);
    expect(t.notes.join(' ')).toMatch(/every line carries a price/i);
  });

  it('claims no market price by default, on either chemistry', () => {
    const costs = illustrativeCosts(9);
    expect(costs.batteryInrPerKWh).toBeNull();
    expect(costs.conversionInrPerKW).toBeNull();
    expect(costs.disposalInrPerKg).toBeNull();
    expect(costs.residualFraction).toBeNull();
    expect(costs.tax.gstRate).toBeNull();
    expect(costs.tax.inputCreditEligible).toBeNull();
    expect(costs.tax.note).toMatch(/no GST rate is assumed/i);
  });
});

describe('replacement timing on evidence, not on convention', () => {
  it('takes a modelled life where there is one', () => {
    expect(replacementYears({ kind: 'modelled', years: 3.5, basis: '' }, 10)).toEqual([4, 8]);
    expect(replacementYears({ kind: 'modelled', years: 12, basis: '' }, 10)).toEqual([]);
  });

  it('compares declared cases where there is none, rather than picking a number', () => {
    const evidence = { kind: 'sensitivity' as const, cases: [8, 10, 12], basis: '' };
    // The shortest declared case is the one the base ledger carries, and the others are there to
    // be compared — the point being that the number was declared rather than assumed.
    expect(replacementYears(evidence, 15)).toEqual([8]);
  });

  it('has no rule that says lead-acid every three years and lithium every ten', () => {
    const cool = compareInIndia({ protectedKW: 225, autonomyMinutes: 15, preset: presetById('conditioned-office') });
    const warm = compareInIndia({ protectedKW: 225, autonomyMinutes: 15, preset: presetById('warm-industrial') });
    const vrlaLife = (c: typeof cool) => {
      const r = c.costs.find(x => x.chemistry === 'VRLA')!.replacement;
      return r.kind === 'modelled' ? r.years : Math.min(...r.cases);
    };
    // The lead-acid interval falls out of the temperature, which is the evidence there is.
    expect(vrlaLife(warm)).toBeLessThan(vrlaLife(cool));
    const lfp = cool.costs.find(x => x.chemistry === 'LFP')!.replacement;
    expect(lfp.kind).toBe('sensitivity');
    expect(lfp.basis).toMatch(/declared sensitivity cases are compared/i);
  });
});

describe('three Indian scenarios, and not one city name between them', () => {
  it('states a room temperature and a battery temperature, separately', () => {
    for (const preset of indiaPresets) {
      expect(batteryTempC(preset)).toBeGreaterThan(preset.roomC);
      expect(preset.batteryRiseBasis.length).toBeGreaterThan(30);
      expect(preset.batteryRiseBasis).toMatch(/assumption/i);
    }
  });

  it('names no city, state or country average', () => {
    const text = JSON.stringify(indiaPresets).toLowerCase();
    for (const city of ['delhi', 'mumbai', 'chennai', 'bengaluru', 'bangalore', 'kolkata', 'hyderabad', 'pune']) {
      expect(text, city).not.toContain(city);
    }
    expect(text).not.toMatch(/average indian|national average/);
  });

  it('says the day is an example rather than a lifetime', () => {
    for (const preset of indiaPresets) {
      expect(preset.notes.join(' '), preset.label).toMatch(/explicit assumption|independent of the backup duration/i);
    }
  });

  it('keeps the outage schedule independent of the design autonomy', () => {
    const short = compareInIndia({ protectedKW: 225, autonomyMinutes: 15, preset: presetById('repeated-interruptions') });
    const long = compareInIndia({ protectedKW: 225, autonomyMinutes: 60, preset: presetById('repeated-interruptions') });
    expect(short.readiness[0].asked).toBe(3);
    expect(long.readiness[0].asked).toBe(3);
    // The equipment changes with the autonomy; the schedule does not.
    const energy = (c: typeof short) => c.chemistry.options.find(o => o.chemistry === 'VRLA')!.installedEnergyKWh;
    expect(energy(long)).toBeGreaterThan(energy(short));
  });

  it('labels the teaching tariffs as teaching tariffs', () => {
    expect([...teachingTariffs]).toEqual([6, 9, 12]);
    expect(TARIFF_LABEL).toMatch(/not current DISCOM tariffs/i);
    const c = compareInIndia({ protectedKW: 225, autonomyMinutes: 15, preset: indiaPresets[0] });
    expect(c.disclosures.join(' ')).toMatch(/not current DISCOM tariffs/i);
    expect(c.disclosures.join(' ')).toMatch(/not a claim about any city or state/i);
  });

  it('refuses to price an end of life nobody has arranged', () => {
    const c = compareInIndia({ protectedKW: 225, autonomyMinutes: 15, preset: indiaPresets[0] });
    for (const option of c.costs) {
      expect(option.totals.unknown.some(u => /disposal|recycling/i.test(u.label)), option.chemistry).toBe(true);
    }
    expect(c.disclosures.join(' ')).toMatch(/informal scrap sale is not compliant recycling/i);
    expect(c.disclosures.join(' ')).toMatch(/battery waste management rules/i);
  });

  it('keeps avoided-outage losses out of the total', () => {
    const c = compareInIndia({ protectedKW: 225, autonomyMinutes: 15, preset: indiaPresets[0] });
    expect(c.disclosures.join(' ')).toMatch(/avoided-outage losses are outside this total/i);
  });
});

describe('neither result is forced', () => {
  const priced = (tariff: number): CostAssumptions => quotedCosts({
    tariffInrPerKWh: tariff,
    batteryInrPerKWh: 12_000,
    conversionInrPerKW: 9_000,
    disposalInrPerKg: 5,
    residualFraction: 0.05,
  });

  it('gives lead-acid its best case in a conditioned room with one outage a month', () => {
    const c = compareInIndia({
      protectedKW: 225, autonomyMinutes: 15, preset: presetById('conditioned-office'),
      costs: priced(9), horizonYears: 5,
    });
    const vrla = c.costs.find(x => x.chemistry === 'VRLA')!.totals.discountedInr;
    const lfp = c.costs.find(x => x.chemistry === 'LFP')!.totals.discountedInr;
    expect(vrla, 'the cheaper store, over a short horizon in a cool room').toBeLessThan(lfp);
  });

  it('gives lithium its case where the outages repeat and the recharge is limited', () => {
    const c = compareInIndia({
      protectedKW: 225, autonomyMinutes: 15, preset: presetById('repeated-interruptions'),
      costs: priced(9), horizonYears: 10,
    });
    const vrla = c.readiness.find(r => r.chemistry === 'VRLA')!;
    const lfp = c.readiness.find(r => r.chemistry === 'LFP')!;
    expect(lfp.carried, 'lithium carries more of the day').toBeGreaterThan(vrla.carried);
  });

  it('reports a crossover only where the running totals actually cross', () => {
    for (const preset of indiaPresets) {
      const c = compareInIndia({ protectedKW: 225, autonomyMinutes: 15, preset, costs: priced(9) });
      if (c.crossoverYear !== null) {
        const [a, b] = c.costs;
        const at = c.crossoverYear;
        const before = a.totals.byYear[at - 1].cumulativeDiscountedInr - b.totals.byYear[at - 1].cumulativeDiscountedInr;
        const after = a.totals.byYear[at].cumulativeDiscountedInr - b.totals.byYear[at].cumulativeDiscountedInr;
        expect(Math.sign(before), `${preset.label} year ${at}`).not.toBe(Math.sign(after));
      }
    }
  });

  it('answers at five, ten and fifteen years without changing anything else', () => {
    for (const horizonYears of [5, 10, 15] as const) {
      const c = compareInIndia({ protectedKW: 225, autonomyMinutes: 15, preset: indiaPresets[1], costs: priced(9), horizonYears });
      expect(c.horizonYears).toBe(horizonYears);
      for (const option of c.costs) {
        expect(option.totals.byYear).toHaveLength(horizonYears + 1);
        expect(option.totals.discountedInr).toBeGreaterThan(0);
      }
    }
  });

  it('moves with the tariff, and only with the parts a tariff touches', () => {
    const at = (tariff: number) => compareInIndia({
      protectedKW: 225, autonomyMinutes: 15, preset: indiaPresets[1], costs: priced(tariff), horizonYears: 10,
    }).costs.find(x => x.chemistry === 'VRLA')!.totals.discountedInr;
    expect(at(12)).toBeGreaterThan(at(9));
    expect(at(9)).toBeGreaterThan(at(6));
  });

  it('charges the protected load to neither chemistry, and the losses to both', () => {
    const costs = priced(9);
    const lines = ledgerFor({
      chemistry: 'LFP', installedEnergyKWh: 100, continuousKW: 225, massKg: 1000,
      batteryEfficiency: 0.95, throughputKWhPerYear: 1000, incrementalCoolingKWhPerYear: 0,
      replacement: { kind: 'sensitivity', cases: [10], basis: '' },
    }, costs, 10);
    const losses = lines.filter(l => l.category === 'energy-losses');
    expect(losses).toHaveLength(10);
    // Only the loss, not the whole throughput: 1000 kWh at 95% loses 50.
    expect(losses[0].inr).toBeCloseTo(50 * 9, 6);
    expect(losses[0].basis).toMatch(/the protected load's energy is not charged to either option/i);
  });

  it('counts cooling only where it is beyond the auxiliaries', () => {
    const base = { chemistry: 'LFP' as const, installedEnergyKWh: 100, continuousKW: 225, massKg: 1000, batteryEfficiency: 0.95, throughputKWhPerYear: 1000, replacement: { kind: 'sensitivity' as const, cases: [10], basis: '' } };
    const none = ledgerFor({ ...base, incrementalCoolingKWhPerYear: 0 }, priced(9), 10);
    const some = ledgerFor({ ...base, incrementalCoolingKWhPerYear: 500 }, priced(9), 10);
    expect(none.filter(l => l.category === 'energy-cooling')).toHaveLength(0);
    expect(some.filter(l => l.category === 'energy-cooling')).toHaveLength(10);
    expect(some.find(l => l.category === 'energy-cooling')!.basis).toMatch(/nothing is counted twice/i);
  });
});

describe('rupees, written the way they are read', () => {
  it('uses lakh and crore where they belong', () => {
    expect(inr(4_500)).toBe('₹4,500');
    expect(inr(250_000)).toBe('₹2.50 lakh');
    expect(inr(35_000_000)).toBe('₹3.50 cr');
    expect(inr(-250_000)).toBe('₹-2.50 lakh');
  });
});

describe('what an incomplete total may not claim', () => {
  it('states no crossover year while any price is missing', () => {
    const c = compareInIndia({ protectedKW: 225, autonomyMinutes: 15, preset: indiaPresets[0] });
    expect(c.costs.some(x => !x.totals.complete), 'nothing is priced by default').toBe(true);
    expect(c.crossoverYear, 'and so no year is named').toBeNull();
    expect(c.disclosures.join(' ')).toMatch(/no crossover year is stated/i);
  });

  it('says when a configuration is larger than the duty because of what the catalogue sells', () => {
    const c = compareInIndia({ protectedKW: 225, autonomyMinutes: 15, preset: indiaPresets[0] });
    expect(c.disclosures.join(' ')).toMatch(/product granularity rather than chemistry/i);
  });

  it('names a crossover again once the prices are there', () => {
    const priced = quotedCosts({ tariffInrPerKWh: 9, batteryInrPerKWh: 12_000, conversionInrPerKW: 9_000, disposalInrPerKg: 5, residualFraction: 0.05 });
    const c = compareInIndia({ protectedKW: 225, autonomyMinutes: 15, preset: indiaPresets[0], costs: priced, horizonYears: 15 });
    expect(c.costs.every(x => x.totals.complete)).toBe(true);
    // Whether they cross or not is the model's answer; what matters is that it is now allowed to say.
    expect(c.disclosures.join(' ')).not.toMatch(/no crossover year is stated/i);
  });
});
