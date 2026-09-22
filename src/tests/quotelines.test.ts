import { describe, expect, it } from 'vitest';
import { addCustomLine, assumptionsDefault, buildQuoteLines, convertQuote, quoteTotals, removeLine, uplift } from '../quoting/quote';
import { atRate, currencies, defaultPriceBook, fromLanded, landedCost, localRate, restate, type Currency } from '../catalog/pricing';
import { defaultSizingInput, sizeSystem } from '../sizing/engine';
import { evaluateFinance } from '../sizing/finance';
import type { Quote, QuoteLine } from '../platform/types';

const line = (over: Partial<QuoteLine> = {}): QuoteLine => ({
  id: 'l1', category: 'equipment', label: 'Battery', quantity: 2, unit: 'unit',
  unitPrice: 100, total: 200, optional: false, ...over,
});
const quote = (lines: QuoteLine[], over: Partial<Quote> = {}): Quote => {
  const base = { id: 'q', currency: 'INR' as const, lines, discountPct: 0, taxPct: 0, freight: 0, updatedAt: '2026-01-01T00:00:00.000Z', ...over };
  // Totals are computed from the finished record, so freight and percentages passed in an override
  // are actually reflected — computing them first is how a fixture ends up internally inconsistent.
  return { ...base, ...quoteTotals(base.lines, base.discountPct, base.taxPct, base.freight) } as unknown as Quote;
};

describe('adding and removing lines', () => {
  it('appends a line that is priced by hand, not by the price book', () => {
    const q = addCustomLine(quote([line()]));
    expect(q.lines).toHaveLength(2);
    const added = q.lines[1];
    expect(added.unitPrice).toBe(0);
    expect(added.quantity).toBe(1);
    expect(added.optional).toBe(false);
  });

  it('gives every added line its own id, so editing one does not edit another', () => {
    let q = quote([line()]);
    q = addCustomLine(addCustomLine(q));
    expect(new Set(q.lines.map(l => l.id)).size).toBe(3);
  });

  it('recomputes the total when a line is removed', () => {
    const q = quote([line({ id: 'a' }), line({ id: 'b', total: 500, unitPrice: 500, quantity: 1 })]);
    expect(q.total).toBe(700);
    expect(removeLine(q, 'b').total).toBe(200);
  });

  it('leaves the quotation untouched when the id does not exist', () => {
    const q = quote([line()]);
    expect(removeLine(q, 'nope')).toBe(q);
  });

  it('does not count an optional line in the total, added or not', () => {
    const q = quote([line(), line({ id: 'opt', optional: true, total: 999 })]);
    expect(q.total).toBe(200);
  });
});

describe('changing the currency', () => {
  const pb = defaultPriceBook;                 // landed-import basis, INR
  const rate = localRate(pb, 'INR');           // the price book's own rate, not a reference table

  it('uses the offer’s own rate for the book’s currency, and the reference table for others', () => {
    // If this ever collapses to 1 again, every conversion silently becomes a relabel.
    expect(rate).toBeGreaterThan(1);
    expect(currencies.USD.perUsd).toBe(1);
  });

  it('rescales every amount rather than relabelling them', () => {
    const q = quote([line({ unitPrice: 100, total: 200 })], { currency: 'INR', freight: 1000 });
    const usd = convertQuote(q, 'USD', pb);
    expect(usd.currency).toBe('USD');
    // Rates are carried at the precision the document prints, so a converted line lands on the
    // nearest cent rather than on a fraction of one.
    expect(usd.lines[0].unitPrice).toBeCloseTo(100 / rate, 2);
    expect(usd.lines[0].total).toBeCloseTo(200 / rate, 2);
    expect(usd.lines[0].total).toBe(usd.lines[0].unitPrice * usd.lines[0].quantity);
    expect(usd.freight).toBeCloseTo(1000 / rate, 9);
    expect(usd.total).toBeCloseTo(q.total / rate, 1);
  });

  it('is the bug this replaces: the number must not survive the symbol change', () => {
    const q = quote([line({ unitPrice: 100, total: 200 })], { currency: 'INR' });
    expect(convertQuote(q, 'USD', pb).total).not.toBe(q.total);
  });

  it('round-trips back to where it started', () => {
    const q = quote([line({ unitPrice: 12345.67, total: 24691.34 })], { currency: 'INR', freight: 987 });
    const back = convertQuote(convertQuote(q, 'USD', pb), 'INR', pb);
    // Money stored at the precision it is printed cannot round-trip exactly — a rupee through a
    // cent and back is a rupee either side of where it started, and a quotation that multiplies
    // out is worth more than one that survives an imaginary round trip.
    expect(back.total).toBeCloseTo(q.total, -1);
    expect(Math.abs(back.total - q.total)).toBeLessThan(q.lines.length * rate);
    expect(back.freight).toBeCloseTo(q.freight, 6);
    expect(back.currency).toBe('INR');
  });

  it('is a no-op for the currency it is already in', () => {
    const q = quote([line()], { currency: 'INR' });
    expect(convertQuote(q, 'INR', pb)).toBe(q);
  });

  it('keeps discount and tax percentages, which are ratios and do not convert', () => {
    const q = quote([line()], { currency: 'INR', discountPct: 5, taxPct: 18 });
    const usd = convertQuote(q, 'USD', pb);
    expect(usd.discountPct).toBe(5);
    expect(usd.taxPct).toBe(18);
  });

  it('keeps the totals internally consistent after conversion', () => {
    const q = quote([line({ unitPrice: 100, total: 200 })], { currency: 'INR', discountPct: 10, taxPct: 18, freight: 50 });
    const usd = convertQuote(q, 'USD', pb);
    const recomputed = quoteTotals(usd.lines, usd.discountPct, usd.taxPct, usd.freight);
    expect(usd.total).toBeCloseTo(recomputed.total, 9);
    expect(usd.subtotal).toBeCloseTo(recomputed.subtotal, 9);
  });
});

describe('a quotation that multiplies out', () => {
  // A procurement officer checks quantity times rate against the amount beside it. If the document
  // carries a rate to more precision than it prints, twelve containers at a rate ending .33 come
  // out four rupees short of their own line total and the whole offer is queried.
  const multipliesOut = (lines: { quantity: number; unitPrice: number; total: number }[], where: string) => {
    for (const l of lines) {
      expect(l.total, `${where}: ${l.quantity} x ${l.unitPrice} should be ${l.total}`)
        .toBeCloseTo(l.quantity * l.unitPrice, 6);
    }
  };

  it('holds for every line as built, in every currency', () => {
    const sizing = sizeSystem({ ...defaultSizingInput(), powerMW: 10, durationH: 4 });
    const finance = evaluateFinance(sizing, defaultPriceBook);
    for (const currency of ['INR', 'USD', 'EUR', 'GBP', 'AED'] as const) {
      const lines = buildQuoteLines(sizing, finance, currency, defaultPriceBook);
      multipliesOut(lines, currency);
      // and each rate is printed exactly: no hidden fractions of a rupee or a cent
      for (const l of lines) expect(l.unitPrice, `${currency} rate`).toBe(atRate(l.unitPrice, currency));
    }
  });

  it('still holds after the currency is changed', () => {
    const sizing = sizeSystem({ ...defaultSizingInput(), powerMW: 5, durationH: 2 });
    const finance = evaluateFinance(sizing, defaultPriceBook);
    const lines = buildQuoteLines(sizing, finance, 'INR', defaultPriceBook);
    const q = { ...quote(lines, { currency: 'INR' as const }), lines };
    for (const to of ['USD', 'EUR', 'AED'] as const) {
      const converted = convertQuote(q, to, defaultPriceBook);
      multipliesOut(converted.lines, `after converting to ${to}`);
    }
  });

  it('adds its lines to the subtotal it prints', () => {
    const sizing = sizeSystem({ ...defaultSizingInput(), powerMW: 10, durationH: 4 });
    const finance = evaluateFinance(sizing, defaultPriceBook);
    const lines = buildQuoteLines(sizing, finance, 'INR', defaultPriceBook);
    const totals = quoteTotals(lines, 0, 0, 0);
    const byHand = lines.filter(l => !l.optional).reduce((s, l) => s + l.quantity * l.unitPrice, 0);
    expect(totals.subtotal).toBeCloseTo(byHand, 6);
  });
});

describe('the same plant, quoted in any currency', () => {
  const sizing = sizeSystem(defaultSizingInput());
  const finance = evaluateFinance(sizing, defaultPriceBook);

  /**
   * The one invariant that matters commercially: whatever currency a document is raised in, it
   * has to describe the same amount of money. It did not. The landed build-up quotes its rate in
   * rupees per dollar, and that rate was applied to every currency, so a plant costing $1.58 m
   * was quoted at $152 m, €152 m and AED 152 m — the identical figure in each, because the dollar
   * total was being multiplied by the rupee rate and then labelled whatever was asked for.
   */
  it('comes to the same money whichever currency it is raised in', () => {
    const inUsd = (c: Currency) => {
      const lines = buildQuoteLines(sizing, finance, c, { ...defaultPriceBook, currency: c });
      return quoteTotals(lines, 0, 0, 0).subtotal / localRate({ ...defaultPriceBook, currency: c }, c);
    };
    const reference = inUsd('USD');
    // Against the cost stack it was built from, to within the cent each rate is printed to.
    expect(reference / finance.capexUsd).toBeCloseTo(1, 4);
    for (const c of Object.keys(currencies) as Currency[]) {
      // Within a tenth of a percent: the only difference is rounding each rate to the precision
      // the document prints it at.
      expect(inUsd(c) / reference, `${c} against USD`).toBeCloseTo(1, 3);
    }
  });

  it('keeps the rupee build-up on the offer’s own rate', () => {
    // The offer was struck at its own rate; reconciling a rupee document against a reference
    // table is what makes a build-up disagree with its own order value.
    expect(localRate(defaultPriceBook, 'INR')).toBe(defaultPriceBook.landed.exchangeRateInrPerUsd);
    expect(localRate(defaultPriceBook, 'INR')).not.toBe(currencies.INR.perUsd);
    for (const c of ['USD', 'EUR', 'GBP', 'AUD', 'AED'] as const) {
      expect(localRate(defaultPriceBook, c), c).toBe(currencies[c].perUsd);
    }
  });
});

describe('the offer’s price build-up against its own order value', () => {
  const sizing = sizeSystem(defaultSizingInput());
  const finance = evaluateFinance(sizing, defaultPriceBook);

  /**
   * The customer's page prints "N × per-enclosure" beside a subtotal built from the quote lines.
   * Both are drawn from the same rupee build-up, so both have to travel to the quotation currency
   * the same way. Taking the rupee figure straight out and printing it under a dollar heading put
   * a ₹44.8 m enclosure on the page as $44.8 m.
   */
  it('restates the rupee build-up into the same money the quote lines carry', () => {
    for (const c of Object.keys(currencies) as Currency[]) {
      const pb = { ...defaultPriceBook, currency: c };
      const factor = uplift(finance);
      const landed = landedCost({ ...pb.landed, basicPriceUsdPerKWh: pb.landed.basicPriceUsdPerKWh * factor, pcsCostInrPerUnit: pb.landed.pcsCostInrPerUnit * factor, pcsCostInrPerKW: pb.landed.pcsCostInrPerKW * factor }, finance.landed!.kWh, finance.landed!.ratedKW);
      const perEnclosure = fromLanded(landed.deliveredInr, pb.landed, c);
      const battery = buildQuoteLines(sizing, finance, c, pb).find(l => l.id === 'battery')!;
      expect(perEnclosure / battery.unitPrice, `${c} per enclosure`).toBeCloseTo(1, 4);
    }
  });
});

describe('totalling a workspace that quotes in more than one currency', () => {
  it('restates each amount before adding it to the next', () => {
    const pb = defaultPriceBook;
    // ₹9,700 and $100 are the same money at the offer's rate, so a workspace holding both has a
    // pipeline of $200 — not 9,800 of anything.
    const rows: { total: number; currency: Currency }[] = [{ total: 9_700, currency: 'INR' }, { total: 100, currency: 'USD' }];
    const inUsd = rows.reduce((s, q) => s + restate(q.total, q.currency, 'USD', pb), 0);
    expect(inUsd).toBeCloseTo(200, 6);
    const inInr = rows.reduce((s, q) => s + restate(q.total, q.currency, 'INR', pb), 0);
    expect(inInr).toBeCloseTo(19_400, 6);
    expect(inInr / inUsd).toBeCloseTo(localRate(pb, 'INR'), 6);
  });

  it('leaves an amount alone when it is already in the currency asked for', () => {
    for (const c of Object.keys(currencies) as Currency[]) expect(restate(1234.56, c, c, defaultPriceBook)).toBe(1234.56);
  });

  it('round-trips through any currency', () => {
    for (const c of Object.keys(currencies) as Currency[]) {
      const there = restate(1_000_000, 'INR', c, defaultPriceBook);
      expect(restate(there, c, 'INR', defaultPriceBook)).toBeCloseTo(1_000_000, 6);
    }
  });
});

describe('what the quotation assumes', () => {
  /**
   * The degradation schedule describes one enclosure ageing from the day it went in; the
   * performance table shows the fleet, which augmentation refreshes. The document quoted the
   * first beside the second without saying which was which, so 74% and 77% appeared for the same
   * year on the same proposal.
   */
  it('says which retention figure belongs to the unit and which to the fleet', () => {
    const s = sizeSystem({ ...defaultSizingInput('frequency-regulation'), powerMW: 8, durationH: 1, projectYears: 15, augmentation: 'periodic' });
    expect(s.augmentations.length, 'this plant augments').toBeGreaterThan(0);
    const line = assumptionsDefault(s).find(t => t.startsWith('Capacity retention'))!;
    const fleet = s.years.at(-1)!;
    expect(line).toContain(`${Math.round(s.input.degradation.retention[15] * 100)}% at year 15`);
    expect(line).toContain('one enclosure ageing from its installation year');
    expect(line).toContain(`${Math.round(fleet.retention * 100)}% in year ${fleet.year}`);
  });

  it('leaves the distinction out when there is no augmentation to draw it', () => {
    const s = sizeSystem({ ...defaultSizingInput(), augmentation: 'none' });
    expect(s.augmentations).toHaveLength(0);
    const line = assumptionsDefault(s).find(t => t.startsWith('Capacity retention'))!;
    expect(line).not.toContain('one enclosure ageing');
    expect(line).toContain('Supplier warranty curves govern the contract.');
  });
});
