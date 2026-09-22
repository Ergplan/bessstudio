import { describe, expect, it } from 'vitest';
import { advanceStage, restage, stageFromQuotes, stageRank } from '../platform/stages';
import { customerStages, type Customer, type CustomerStage, type Quote } from '../platform/types';

const q = (status: string, customerId = 'c1') => ({ status, customerId }) as Pick<Quote, 'status' | 'customerId'>;
const customer = (stage: CustomerStage) => ({ id: 'c1', stage, updatedAt: 'x' }) as Customer;

describe('what the quotations justify', () => {
  it('justifies nothing when there are none', () => {
    expect(stageFromQuotes([])).toBeNull();
  });

  it('reads work in hand as qualified', () => {
    for (const s of ['draft', 'submitted', 'internal-review'])
      expect(stageFromQuotes([q(s)])).toBe('qualified');
  });

  it('reads a price in front of them as proposal', () => {
    for (const s of ['pending-approval', 'approved', 'sent'])
      expect(stageFromQuotes([q(s)])).toBe('proposal');
  });

  it('reads a win as won, whatever else is open', () => {
    expect(stageFromQuotes([q('draft'), q('won'), q('sent')])).toBe('won');
  });

  it('takes the furthest of several, not the latest', () => {
    expect(stageFromQuotes([q('sent'), q('draft')])).toBe('proposal');
    expect(stageFromQuotes([q('draft'), q('sent')])).toBe('proposal');
  });

  it('justifies nothing from a lost or expired quotation alone', () => {
    expect(stageFromQuotes([q('lost')])).toBeNull();
    expect(stageFromQuotes([q('expired')])).toBeNull();
  });
});

describe('advancing, never retreating', () => {
  it('moves a lead forward as work appears', () => {
    expect(advanceStage('lead', [q('draft')])).toBe('qualified');
    expect(advanceStage('lead', [q('sent')])).toBe('proposal');
    expect(advanceStage('lead', [q('won')])).toBe('won');
  });

  it('never drags somebody back to where the paperwork is', () => {
    // A salesperson has them in negotiation; the quotation is still only issued.
    expect(advanceStage('negotiation', [q('sent')])).toBe('negotiation');
    expect(advanceStage('won', [q('draft')])).toBe('won');
    expect(advanceStage('proposal', [q('draft')])).toBe('proposal');
  });

  it('leaves somebody alone when nothing justifies a move', () => {
    for (const s of customerStages) expect(advanceStage(s, [])).toBe(s);
  });

  it('never decides somebody is lost', () => {
    expect(advanceStage('proposal', [q('lost')])).toBe('proposal');
    expect(advanceStage('lead', [q('lost'), q('expired')])).toBe('lead');
  });

  it('never decides somebody is negotiating — that happens on the telephone', () => {
    // Staying at negotiation is correct; arriving there automatically is not. Only a move counts.
    const arrivals = customerStages.flatMap(from =>
      ['draft', 'submitted', 'internal-review', 'pending-approval', 'approved', 'sent', 'won', 'lost', 'expired']
        .map(status => advanceStage(from, [q(status)]))
        .filter(to => to !== from));
    expect(arrivals).not.toContain('negotiation');
    expect(arrivals).not.toContain('lost');
    expect([...new Set(arrivals)].sort()).toEqual(['proposal', 'qualified', 'won']);
  });

  it('keeps a customer marked lost there, unless they win something', () => {
    expect(advanceStage('lost', [q('draft')])).toBe('lost');
    expect(advanceStage('lost', [q('sent')])).toBe('lost');
    expect(advanceStage('lost', [q('won')])).toBe('won');
  });

  it('ranks lost off the ladder, so it is never an automatic destination', () => {
    expect(stageRank.lost).toBe(0);
    for (const s of customerStages.filter(x => x !== 'lost')) expect(stageRank[s]).toBeGreaterThan(0);
  });
});

describe('deciding whether to write', () => {
  it('writes nothing when the stage is already right', () => {
    expect(restage(customer('proposal'), [q('sent')])).toBeNull();
    expect(restage(customer('lead'), [])).toBeNull();
  });

  it('returns the updated record when it moves, and stamps it', () => {
    const next = restage(customer('lead'), [q('sent')]);
    expect(next?.stage).toBe('proposal');
    expect(next?.updatedAt).not.toBe('x');
  });

  it('only counts this customer’s own quotations', () => {
    expect(restage(customer('lead'), [q('won', 'somebody-else')])).toBeNull();
    expect(restage(customer('lead'), [q('won', 'c1'), q('draft', 'other')])?.stage).toBe('won');
  });
});
