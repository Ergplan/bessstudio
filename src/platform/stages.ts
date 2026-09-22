import type { Customer, CustomerStage, Quote } from './types';

/**
 * Moving a customer through the funnel.
 *
 * The stage used to be set to `lead` when the record was made and never touched again, so the
 * dashboard's headline chart read a field nothing wrote — every real customer sat at `lead` for
 * ever, and the demonstration only looked convincing because its five stages are hard-coded one
 * each. The stage now follows the work.
 *
 * Two rules keep it from fighting the person using it:
 *
 *  - **It only ever advances.** A salesperson who has moved somebody forward by hand is never
 *    dragged back because a quotation is still a draft.
 *  - **It never decides `lost` or `negotiation`.** Neither is inferable — a lost quotation may be
 *    one of several, and a negotiation happens on the telephone. Those stay a human judgement.
 */

/** Where each stage sits on the ladder. `lost` is off it: only a person puts somebody there. */
export const stageRank: Record<CustomerStage, number> = {
  lead: 1, qualified: 2, proposal: 3, negotiation: 4, won: 5, lost: 0,
};

/** The furthest stage this customer's quotations actually justify, or null if they justify none. */
export function stageFromQuotes(quotes: Pick<Quote, 'status'>[]): CustomerStage | null {
  if (!quotes.length) return null;
  if (quotes.some(q => q.status === 'won')) return 'won';
  // A price is in front of them — issued, or released and about to be.
  if (quotes.some(q => ['sent', 'approved', 'pending-approval'].includes(q.status))) return 'proposal';
  // Something is being worked on for them.
  if (quotes.some(q => ['draft', 'submitted', 'internal-review'].includes(q.status))) return 'qualified';
  return null;
}

/**
 * The stage this customer should be at, given their quotations and where somebody has already put
 * them. Returns the current stage unchanged when nothing justifies a move.
 */
export function advanceStage(current: CustomerStage, quotes: Pick<Quote, 'status'>[]): CustomerStage {
  const evidence = stageFromQuotes(quotes);
  if (!evidence) return current;
  // Somebody marked them lost. Only winning something overrides that, and only a person can
  // decide they are lost again.
  if (current === 'lost') return evidence === 'won' ? 'won' : current;
  return stageRank[evidence] > stageRank[current] ? evidence : current;
}

/** The customer record to write, or null when the stage is already right. */
export function restage(customer: Customer, quotes: Pick<Quote, 'status' | 'customerId'>[]): Customer | null {
  const theirs = quotes.filter(q => q.customerId === customer.id);
  const next = advanceStage(customer.stage, theirs);
  return next === customer.stage ? null : { ...customer, stage: next, updatedAt: new Date().toISOString() };
}
