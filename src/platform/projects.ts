import { connectionKV, defaultSizingInput, sizeSystem } from '../sizing/engine';

/**
 * The account a design lands on when it is raised from the opening question, before anybody has
 * said who it is for. Named in one place so the project page can recognise it and ask.
 */
export const HOLDING_ACCOUNT = 'New opportunity';
import { nowIso, uid, type Customer, type Project } from './types';
import type { SizingInput } from '../sizing/engine';

/**
 * Making and moving a project.
 *
 * Both used to happen inline wherever a project was created, and the two paths had already drifted:
 * the one behind the opening question stamped an owner, the one on the customer page did not — so a
 * project raised there belonged to nobody and a customer would have lost sight of their own record.
 * One constructor, used everywhere, is what stops that happening again.
 */

/** A reference like `BAL-03`, from the customer's name and how many they already have. */
export const projectReference = (customerName: string, existing: number) =>
  `${customerName.replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase() || 'PRJ'}-${String(existing + 1).padStart(2, '0')}`;

/** The same input, with the stated connection voltage set to the one the fitted design presents. */
const atItsOwnConnection = (sizing: SizingInput): SizingInput => {
  try { return { ...sizing, gridKV: connectionKV(sizeSystem(sizing)) }; } catch { return sizing; }
};

export function newProject(args: {
  orgId: string;
  customer: Pick<Customer, 'id' | 'name' | 'city' | 'country'>;
  name: string;
  /** How many this customer already has, for the reference. */
  existing: number;
  by: { uid: string; displayName: string };
  sizing?: SizingInput;
}): Project {
  const at = nowIso();
  return {
    id: uid('prj'), orgId: args.orgId,
    customerId: args.customer.id, customerName: args.customer.name,
    name: args.name.trim(),
    reference: projectReference(args.customer.name, args.existing),
    status: 'sizing',
    site: {
      location: [args.customer.city, args.customer.country].filter(Boolean).join(', '),
      latitude: null, longitude: null, gridOperator: '', commissioningTarget: '',
    },
    // Opened at the connection the design actually makes. The grid-scale default of 33 kV on a
    // five-kilowatt supply with a 230 V inverter and no transformer is not a setting anybody chose,
    // and the design opens carrying a warning it did not earn.
    sizing: atItsOwnConnection(args.sizing ?? defaultSizingInput()),
    studioConfig: null, studioImage: null, notes: '',
    ownerUid: args.by.uid,
    createdAt: at, updatedAt: at, updatedBy: args.by.displayName,
  };
}

/**
 * Move a project to a different customer.
 *
 * The opening question parks every anonymous design on one holding account called "New
 * opportunity", which is fine for the first one and a dead end for the second — without this there
 * is no way to ever separate them. The denormalised `customerName` has to move with the id, or the
 * project keeps showing the old customer everywhere it is listed.
 */
export function reassign(project: Project, customer: Pick<Customer, 'id' | 'name'>, by: { displayName: string }): Project {
  if (customer.id === project.customerId) return project;
  return {
    ...project,
    customerId: customer.id,
    customerName: customer.name,
    updatedAt: nowIso(),
    updatedBy: by.displayName,
  };
}

/**
 * Whether moving this project would leave quotations pointing at the wrong customer.
 *
 * Quotations carry their own snapshot of the customer, deliberately — an issued offer must not
 * change because a record was tidied up afterwards. So the move is allowed and the caller is told
 * what will not follow it.
 */
export const quotesLeftBehind = (quotes: { projectId: string }[], projectId: string) =>
  quotes.filter(q => q.projectId === projectId).length;
