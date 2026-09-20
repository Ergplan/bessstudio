import { z } from 'zod';
import type { Branding } from '../brand/brand';
import type { SizingInput } from '../sizing/engine';
import type { Currency, PriceBook } from '../catalog/pricing';

export type Role = 'owner' | 'admin' | 'sales' | 'engineer' | 'viewer';
export const roles: Role[] = ['owner', 'admin', 'sales', 'engineer', 'viewer'];
export const roleRank: Record<Role, number> = { owner: 5, admin: 4, engineer: 3, sales: 2, viewer: 1 };

export type Permission = 'org.manage' | 'customer.write' | 'project.write' | 'quote.write' | 'quote.approve' | 'pricebook.write' | 'read';
const grants: Record<Role, Permission[]> = {
  owner: ['org.manage', 'customer.write', 'project.write', 'quote.write', 'quote.approve', 'pricebook.write', 'read'],
  admin: ['org.manage', 'customer.write', 'project.write', 'quote.write', 'quote.approve', 'pricebook.write', 'read'],
  engineer: ['customer.write', 'project.write', 'quote.write', 'read'],
  sales: ['customer.write', 'project.write', 'quote.write', 'read'],
  viewer: ['read'],
};
export const can = (role: Role | null, permission: Permission) => !!role && grants[role].includes(permission);

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
};

export type QuoteStatus = 'draft' | 'internal-review' | 'sent' | 'won' | 'lost' | 'expired';
export const quoteStatuses: QuoteStatus[] = ['draft', 'internal-review', 'sent', 'won', 'lost', 'expired'];
export type QuoteLine = { id: string; category: string; label: string; quantity: number; unit: string; unitPrice: number; total: number; note?: string; optional: boolean };
export type Quote = {
  id: string; orgId: string; customerId: string; customerName: string; projectId: string; projectName: string;
  number: string; version: number; status: QuoteStatus; currency: Currency;
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
