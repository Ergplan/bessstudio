import { describe, expect, it } from 'vitest';
import { can, canSeeFinancials, isCustomerRole, roles, staffRoles, type Quote, type Role } from '../platform/types';
import { allows, applyAction, availableActions, isEditable, transitions, visibleQuotes } from '../quoting/lifecycle';

const quote = (over: Partial<Quote> = {}) => ({
  id: 'q1', ownerUid: 'cust-1', kind: 'indicative', status: 'draft', number: 'JW-Q-2026-0001',
  updatedAt: '', sentAt: null, ...over,
} as unknown as Quote);

const actor = { uid: 'u1', displayName: 'A Person' };

describe('roles', () => {
  it('has exactly one external role', () => {
    expect(roles.filter(isCustomerRole)).toEqual(['customer']);
    expect(staffRoles).not.toContain('customer');
    expect([...staffRoles, 'customer' as Role].sort()).toEqual([...roles].sort());
  });

  it('keeps a customer out of everyone else’s records', () => {
    expect(can('customer', 'pipeline.view')).toBe(false);
    for (const r of staffRoles) expect(can(r, 'pipeline.view')).toBe(true);
  });

  it('separates preparing a quotation from releasing one', () => {
    expect(can('sales', 'quote.prepare')).toBe(true);
    expect(can('sales', 'quote.approve')).toBe(false);
    expect(can('approver', 'quote.approve')).toBe(true);
    // An engineer sizes; pricing decisions are not theirs.
    expect(can('engineer', 'quote.approve')).toBe(false);
  });

  it('lets only a customer submit an enquiry', () => {
    expect(can('customer', 'quote.submit')).toBe(true);
    for (const r of staffRoles) expect(can(r, 'quote.submit')).toBe(false);
  });

  it('never lets a customer manage the organization or its price books', () => {
    expect(can('customer', 'org.manage')).toBe(false);
    expect(can('customer', 'pricebook.write')).toBe(false);
    expect(can('customer', 'customer.write')).toBe(false);
  });
});

describe('financial gate', () => {
  it('withholds pricing from an unverified address, whoever it belongs to', () => {
    for (const r of roles) expect(canSeeFinancials(r, false)).toBe(false);
  });

  it('releases pricing once the address is verified', () => {
    for (const r of roles) expect(canSeeFinancials(r, true)).toBe(true);
  });

  it('withholds pricing from a signed-out visitor even if the mail is verified', () => {
    expect(canSeeFinancials(null, true)).toBe(false);
  });
});

describe('quotation lifecycle', () => {
  it('lets a customer submit their own draft and nothing more', () => {
    const q = quote();
    expect(availableActions('customer', q).map(t => t.action)).toEqual(['submit']);
  });

  it('does not let a customer approve, issue or price formally', () => {
    for (const status of ['submitted', 'internal-review', 'pending-approval', 'approved'] as const)
      expect(availableActions('customer', quote({ status, kind: 'formal' }))).toEqual([]);
  });

  it('will not let sales release its own quotation', () => {
    const prepared = quote({ kind: 'formal', status: 'pending-approval' });
    expect(allows('sales', prepared, 'approve')).toBe(false);
    expect(allows('approver', prepared, 'approve')).toBe(true);
  });

  it('cannot issue a quotation that no approver has released', () => {
    for (const status of ['draft', 'internal-review', 'pending-approval'] as const)
      expect(allows('approver', quote({ kind: 'formal', status }), 'send')).toBe(false);
    expect(allows('sales', quote({ kind: 'formal', status: 'approved' }), 'send')).toBe(true);
  });

  it('never treats an indicative estimate as issuable', () => {
    for (const t of transitions.filter(t => t.formalOnly))
      for (const status of t.from)
        expect(allows('owner', quote({ kind: 'indicative', status }), t.action)).toBe(false);
  });

  it('takes the estimate into the supplier’s hands when sales picks it up', () => {
    const submitted = applyAction(quote(), 'submit', { uid: 'cust-1', displayName: 'Customer' });
    expect(submitted.status).toBe('submitted');
    expect(submitted.kind).toBe('indicative');
    const picked = applyAction(submitted, 'pick-up', actor);
    expect(picked.kind).toBe('formal');
    // And the customer can no longer edit the figures underneath it.
    expect(isEditable('customer', picked)).toBe(false);
  });

  it('records who approved, and clears it when the quotation is returned', () => {
    const pending = quote({ kind: 'formal', status: 'pending-approval' });
    const approved = applyAction(pending, 'approve', actor);
    expect(approved.approvedByUid).toBe('u1');
    expect(approved.status).toBe('approved');
    const returned = applyAction(pending, 'return', actor, 'Margin too thin');
    expect(returned.returnedReason).toBe('Margin too thin');
    expect(returned.approvedByUid).toBeNull();
  });

  it('refuses a transition the record is not positioned for', () => {
    expect(() => applyAction(quote({ status: 'won' }), 'submit', actor)).toThrow();
  });
});

describe('record visibility', () => {
  const mine = quote({ id: 'a', ownerUid: 'me' }) as Quote;
  const theirs = quote({ id: 'b', ownerUid: 'someone-else' }) as Quote;

  it('shows a customer only what they raised', () => {
    expect(visibleQuotes('customer', 'me', [mine, theirs]).map(q => q.id)).toEqual(['a']);
  });

  it('shows staff the whole workspace', () => {
    for (const r of staffRoles)
      expect(visibleQuotes(r, 'me', [mine, theirs])).toHaveLength(2);
  });
});
