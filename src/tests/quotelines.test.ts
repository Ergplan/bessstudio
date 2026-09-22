import { describe, expect, it } from 'vitest';
import { addCustomLine, buildQuoteLines, convertQuote, quoteTotals, removeLine } from '../quoting/quote';
import { atRate, currencies, defaultPriceBook, localRate } from '../catalog/pricing';
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
