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

export type Member = { uid: string; email: string; displayName: string; role: Role; addedAt: string };
export type Organization = { id: string; name: string; branding: Branding; currency: Currency; plan: 'trial' | 'standard' | 'enterprise'; createdAt: string; createdBy: string };

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
