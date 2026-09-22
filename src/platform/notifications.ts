import { can, type Quote, type Role } from './types';

/**
 * What needs someone's attention, derived rather than stored.
 *
 * There is no mail server on this plan and no server-side trigger, so a notification is not a
 * record that gets written when something happens — it is a reading of the records the client is
 * already watching. That has two consequences worth stating: nothing is metered for it (no extra
 * Firestore collection, no extra reads), and a notification cannot go stale or be missed, because
 * it is recomputed from the truth every time.
 *
 * Unread state is the one thing that has to persist, and it is a single timestamp on the member
 * document rather than a flag per item.
 */

export type NotificationKind =
  | 'enquiry-submitted'   // a customer wants a formal quotation — the sales queue
  | 'awaiting-approval'   // prepared, waiting on an approver (two-step tenants only)
  | 'returned'            // an approver sent it back
  | 'quote-issued';       // a formal quotation reached the customer

export type Notification = {
  id: string;
  kind: NotificationKind;
  /** The moment this became true. Unread state compares against this, not against "now". */
  at: string;
  title: string;
  detail: string;
  href: string;
  unread: boolean;
};

const LABEL: Record<NotificationKind, string> = {
  'enquiry-submitted': 'New enquiry',
  'awaiting-approval': 'Waiting for approval',
  returned: 'Returned for changes',
  'quote-issued': 'Quotation issued',
};

/** The moment a quotation entered the state that makes it noteworthy. */
const momentOf = (q: Quote, kind: NotificationKind): string =>
  (kind === 'enquiry-submitted' ? q.submittedAt
    : kind === 'quote-issued' ? (q.issuedAt ?? q.sentAt)
      : null) ?? q.updatedAt;

/**
 * Everything this person should be told about, newest first.
 *
 * Staff see the workspace's queue. A customer sees only what happened to records they own — the
 * same rule the workspace and the Firestore rules apply, restated here rather than assumed,
 * because a notification that leaked a name would leak it in the one place people read carefully.
 */
export function notificationsFor(
  quotes: Quote[],
  role: Role | null,
  uid: string,
  lastSeenAt: string | null,
): Notification[] {
  const staff = can(role, 'pipeline.view');
  const mine = staff ? quotes : quotes.filter(q => q.ownerUid === uid);
  const out: Notification[] = [];

  for (const q of mine) {
    const push = (kind: NotificationKind, detail: string) => {
      const at = momentOf(q, kind);
      out.push({
        id: `${q.id}:${kind}`, kind, at, detail,
        title: `${LABEL[kind]} · ${q.number}`,
        href: `/app/quotes/?id=${q.id}`,
        unread: !lastSeenAt || at > lastSeenAt,
      });
    };

    // Staff are told what needs doing. A customer is told what happened to their own enquiry.
    if (q.status === 'submitted' && staff) push('enquiry-submitted', `${q.customerName} — ${q.projectName}`);
    if (q.status === 'pending-approval' && staff && can(role, 'quote.approve')) push('awaiting-approval', `${q.customerName} — ${q.projectName}`);
    if (q.status === 'internal-review' && q.returnedReason && staff) push('returned', q.returnedReason);
    if (q.status === 'sent' && !staff) push('quote-issued', `${q.projectName} — your formal quotation is ready`);
  }

  return out.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
}

export const unreadCount = (items: Notification[]) => items.filter(n => n.unread).length;

/**
 * The sales queue: enquiries waiting to be picked up, then work already in hand.
 *
 * Oldest first, deliberately. A queue sorted newest-first is a queue where the first enquiry of the
 * day is the last one anybody sees.
 */
export function salesQueue(quotes: Quote[], role: Role | null): { waiting: Quote[]; inHand: Quote[] } {
  if (!can(role, 'quote.prepare')) return { waiting: [], inHand: [] };
  const at = (q: Quote) => q.submittedAt ?? q.updatedAt;
  const byOldest = (a: Quote, b: Quote) => (at(a) < at(b) ? -1 : at(a) > at(b) ? 1 : 0);
  return {
    waiting: quotes.filter(q => q.status === 'submitted').sort(byOldest),
    inHand: quotes.filter(q => ['internal-review', 'pending-approval', 'approved'].includes(q.status)).sort(byOldest),
  };
}

/** How long an enquiry has been waiting, for the queue's own column. */
export function waitingFor(q: Quote, now = new Date()): string {
  const since = new Date(q.submittedAt ?? q.updatedAt).getTime();
  const mins = Math.max(0, Math.round((now.getTime() - since) / 60000));
  if (mins < 60) return `${mins} min`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours} h`;
  return `${Math.round(hours / 24)} days`;
}
