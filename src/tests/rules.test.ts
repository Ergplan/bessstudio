/**
 * Firestore security rules, exercised against the real rules engine in the emulator.
 *
 * Everything else in this suite tests what the interface decides. This tests what the database
 * will actually accept, which is the only answer that matters: a client can be modified, the rules
 * cannot. Run with `npm run test:rules`, which starts the emulator around it.
 */
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs } from 'firebase/firestore';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const ORG = 'org_solarworld';
const day = 864e5;
let env: RulesTestEnvironment;

/** A signed-in context. Email verification is part of the token, so it is set here. */
const as = (uid: string, email: string, emailVerified = true) =>
  env.authenticatedContext(uid, { email, email_verified: emailVerified }).firestore();

const path = (...parts: string[]) => parts.join('/');
const orgPath = (...parts: string[]) => path('organizations', ORG, ...parts);

const quote = (over: Record<string, unknown> = {}) => ({
  orgId: ORG, ownerUid: 'cust', kind: 'indicative', status: 'draft',
  number: 'JW-Q-2026-0001', total: 1000, approvedByUid: null, ...over,
});

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'bessstudio-rules-test',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
  });
});
afterAll(async () => { await env?.cleanup(); });

beforeEach(async () => {
  await env.clearFirestore();
  // Seed through a context that bypasses the rules, so the fixtures are not themselves a test.
  await env.withSecurityRulesDisabled(async ctx => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'organizations', ORG), { name: 'Solarworld', createdBy: 'owner', customerSignupEnabled: false });
    for (const [uid, role] of [['owner', 'owner'], ['admin', 'admin'], ['sales', 'sales'], ['appr', 'approver'], ['eng', 'engineer'], ['cust', 'customer'], ['cust2', 'customer']] as const)
      await setDoc(doc(db, orgPath('members', uid)), { uid, role, email: `${uid}@example.com`, displayName: uid });
    await setDoc(doc(db, orgPath('customers', 'c1')), { orgId: ORG, name: 'A customer' });
    await setDoc(doc(db, orgPath('projects', 'p_cust')), { orgId: ORG, ownerUid: 'cust', name: 'Theirs' });
    await setDoc(doc(db, orgPath('projects', 'p_other')), { orgId: ORG, ownerUid: 'cust2', name: 'Someone else’s' });
    await setDoc(doc(db, orgPath('quotes', 'q_cust')), quote());
    await setDoc(doc(db, orgPath('quotes', 'q_other')), quote({ ownerUid: 'cust2' }));
    await setDoc(doc(db, orgPath('quotes', 'q_pending')), quote({ ownerUid: 'sales', kind: 'formal', status: 'pending-approval' }));
    await setDoc(doc(db, orgPath('settings', 'priceBook')), { currency: 'INR' });
  });
});

describe('tenant isolation', () => {
  it('refuses a stranger everything', async () => {
    const db = env.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, orgPath('quotes', 'q_cust'))));
    await assertFails(getDoc(doc(db, orgPath('customers', 'c1'))));
    await assertFails(setDoc(doc(db, orgPath('projects', 'x')), { orgId: ORG }));
  });

  it('refuses a signed-in non-member the workspace’s records', async () => {
    const db = as('nobody', 'nobody@example.com');
    await assertFails(getDoc(doc(db, orgPath('quotes', 'q_cust'))));
    await assertFails(getDoc(doc(db, orgPath('projects', 'p_cust'))));
    await assertFails(getDocs(collection(db, orgPath('members'))));
  });

  /**
   * A deliberate widening, pinned here so it cannot drift unnoticed. Somebody following an
   * invitation or a registration link has to see which workspace it belongs to before deciding to
   * join it, so the organization document itself is readable by any signed-in account. Its name,
   * branding and signup flag are all it carries; everything inside it stays shut.
   */
  it('lets a signed-in stranger see which workspace a link belongs to, and nothing in it', async () => {
    const db = as('nobody', 'nobody@example.com');
    await assertSucceeds(getDoc(doc(db, 'organizations', ORG)));
    await assertFails(getDoc(doc(db, orgPath('settings', 'priceBook'))));
    await assertFails(getDocs(collection(db, orgPath('customers'))));
    await assertFails(updateDoc(doc(db, 'organizations', ORG), { name: 'Renamed' }));
  });

  it('refuses a signed-out visitor even that', async () => {
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'organizations', ORG)));
  });

  it('refuses a record written into another tenant', async () => {
    const db = as('sales', 'sales@example.com');
    await assertFails(setDoc(doc(db, orgPath('projects', 'smuggled')), { orgId: 'some-other-org', name: 'x' }));
  });
});

describe('the financial gate', () => {
  it('refuses a quotation to an unverified address, however senior', async () => {
    for (const uid of ['owner', 'admin', 'sales', 'appr', 'cust'])
      await assertFails(getDoc(doc(as(uid, `${uid}@example.com`, false), orgPath('quotes', 'q_cust'))));
  });

  it('serves it once the address is verified', async () => {
    await assertSucceeds(getDoc(doc(as('sales', 'sales@example.com'), orgPath('quotes', 'q_cust'))));
  });

  it('refuses an unverified account writing a quotation', async () => {
    const db = as('sales', 'sales@example.com', false);
    await assertFails(setDoc(doc(db, orgPath('quotes', 'new')), quote({ kind: 'formal', ownerUid: 'sales' })));
  });

  it('leaves engineering open to an unverified account', async () => {
    await assertSucceeds(getDoc(doc(as('eng', 'eng@example.com', false), orgPath('projects', 'p_cust'))));
  });
});

describe('what a customer can reach', () => {
  it('sees their own project and quotation', async () => {
    const db = as('cust', 'cust@example.com');
    await assertSucceeds(getDoc(doc(db, orgPath('projects', 'p_cust'))));
    await assertSucceeds(getDoc(doc(db, orgPath('quotes', 'q_cust'))));
  });

  it('cannot read another customer’s project or quotation', async () => {
    const db = as('cust', 'cust@example.com');
    await assertFails(getDoc(doc(db, orgPath('projects', 'p_other'))));
    await assertFails(getDoc(doc(db, orgPath('quotes', 'q_other'))));
  });

  it('cannot read the pipeline, the staff list, the price book or the audit trail', async () => {
    const db = as('cust', 'cust@example.com');
    await assertFails(getDoc(doc(db, orgPath('customers', 'c1'))));
    await assertFails(getDocs(collection(db, orgPath('members'))));
    await assertFails(getDoc(doc(db, orgPath('settings', 'priceBook'))));
    await assertFails(getDocs(collection(db, orgPath('activities'))));
  });

  it('may raise its own indicative draft', async () => {
    const db = as('cust', 'cust@example.com');
    await assertSucceeds(setDoc(doc(db, orgPath('quotes', 'mine')), quote({ ownerUid: 'cust' })));
  });

  it('may not raise a formal quotation, nor one owned by somebody else', async () => {
    const db = as('cust', 'cust@example.com');
    await assertFails(setDoc(doc(db, orgPath('quotes', 'f')), quote({ ownerUid: 'cust', kind: 'formal' })));
    await assertFails(setDoc(doc(db, orgPath('quotes', 'x')), quote({ ownerUid: 'sales' })));
  });

  it('may submit its own draft, and go no further', async () => {
    const db = as('cust', 'cust@example.com');
    await assertSucceeds(updateDoc(doc(db, orgPath('quotes', 'q_cust')), { status: 'submitted' }));
    await env.withSecurityRulesDisabled(async c => {
      await setDoc(doc(c.firestore(), orgPath('quotes', 'q_cust')), quote());
    });
    await assertFails(updateDoc(doc(db, orgPath('quotes', 'q_cust')), { status: 'approved' }));
    await assertFails(updateDoc(doc(db, orgPath('quotes', 'q_cust')), { status: 'sent' }));
    await assertFails(updateDoc(doc(db, orgPath('quotes', 'q_cust')), { kind: 'formal' }));
  });

  it('cannot promote itself', async () => {
    const db = as('cust', 'cust@example.com');
    await assertFails(updateDoc(doc(db, orgPath('members', 'cust')), { role: 'owner' }));
    await assertFails(setDoc(doc(db, orgPath('members', 'cust2')), { uid: 'cust2', role: 'admin' }));
  });
});

describe('notification read state', () => {
  it('lets a member mark their own notifications seen', async () => {
    await assertSucceeds(updateDoc(doc(as('sales', 'sales@example.com'), orgPath('members', 'sales')),
      { notificationsSeenAt: new Date().toISOString() }));
  });

  it('refuses marking somebody else’s seen', async () => {
    await assertFails(updateDoc(doc(as('sales', 'sales@example.com'), orgPath('members', 'cust')),
      { notificationsSeenAt: new Date().toISOString() }));
  });

  it('still refuses a member promoting themselves while touching it', async () => {
    await assertFails(updateDoc(doc(as('cust', 'cust@example.com'), orgPath('members', 'cust')),
      { notificationsSeenAt: new Date().toISOString(), role: 'owner' }));
  });
});

describe('single-level release', () => {
  it('lets sales issue directly, without claiming an approval nobody gave', async () => {
    const db = as('sales', 'sales@example.com');
    await assertSucceeds(updateDoc(doc(db, orgPath('quotes', 'q_pending')),
      { status: 'sent', issuedByUid: 'sales', issuedAt: new Date().toISOString() }));
  });

  it('still refuses sales writing the approval fields while issuing', async () => {
    const db = as('sales', 'sales@example.com');
    await assertFails(updateDoc(doc(db, orgPath('quotes', 'q_pending')),
      { status: 'sent', approvedByUid: 'sales' }));
  });

  it('refuses a customer issuing anything', async () => {
    const db = as('cust', 'cust@example.com');
    await assertFails(updateDoc(doc(db, orgPath('quotes', 'q_cust')),
      { status: 'sent', issuedByUid: 'cust' }));
  });
});

describe('approval is the approver’s alone', () => {
  it('lets an approver release a prepared quotation', async () => {
    await assertSucceeds(updateDoc(doc(as('appr', 'appr@example.com'), orgPath('quotes', 'q_pending')),
      { status: 'approved', approvedByUid: 'appr' }));
  });

  it('refuses sales releasing one, including its own', async () => {
    await assertFails(updateDoc(doc(as('sales', 'sales@example.com'), orgPath('quotes', 'q_pending')),
      { status: 'approved', approvedByUid: 'sales' }));
  });

  it('refuses sales recording an approval by any other route', async () => {
    await assertFails(updateDoc(doc(as('sales', 'sales@example.com'), orgPath('quotes', 'q_pending')),
      { approvedByUid: 'appr' }));
  });

  it('lets sales move a quotation short of approving it', async () => {
    await assertSucceeds(updateDoc(doc(as('sales', 'sales@example.com'), orgPath('quotes', 'q_pending')),
      { status: 'internal-review' }));
  });
});

describe('invitations', () => {
  const invite = (over: Record<string, unknown> = {}) => ({
    orgId: ORG, email: 'guest@example.com', role: 'engineer',
    createdBy: 'An Admin', createdByUid: 'admin', createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 14 * day).toISOString(), expiresAtMs: Date.now() + 14 * day,
    acceptedAt: null, acceptedByUid: null, revokedAt: null, ...over,
  });
  const seedInvite = (id: string, over: Record<string, unknown> = {}) =>
    env.withSecurityRulesDisabled(async c => { await setDoc(doc(c.firestore(), orgPath('invites', id)), invite(over)); });

  const member = (over: Record<string, unknown> = {}) => ({
    uid: 'guest', email: 'guest@example.com', displayName: 'Guest', role: 'engineer',
    addedAt: new Date().toISOString(), inviteToken: 'tok', ...over,
  });

  it('only an administrator may create or list them', async () => {
    await assertSucceeds(setDoc(doc(as('admin', 'admin@example.com'), orgPath('invites', 'a')), invite()));
    await assertFails(setDoc(doc(as('sales', 'sales@example.com'), orgPath('invites', 'b')), invite()));
    await assertFails(setDoc(doc(as('cust', 'cust@example.com'), orgPath('invites', 'c')), invite()));
    await seedInvite('tok');
    await assertSucceeds(getDocs(collection(as('admin', 'admin@example.com'), orgPath('invites'))));
    await assertFails(getDocs(collection(as('cust', 'cust@example.com'), orgPath('invites'))));
  });

  it('accepts a valid invitation from the invited address', async () => {
    await seedInvite('tok');
    await assertSucceeds(setDoc(doc(as('guest', 'guest@example.com'), orgPath('members', 'guest')), member()));
  });

  it('refuses an address the invitation was not sent to', async () => {
    await seedInvite('tok');
    await assertFails(setDoc(doc(as('guest', 'intruder@example.com'), orgPath('members', 'guest')), member({ email: 'intruder@example.com' })));
  });

  it('refuses a role the invitation did not name — this is the whole point', async () => {
    await seedInvite('tok');
    await assertFails(setDoc(doc(as('guest', 'guest@example.com'), orgPath('members', 'guest')), member({ role: 'owner' })));
    await assertFails(setDoc(doc(as('guest', 'guest@example.com'), orgPath('members', 'guest')), member({ role: 'admin' })));
  });

  it('refuses a revoked, used or expired invitation', async () => {
    await seedInvite('tok', { revokedAt: new Date().toISOString() });
    await assertFails(setDoc(doc(as('guest', 'guest@example.com'), orgPath('members', 'guest')), member()));
    await seedInvite('tok', { acceptedAt: new Date().toISOString(), acceptedByUid: 'someone' });
    await assertFails(setDoc(doc(as('guest', 'guest@example.com'), orgPath('members', 'guest')), member()));
    await seedInvite('tok', { expiresAtMs: Date.now() - day, expiresAt: new Date(Date.now() - day).toISOString() });
    await assertFails(setDoc(doc(as('guest', 'guest@example.com'), orgPath('members', 'guest')), member()));
  });

  it('refuses a token that does not exist', async () => {
    await assertFails(setDoc(doc(as('guest', 'guest@example.com'), orgPath('members', 'guest')), member({ inviteToken: 'made-up' })));
  });

  it('refuses a membership claiming no token at all', async () => {
    await assertFails(setDoc(doc(as('guest', 'guest@example.com'), orgPath('members', 'guest')), member({ inviteToken: null })));
  });

  it('lets the invited party burn the token, and nobody else', async () => {
    await seedInvite('tok');
    await assertFails(updateDoc(doc(as('other', 'other@example.com'), orgPath('invites', 'tok')), { acceptedByUid: 'other' }));
    await assertSucceeds(updateDoc(doc(as('guest', 'guest@example.com'), orgPath('invites', 'tok')),
      { acceptedAt: new Date().toISOString(), acceptedByUid: 'guest' }));
  });

  it('refuses the invited party rewriting the role or the expiry while accepting', async () => {
    await seedInvite('tok');
    const db = as('guest', 'guest@example.com');
    await assertFails(updateDoc(doc(db, orgPath('invites', 'tok')), { acceptedByUid: 'guest', role: 'owner' }));
    await assertFails(updateDoc(doc(db, orgPath('invites', 'tok')), { acceptedByUid: 'guest', expiresAtMs: Date.now() + 999 * day }));
  });
});

describe('customer self-registration', () => {
  const selfMember = (role = 'customer') => ({
    uid: 'walkin', email: 'walkin@example.com', displayName: 'Walk-in', role,
    addedAt: new Date().toISOString(), inviteToken: null,
  });
  const openSignup = (on: boolean) => env.withSecurityRulesDisabled(async c => {
    await setDoc(doc(c.firestore(), 'organizations', ORG), { name: 'Solarworld', createdBy: 'owner', customerSignupEnabled: on });
  });

  it('is refused while the workspace is closed', async () => {
    await assertFails(setDoc(doc(as('walkin', 'walkin@example.com'), orgPath('members', 'walkin')), selfMember()));
  });

  it('is allowed once the workspace opts in', async () => {
    await openSignup(true);
    await assertSucceeds(setDoc(doc(as('walkin', 'walkin@example.com'), orgPath('members', 'walkin')), selfMember()));
  });

  it('can never produce a role other than customer, even when open', async () => {
    await openSignup(true);
    for (const role of ['owner', 'admin', 'approver', 'sales', 'engineer', 'viewer'])
      await assertFails(setDoc(doc(as('walkin', 'walkin@example.com'), orgPath('members', 'walkin')), selfMember(role)));
  });

  it('cannot create a membership for somebody else', async () => {
    await openSignup(true);
    await assertFails(setDoc(doc(as('walkin', 'walkin@example.com'), orgPath('members', 'someone-else')), selfMember()));
  });
});

describe('the audit trail', () => {
  it('is append-only, and only under the writer’s own name', async () => {
    const db = as('sales', 'sales@example.com');
    await assertSucceeds(setDoc(doc(db, orgPath('activities', 'a1')), { orgId: ORG, actorUid: 'sales', at: new Date().toISOString() }));
    await assertFails(setDoc(doc(db, orgPath('activities', 'a2')), { orgId: ORG, actorUid: 'someone-else', at: new Date().toISOString() }));
    await assertFails(updateDoc(doc(db, orgPath('activities', 'a1')), { actorUid: 'x' }));
    await assertFails(deleteDoc(doc(db, orgPath('activities', 'a1'))));
  });
});

it('the rules file is the one the application ships', () => {
  expect(readFileSync('firestore.rules', 'utf8')).toContain('acceptingInvite');
});
