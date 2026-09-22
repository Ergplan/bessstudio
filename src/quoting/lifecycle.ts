import { can, type ApprovalMode, type Permission, type Quote, type QuoteStatus, type Role } from '../platform/types';

/**
 * How a quotation moves, and who may move it.
 *
 * The customer's indicative pricing and the supplier's formal offer are the same record at
 * different points of one path, so the path is written once here and both the interface and the
 * Firestore rules are read from it. The separation that matters is that preparing a quotation and
 * releasing one are different permissions: `sales` can do the first and not the second.
 */
export type QuoteAction = 'submit' | 'pick-up' | 'request-approval' | 'approve' | 'return' | 'send' | 'issue' | 'win' | 'lose';

export type Transition = {
  action: QuoteAction;
  from: QuoteStatus[];
  to: QuoteStatus;
  permission: Permission;
  label: string;
  /** What the person is actually doing, said plainly enough to put on a confirmation. */
  describe: string;
  /** Only ever applies to the customer's own indicative record. */
  indicativeOnly?: boolean;
  /** Never applies to an indicative record; a formal offer is the only thing that can be issued. */
  formalOnly?: boolean;
  /** Only offered under this approval mode. Absent means both. */
  mode?: ApprovalMode;
};

export const transitions: Transition[] = [
  {
    action: 'submit', from: ['draft'], to: 'submitted', permission: 'quote.submit', indicativeOnly: true,
    label: 'Submit for a formal quotation',
    describe: 'Sends this design to the sales team. They will confirm the details with you and issue a formal quotation.',
  },
  {
    action: 'pick-up', from: ['submitted'], to: 'internal-review', permission: 'quote.prepare',
    label: 'Pick up',
    describe: 'Takes ownership of this enquiry so the customer can see it is being worked on.',
  },
  {
    action: 'request-approval', from: ['draft', 'internal-review'], to: 'pending-approval', permission: 'quote.request-approval', formalOnly: true,
    mode: 'two-step',
    label: 'Send for approval',
    describe: 'Passes the prepared quotation to an approver. It cannot be issued until one releases it.',
  },
  {
    action: 'approve', from: ['pending-approval'], to: 'approved', permission: 'quote.approve', formalOnly: true,
    mode: 'two-step',
    label: 'Approve',
    describe: 'Releases this quotation for issue. Only an approver can do this.',
  },
  {
    action: 'return', from: ['pending-approval'], to: 'internal-review', permission: 'quote.approve', formalOnly: true,
    mode: 'two-step',
    label: 'Return for changes',
    describe: 'Sends the quotation back to whoever prepared it, with your reason.',
  },
  {
    action: 'send', from: ['approved'], to: 'sent', permission: 'quote.prepare', formalOnly: true,
    mode: 'two-step',
    label: 'Issue to customer',
    describe: 'Marks the approved quotation as issued. The customer sees it as a formal quotation.',
  },
  {
    // Single-level release. The approval itself happens outside the system, against the PDF's
    // approval block, which is why this is one action rather than a second seat in the workflow.
    action: 'issue', from: ['draft', 'internal-review'], to: 'sent', permission: 'quote.prepare', formalOnly: true,
    mode: 'single',
    label: 'Issue quotation',
    describe: 'Marks the quotation as issued and makes the PDF available. Approval is recorded on the document itself, signed outside the system.',
  },
  { action: 'win', from: ['sent'], to: 'won', permission: 'quote.prepare', formalOnly: true, label: 'Mark won', describe: 'Records the order.' },
  { action: 'lose', from: ['sent'], to: 'lost', permission: 'quote.prepare', formalOnly: true, label: 'Mark lost', describe: 'Closes the quotation.' },
];

/** Whether this role may move this quotation this way, right now, under this approval mode. */
export function allows(role: Role | null, quote: Pick<Quote, 'status' | 'kind'>, action: QuoteAction, mode: ApprovalMode = 'single'): boolean {
  const t = transitions.find(x => x.action === action);
  if (!t) return false;
  if (t.mode && t.mode !== mode) return false;
  if (!t.from.includes(quote.status)) return false;
  if (t.indicativeOnly && quote.kind !== 'indicative') return false;
  if (t.formalOnly && quote.kind !== 'formal') return false;
  return can(role, t.permission);
}

/** Everything this role can do to this quotation, in the order it would be done. */
export const availableActions = (role: Role | null, quote: Pick<Quote, 'status' | 'kind'>, mode: ApprovalMode = 'single') =>
  transitions.filter(t => allows(role, quote, t.action, mode));

/**
 * A submitted enquiry becomes the supplier's to price, so picking it up turns the customer's
 * indicative record into a formal one. The customer keeps visibility of it; what they lose is the
 * ability to edit the figures underneath a quotation the supplier is now standing behind.
 */
export function applyAction(quote: Quote, action: QuoteAction, actor: { uid: string; displayName: string }, reason?: string): Quote {
  const t = transitions.find(x => x.action === action);
  if (!t) throw new Error(`Unknown quotation action: ${action}`);
  if (!t.from.includes(quote.status)) throw new Error(`A ${quote.status} quotation cannot be ${action}ed.`);
  const at = new Date().toISOString();
  const next: Quote = { ...quote, status: t.to, updatedAt: at };
  if (action === 'submit') { next.submittedAt = at; next.submittedBy = actor.displayName; }
  if (action === 'pick-up') next.kind = 'formal';
  if (action === 'approve') { next.approvedAt = at; next.approvedBy = actor.displayName; next.approvedByUid = actor.uid; next.returnedReason = null; }
  if (action === 'return') { next.returnedReason = reason?.trim() || 'Returned without a reason.'; next.approvedAt = null; next.approvedBy = null; next.approvedByUid = null; }
  if (action === 'send' || action === 'issue') next.sentAt = at;
  // Single-level release records who issued it, and pointedly does not touch the approval fields:
  // nobody approved this inside the system. The manager signs the document, and the document is
  // where that approval lives.
  if (action === 'issue') { next.issuedAt = at; next.issuedBy = actor.displayName; next.issuedByUid = actor.uid; }
  return next;
}

/** Whether the figures on this quotation may still be edited by this role. */
export const isEditable = (role: Role | null, quote: Pick<Quote, 'status' | 'kind'>) =>
  quote.kind === 'indicative'
    ? quote.status === 'draft' && can(role, 'quote.write')
    : ['draft', 'internal-review'].includes(quote.status) && can(role, 'quote.prepare');

/** Records this role may see at all. Staff see the workspace; a customer sees only their own. */
export const visibleQuotes = (role: Role | null, uid: string, quotes: Quote[]) =>
  can(role, 'pipeline.view') ? quotes : quotes.filter(q => q.ownerUid === uid);
