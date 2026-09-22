import { describe, expect, it } from 'vitest';
import { newProject, projectReference, quotesLeftBehind, reassign } from '../platform/projects';
import type { Customer, Project } from '../platform/types';

const customer = (over: Partial<Customer> = {}) =>
  ({ id: 'cus_1', name: 'Baltic Grid Services', city: 'Vilnius', country: 'Lithuania', ...over }) as Customer;
const by = { uid: 'u1', displayName: 'A Person' };

describe('creating a project', () => {
  const make = (over = {}) => newProject({ orgId: 'org_1', customer: customer(), name: ' Vilnius FCR-N ', existing: 2, by, ...over });

  it('always stamps an owner — the bug that let a project belong to nobody', () => {
    expect(make().ownerUid).toBe('u1');
  });

  it('trims the name, so a stray space does not become part of it', () => {
    expect(make().name).toBe('Vilnius FCR-N');
  });

  it('carries the customer’s location onto the site', () => {
    expect(make().site.location).toBe('Vilnius, Lithuania');
  });

  it('copes with a customer who has no location', () => {
    expect(make({ customer: customer({ city: '', country: '' }) }).site.location).toBe('');
  });

  it('numbers the reference from what the customer already has', () => {
    expect(make().reference).toBe('BAL-03');
    expect(make({ existing: 0 }).reference).toBe('BAL-01');
    expect(make({ existing: 11 }).reference).toBe('BAL-12');
  });

  it('builds a usable reference from a name with no usable letters', () => {
    expect(projectReference('123 / 456', 0)).toBe('PRJ-01');
    expect(projectReference('Ørsted A/S', 0)).toBe('RST-01');
  });

  it('starts in sizing, with no studio configuration and no capture', () => {
    const p = make();
    expect(p.status).toBe('sizing');
    expect(p.studioConfig).toBeNull();
    expect(p.studioImage).toBeNull();
  });
});

describe('moving a project to another customer', () => {
  const project = (over: Partial<Project> = {}) =>
    ({ id: 'prj_1', customerId: 'cus_holding', customerName: 'New opportunity', updatedAt: '2026-01-01T00:00:00.000Z', ...over }) as Project;

  it('moves the id and the denormalised name together', () => {
    const moved = reassign(project(), customer(), by);
    expect(moved.customerId).toBe('cus_1');
    expect(moved.customerName).toBe('Baltic Grid Services');
  });

  it('records who moved it and when', () => {
    const moved = reassign(project(), customer(), by);
    expect(moved.updatedBy).toBe('A Person');
    expect(moved.updatedAt).not.toBe('2026-01-01T00:00:00.000Z');
  });

  it('is a no-op for the customer it already belongs to, so nothing is touched needlessly', () => {
    const p = project({ customerId: 'cus_1', customerName: 'Baltic Grid Services' });
    expect(reassign(p, customer(), by)).toBe(p);
  });

  it('leaves everything else on the project alone', () => {
    const p = project({ name: 'Vilnius FCR-N', reference: 'NEW-01', ownerUid: 'someone' } as Partial<Project>);
    const moved = reassign(p, customer(), by);
    expect(moved.name).toBe('Vilnius FCR-N');
    expect(moved.reference).toBe('NEW-01');
    expect(moved.ownerUid).toBe('someone');
  });
});

describe('what a move leaves behind', () => {
  it('counts the quotations that keep their own customer snapshot', () => {
    const quotes = [{ projectId: 'prj_1' }, { projectId: 'prj_1' }, { projectId: 'prj_2' }];
    expect(quotesLeftBehind(quotes, 'prj_1')).toBe(2);
    expect(quotesLeftBehind(quotes, 'prj_3')).toBe(0);
  });
});
