import { describe, expect, it } from 'vitest';
import { notificationsFor, salesQueue, unreadCount, waitingFor } from '../platform/notifications';
import { can, staffRoles, type Quote, type Role } from '../platform/types';

const q = (over: Partial<Quote>): Quote => ({
  id: 'q1', number: 'JW-Q-2026-0001', ownerUid: 'cust', kind: 'indicative', status: 'draft',
  customerName: 'Baltic Grid', projectName: 'Vilnius FCR-N', updatedAt: '2026-09-10T10:00:00.000Z',
  submittedAt: null, issuedAt: null, sentAt: null, returnedReason: null, ...over,
} as unknown as Quote);

describe('notifications — who is told what', () => {
  const submitted = q({ id: 'a', status: 'submitted', submittedAt: '2026-09-11T09:00:00.000Z' });

  it('tells staff about a submitted enquiry', () => {
    for (const role of ['sales', 'approver', 'owner', 'admin'] as Role[]) {
      const items = notificationsFor([submitted], role, 'staff-1', null);
      expect(items.map(n => n.kind)).toContain('enquiry-submitted');
    }
  });

  it('does not tell the customer their own enquiry was submitted — they just did it', () => {
    const items = notificationsFor([submitted], 'customer', 'cust', null);
    expect(items.map(n => n.kind)).not.toContain('enquiry-submitted');
  });

  it('tells the customer when their formal quotation is issued', () => {
    const issued = q({ id: 'b', status: 'sent', kind: 'formal', issuedAt: '2026-09-12T08:00:00.000Z' });
    const items = notificationsFor([issued], 'customer', 'cust', null);
    expect(items.map(n => n.kind)).toEqual(['quote-issued']);
    expect(items[0].href).toBe('/app/quotes/?id=b');
  });

  it('never shows a customer another customer’s record', () => {
    const theirs = q({ id: 'c', ownerUid: 'someone-else', status: 'sent', kind: 'formal', issuedAt: '2026-09-12T08:00:00.000Z' });
    expect(notificationsFor([theirs], 'customer', 'cust', null)).toEqual([]);
  });

  it('never leaks a customer name into a customer’s own notification', () => {
    const issued = q({ id: 'b', status: 'sent', kind: 'formal', issuedAt: '2026-09-12T08:00:00.000Z', customerName: 'Somebody Else Ltd' });
    const [item] = notificationsFor([issued], 'customer', 'cust', null);
    expect(`${item.title} ${item.detail}`).not.toContain('Somebody Else Ltd');
  });

  it('tells only an approver that something waits on approval', () => {
    const pending = q({ id: 'd', status: 'pending-approval', kind: 'formal' });
    expect(notificationsFor([pending], 'approver', 'u', null).map(n => n.kind)).toContain('awaiting-approval');
    expect(notificationsFor([pending], 'sales', 'u', null).map(n => n.kind)).not.toContain('awaiting-approval');
  });

  it('surfaces the approver’s reason when something is returned', () => {
    const returned = q({ id: 'e', status: 'internal-review', kind: 'formal', returnedReason: 'Margin too thin' });
    const [item] = notificationsFor([returned], 'sales', 'u', null);
    expect(item.kind).toBe('returned');
    expect(item.detail).toBe('Margin too thin');
  });

  it('says nothing about a quotation still being drafted', () => {
    expect(notificationsFor([q({ status: 'draft' })], 'sales', 'u', null)).toEqual([]);
  });
});

describe('notifications — unread state', () => {
  const at = (iso: string) => q({ id: iso, status: 'submitted', submittedAt: iso });
  const items = (lastSeen: string | null) =>
    notificationsFor([at('2026-09-10T00:00:00.000Z'), at('2026-09-12T00:00:00.000Z')], 'sales', 'u', lastSeen);

  it('counts everything unread when nothing has been seen', () => {
    expect(unreadCount(items(null))).toBe(2);
  });

  it('counts only what happened after the last visit', () => {
    expect(unreadCount(items('2026-09-11T00:00:00.000Z'))).toBe(1);
  });

  it('counts nothing once everything has been seen', () => {
    expect(unreadCount(items('2026-09-13T00:00:00.000Z'))).toBe(0);
  });

  it('treats the exact last-seen instant as already seen, not as unread', () => {
    expect(unreadCount(items('2026-09-12T00:00:00.000Z'))).toBe(0);
  });

  it('orders newest first', () => {
    expect(items(null).map(n => n.at)).toEqual(['2026-09-12T00:00:00.000Z', '2026-09-10T00:00:00.000Z']);
  });
});

describe('the sales queue', () => {
  const older = q({ id: 'old', status: 'submitted', submittedAt: '2026-09-10T09:00:00.000Z' });
  const newer = q({ id: 'new', status: 'submitted', submittedAt: '2026-09-12T09:00:00.000Z' });
  const inHand = q({ id: 'wip', status: 'internal-review', kind: 'formal', updatedAt: '2026-09-11T09:00:00.000Z' });
  const done = q({ id: 'sent', status: 'sent', kind: 'formal' });

  it('shows waiting enquiries oldest first, so the first of the day is not the last seen', () => {
    expect(salesQueue([newer, older], 'sales').waiting.map(x => x.id)).toEqual(['old', 'new']);
  });

  it('separates what is waiting from what is already in hand', () => {
    const queue = salesQueue([older, inHand, done], 'sales');
    expect(queue.waiting.map(x => x.id)).toEqual(['old']);
    expect(queue.inHand.map(x => x.id)).toEqual(['wip']);
  });

  it('excludes finished quotations entirely', () => {
    expect(salesQueue([done], 'owner').waiting).toEqual([]);
    expect(salesQueue([done], 'owner').inHand).toEqual([]);
  });

  it('is empty for anyone who cannot prepare a quotation', () => {
    for (const role of ['customer', 'viewer'] as Role[]) {
      expect(salesQueue([older, inHand], role).waiting).toEqual([]);
      expect(salesQueue([older, inHand], role).inHand).toEqual([]);
    }
    expect(salesQueue([older], null).waiting).toEqual([]);
  });

  it('is available to exactly the roles that prepare quotations, and no others', () => {
    // Engineer sizes and engineers; it does not price. Viewer reads. Neither gets a queue, and
    // that is the role model working rather than an omission.
    const withQueue = ([...staffRoles, 'customer'] as Role[]).filter(r => salesQueue([older], r).waiting.length > 0);
    expect(withQueue.sort()).toEqual(['admin', 'approver', 'owner', 'sales']);
    // And that set is exactly the permission, not a hand-kept list that can drift from it.
    expect(withQueue.sort()).toEqual(([...staffRoles, 'customer'] as Role[]).filter(r => can(r, 'quote.prepare')).sort());
  });
});

describe('how long something has waited', () => {
  const now = new Date('2026-09-12T12:00:00.000Z');
  const since = (iso: string) => waitingFor(q({ status: 'submitted', submittedAt: iso }), now);

  it('reads in minutes, then hours, then days', () => {
    expect(since('2026-09-12T11:30:00.000Z')).toBe('30 min');
    expect(since('2026-09-12T04:00:00.000Z')).toBe('8 h');
    expect(since('2026-09-08T12:00:00.000Z')).toBe('4 days');
  });

  it('never reads negative for a clock skewed into the future', () => {
    expect(since('2026-09-13T12:00:00.000Z')).toBe('0 min');
  });
});
