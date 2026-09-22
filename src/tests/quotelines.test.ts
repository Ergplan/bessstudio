import { describe, expect, it } from 'vitest';
import { addCustomLine, convertQuote, quoteTotals, removeLine } from '../quoting/quote';
import { currencies, defaultPriceBook, localRate } from '../catalog/pricing';
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
    expect(usd.lines[0].unitPrice).toBeCloseTo(100 / rate, 9);
    expect(usd.lines[0].total).toBeCloseTo(200 / rate, 9);
    expect(usd.freight).toBeCloseTo(1000 / rate, 9);
    expect(usd.total).toBeCloseTo(q.total / rate, 6);
  });

  it('is the bug this replaces: the number must not survive the symbol change', () => {
    const q = quote([line({ unitPrice: 100, total: 200 })], { currency: 'INR' });
    expect(convertQuote(q, 'USD', pb).total).not.toBe(q.total);
  });

  it('round-trips back to where it started', () => {
    const q = quote([line({ unitPrice: 12345.67, total: 24691.34 })], { currency: 'INR', freight: 987 });
    const back = convertQuote(convertQuote(q, 'USD', pb), 'INR', pb);
    expect(back.total).toBeCloseTo(q.total, 6);
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
