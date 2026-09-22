import { z } from 'zod';
import type { Branding } from '../brand/brand';
import type { SizingInput } from '../sizing/engine';
import type { Currency, PriceBook } from '../catalog/pricing';

/**
 * Who can do what.
 *
 * Two populations share one system. Inside the supplier, `sales` works the pipeline and prepares
 * the formal quotation and `approver` releases it; `engineer` sizes; `admin` and `owner` run the
 * organization. Outside it there is exactly one external role, `customer`: they size their own
 * plant, price it indicatively and submit it, and they see their own records and nothing else.
 *
 * This table is the only description of that, and both the interface and the Firestore rules are
 * written from it — a permission added here has to be added in `firestore.rules` too, because the
 * rules are what actually enforce it.
 */
export type Role = 'owner' | 'admin' | 'approver' | 'sales' | 'engineer' | 'viewer' | 'customer';
export const roles: Role[] = ['owner', 'admin', 'approver', 'sales', 'engineer', 'viewer', 'customer'];
export const roleRank: Record<Role, number> = { owner: 7, admin: 6, approver: 5, engineer: 4, sales: 3, viewer: 2, customer: 1 };
/** The external role. Everything else is staff, and staff see the whole workspace. */
export const isCustomerRole = (role: Role | null) => role === 'customer';
export const staffRoles: Role[] = ['owner', 'admin', 'approver', 'sales', 'engineer', 'viewer'];

export const roleLabels: Record<Role, string> = {
  owner: 'Owner', admin: 'Administrator', approver: 'Approver', sales: 'Sales',
  engineer: 'Engineer', viewer: 'Viewer', customer: 'Customer',
};
export const roleDescriptions: Record<Role, string> = {
  owner: 'Full control of the organization, its members and its price books.',
  admin: 'Manages members, branding and price books.',
  approver: 'Releases formal quotations. The only role that can issue a price to a customer.',
  sales: 'Works the pipeline and prepares formal quotations for approval.',
  engineer: 'Sizes and engineers projects. Does not issue prices.',
  viewer: 'Reads the workspace without changing it.',
  customer: 'Designs and prices their own plant indicatively, and submits it for a formal quotation.',
};

export type Permission =
  | 'org.manage' | 'customer.write' | 'project.write' | 'quote.write' | 'pricebook.write' | 'read'
  /** Prepare a formal quotation from a submitted enquiry. */
  | 'quote.prepare'
  /** Send a prepared quotation for approval. */
  | 'quote.request-approval'
  /** Release a formal quotation. Deliberately separated from preparing one. */
  | 'quote.approve'
  /** Submit an indicative design for a formal quotation. The customer's one write into the pipeline. */
  | 'quote.submit'
  /** See the whole organization's records rather than only one's own. */
  | 'pipeline.view'
  /** See prices, margins and the financial model at all. Email verification gates this further. */
  | 'finance.view';

const grants: Record<Role, Permission[]> = {
  owner: ['org.manage', 'customer.write', 'project.write', 'quote.write', 'quote.prepare', 'quote.request-approval', 'quote.approve', 'pricebook.write', 'pipeline.view', 'finance.view', 'read'],
  admin: ['org.manage', 'customer.write', 'project.write', 'quote.write', 'quote.prepare', 'quote.request-approval', 'quote.approve', 'pricebook.write', 'pipeline.view', 'finance.view', 'read'],
  approver: ['customer.write', 'project.write', 'quote.write', 'quote.prepare', 'quote.request-approval', 'quote.approve', 'pipeline.view', 'finance.view', 'read'],
  sales: ['customer.write', 'project.write', 'quote.write', 'quote.prepare', 'quote.request-approval', 'pipeline.view', 'finance.view', 'read'],
  engineer: ['customer.write', 'project.write', 'quote.write', 'pipeline.view', 'finance.view', 'read'],
  viewer: ['pipeline.view', 'finance.view', 'read'],
  // The customer owns their own design and may price it indicatively, but cannot approve anything,
  // cannot see anyone else's records, and cannot prepare a formal quotation.
  customer: ['project.write', 'quote.write', 'quote.submit', 'finance.view', 'read'],
};
export const can = (role: Role | null, permission: Permission) => !!role && grants[role].includes(permission);

/**
 * Financial figures additionally require a verified email address, whoever is asking.
 *
 * A price is the one thing in here that a stranger could act on, so it is not shown to an address
 * nobody has proved they control. The demo workspace has no mail to verify against and is
 * self-evidently not a real price, so it is treated as verified.
 */
export const canSeeFinancials = (role: Role | null, emailVerified: boolean) =>
  can(role, 'finance.view') && emailVerified;

export type Member = {
  uid: string; email: string; displayName: string; role: Role; addedAt: string;
  /** The invitation this membership was created from, which is what authorised its role. */
  inviteToken?: string | null;
  /**
   * When this person last looked at their notifications. One timestamp rather than a read flag per
   * item, because the items are derived rather than stored — there is nothing to mark.
   */
  notificationsSeenAt?: string | null;
};
export type Organization = {
  id: string; name: string; branding: Branding; currency: Currency;
  plan: 'trial' | 'standard' | 'enterprise'; createdAt: string; createdBy: string;
  /**
   * Whether a stranger arriving from the website may register themselves into this workspace as a
   * customer. Off by default: opening a tenant to the public is a decision, not an accident.
   */
  customerSignupEnabled?: boolean;
  /**
   * How a quotation gets released.
   *
   * `single` — the default — is one level inside the system: whoever prepares the quotation issues
   * it and downloads the PDF, and a manager approves that PDF outside the application, signing the
   * approval block the document carries. `two-step` keeps the release inside the system and
   * requires a separate approver, so preparing and releasing cannot be the same person.
   *
   * Single is the default because it is what a small team actually does, and because it makes the
   * whole journey testable by one account. The two-step machinery stays built and tested either
   * way; this only decides which path the interface and the rules offer.
   */
  approvalMode?: ApprovalMode;
};

export type ApprovalMode = 'single' | 'two-step';
/** Absent means single. A tenant opts in to the stricter path, never out of it by accident. */
export const approvalModeOf = (org: { approvalMode?: ApprovalMode } | null | undefined): ApprovalMode =>
  org?.approvalMode === 'two-step' ? 'two-step' : 'single';

/**
 * An invitation to join an organization at a named role.
 *
 * There is no mail server on the free plan, so the invitation is a link the inviter sends however
 * they like, and the document id is the token in it. Knowing the token is therefore what proves
 * you were invited — which is why it is long, single-use and expiring, and why acceptance also
 * requires the signed-in address to match the one invited.
 */
export type Invite = {
  token: string; orgId: string; email: string; role: Role;
  createdAt: string; createdBy: string; createdByUid: string;
  expiresAt: string;
  /**
   * The same instant in epoch milliseconds. The rules language cannot parse an ISO string, so
   * expiry has to be comparable as a number for the check to happen where it counts.
   */
  expiresAtMs: number;
  acceptedAt?: string | null; acceptedByUid?: string | null;
  revokedAt?: string | null;
  note?: string;
};

export type InviteState = 'pending' | 'accepted' | 'revoked' | 'expired';

/** Where an invitation stands right now, which is not always what its fields say on their own. */
export function inviteState(invite: Invite, now = new Date()): InviteState {
  if (invite.revokedAt) return 'revoked';
  if (invite.acceptedAt) return 'accepted';
  return new Date(invite.expiresAt) <= now ? 'expired' : 'pending';
}

/**
 * Whether this signed-in address may accept this invitation.
 *
 * Returns the reason it cannot rather than a bare false, because every one of these is something
 * the person at the keyboard needs told plainly — a link that silently does nothing is worse than
 * one that says it expired.
 */
export function invitationProblem(invite: Invite | null, email: string | null, now = new Date()): string | null {
  if (!invite) return 'That invitation link is not valid. Ask whoever sent it for a new one.';
  const state = inviteState(invite, now);
  if (state === 'revoked') return 'That invitation has been withdrawn. Ask whoever sent it for a new one.';
  if (state === 'accepted') return 'That invitation has already been used. Sign in instead.';
  if (state === 'expired') return 'That invitation has expired. Ask whoever sent it for a new one.';
  if (!email) return 'Sign in with the address the invitation was sent to.';
  if (email.trim().toLowerCase() !== invite.email.trim().toLowerCase())
    return `This invitation was sent to ${invite.email}. You are signed in as ${email}.`;
  return null;
}

/** Roles an inviter of this role may hand out. Nobody may invite above themselves. */
export const invitableRoles = (inviter: Role | null): Role[] => {
  if (!inviter || !can(inviter, 'org.manage')) return [];
  return roles.filter(r => roleRank[r] <= roleRank[inviter]);
};

export type Contact = { id: string; name: string; title: string; email: string; phone: string; primary: boolean };
export type CustomerStage = 'lead' | 'qualified' | 'proposal' | 'negotiation' | 'won' | 'lost';
export const customerStages: CustomerStage[] = ['lead', 'qualified', 'proposal', 'negotiation', 'won', 'lost'];
export type Segment = 'utility' | 'commercial' | 'industrial' | 'epc' | 'developer' | 'telecom' | 'data-centre' | 'mining' | 'government';
export const segments: Segment[] = ['utility', 'commercial', 'industrial', 'epc', 'developer', 'telecom', 'data-centre', 'mining', 'government'];

export type Customer = {
  id: string; orgId: string; name: string; segment: Segment; stage: CustomerStage;
  country: string; city: string; website: string; notes: string;
  contacts: Contact[]; ownerUid: string; ownerName: string;
  createdAt: string; updatedAt: string;
};

export type ProjectStatus = 'draft' | 'sizing' | 'engineering' | 'quoted' | 'awarded' | 'archived';
export type Project = {
  id: string; orgId: string; customerId: string; customerName: string;
  name: string; reference: string; status: ProjectStatus;
  site: { location: string; latitude: number | null; longitude: number | null; gridOperator: string; commissioningTarget: string };
  sizing: SizingInput;
  studioConfig: unknown | null;   // serialised 3D studio configuration, when engineering has opened it
  studioImage?: string | null;    // captured assembly view, used as the offer cover
  notes: string; createdAt: string; updatedAt: string; updatedBy: string;
  /** Who raised it. A customer's workspace is the set of records carrying their own uid. */
  ownerUid?: string;
};

/**
 * A quotation is either the customer's own indicative pricing or the supplier's formal offer.
 * The indicative one is a self-service estimate and says so on its face; it becomes a formal
 * quotation only by going through sales and an approver, never by being edited into one.
 */
export type QuoteKind = 'indicative' | 'formal';

export type QuoteStatus =
  | 'draft'             // being worked on by whoever owns it
  | 'submitted'         // the customer has asked for a formal quotation
  | 'internal-review'   // sales has picked it up
  | 'pending-approval'  // prepared, waiting on an approver
  | 'approved'          // released by an approver, not yet sent
  | 'sent' | 'won' | 'lost' | 'expired';
export const quoteStatuses: QuoteStatus[] = ['draft', 'submitted', 'internal-review', 'pending-approval', 'approved', 'sent', 'won', 'lost', 'expired'];
/** Statuses a customer may see on their own record, with the wording they see. */
export const customerStatusLabels: Partial<Record<QuoteStatus, string>> = {
  draft: 'Draft', submitted: 'With our sales team', 'internal-review': 'Being prepared',
  'pending-approval': 'Being approved', approved: 'Approved', sent: 'Formal quotation issued',
  won: 'Accepted', lost: 'Closed', expired: 'Expired',
};
export type QuoteLine = { id: string; category: string; label: string; quantity: number; unit: string; unitPrice: number; total: number; note?: string; optional: boolean };
export type Quote = {
  id: string; orgId: string; customerId: string; customerName: string; projectId: string; projectName: string;
  number: string; version: number; status: QuoteStatus; currency: Currency;
  kind: QuoteKind;
  /** Who raised it, so a customer's own records can be found without reading anyone else's. */
  ownerUid: string;
  submittedAt?: string | null; submittedBy?: string | null;
  approvedAt?: string | null; approvedBy?: string | null; approvedByUid?: string | null;
  /**
   * Single-level release. Deliberately not the `approved*` fields: nobody approved this inside the
   * system, so the record must not say they did. The manager's approval is a signature on the PDF.
   */
  issuedAt?: string | null; issuedBy?: string | null; issuedByUid?: string | null;
  /** Set when an approver sends it back, so the reason survives the round trip. */
  returnedReason?: string | null;
  lines: QuoteLine[];
  discountPct: number; taxPct: number; freight: number;
  subtotal: number; discount: number; tax: number; total: number;
  validUntil: string; incoterms: string; paymentTerms: string; deliveryWeeks: number; warrantyYears: number;
  scopeIncluded: string[]; scopeExcluded: string[]; assumptions: string[];
  sizingSnapshot: unknown; financeSnapshot: unknown; priceBookId: string;
  offer?: Record<string, unknown>;   // narrative overrides for the offer document
  preparedBy: string; preparedByEmail: string; createdAt: string; updatedAt: string; sentAt: string | null;
};

export type ActivityKind = 'created' | 'updated' | 'status' | 'note' | 'quote-sent' | 'quote-won' | 'quote-lost' | 'demo';
export type Activity = { id: string; orgId: string; refType: 'customer' | 'project' | 'quote'; refId: string; refName: string; kind: ActivityKind; message: string; actorUid: string; actorName: string; at: string };

export type OrgSettings = { priceBook: PriceBook };

export const contactSchema = z.object({ id: z.string(), name: z.string().min(1), title: z.string(), email: z.string().email().or(z.literal('')), phone: z.string(), primary: z.boolean() });
export const customerSchema = z.object({
  name: z.string().min(2, 'Customer name needs at least two characters'), segment: z.string(), stage: z.string(),
  country: z.string(), city: z.string(), website: z.string(), notes: z.string(), contacts: z.array(contactSchema),
});
export const projectSchema = z.object({ name: z.string().min(2, 'Project name needs at least two characters'), reference: z.string(), notes: z.string() });

export const uid = (prefix: string) => `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
export const nowIso = () => new Date().toISOString();
