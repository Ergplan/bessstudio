import { describe, expect, it } from 'vitest';
import { inviteState, invitationProblem, invitableRoles, roleRank, type Invite, type Organization } from '../platform/types';
import { INVITE_DAYS, inviteLink, inviteToken, newInvite, registerLink, registrationProblem } from '../platform/joining';

const by = { uid: 'admin-1', displayName: 'An Admin' };
const make = (over: Partial<Invite> = {}): Invite => ({
  ...newInvite({ orgId: 'org_1', email: 'Guest@Example.com', role: 'customer', by }),
  ...over,
});

describe('invitation tokens', () => {
  it('is long enough not to be guessed, and never repeats', () => {
    const seen = new Set(Array.from({ length: 500 }, inviteToken));
    expect(seen.size).toBe(500);
    for (const t of seen) expect(t).toMatch(/^[0-9a-f]{32}$/);
  });

  it('lower-cases the invited address, so matching is not case-sensitive', () => {
    expect(make().email).toBe('guest@example.com');
  });

  it('expires', () => {
    const invite = make();
    const days = (new Date(invite.expiresAt).getTime() - new Date(invite.createdAt).getTime()) / 864e5;
    expect(Math.round(days)).toBe(INVITE_DAYS);
  });

  it('carries expiry as a number too, because the rules cannot parse a date string', () => {
    const invite = make();
    expect(invite.expiresAtMs).toBe(new Date(invite.expiresAt).getTime());
    expect(Number.isFinite(invite.expiresAtMs)).toBe(true);
  });

  it('builds an absolute link carrying both the workspace and the token', () => {
    const invite = make();
    const link = inviteLink(invite, 'https://bessstudio-e55e1.web.app');
    expect(link).toBe(`https://bessstudio-e55e1.web.app/join/?org=org_1&token=${invite.token}`);
    expect(registerLink('org_1', 'https://x.test')).toBe('https://x.test/register/?org=org_1');
  });
});

describe('invitation state', () => {
  it('reads pending until something changes it', () => {
    expect(inviteState(make())).toBe('pending');
  });

  it('prefers the most final answer when several apply', () => {
    // A revoked invitation that was also accepted and has also expired still reads revoked.
    const past = new Date(Date.now() - 864e5).toISOString();
    expect(inviteState(make({ revokedAt: past, acceptedAt: past, expiresAt: past }))).toBe('revoked');
    expect(inviteState(make({ acceptedAt: past, expiresAt: past }))).toBe('accepted');
    expect(inviteState(make({ expiresAt: past }))).toBe('expired');
  });

  it('treats the expiry instant as expired, not as the last usable moment', () => {
    const at = new Date('2026-01-01T00:00:00.000Z');
    expect(inviteState(make({ expiresAt: at.toISOString() }), at)).toBe('expired');
  });
});

describe('accepting an invitation', () => {
  it('refuses a link that is not an invitation at all', () => {
    expect(invitationProblem(null, 'guest@example.com')).toMatch(/not valid/i);
  });

  it('refuses a withdrawn, used or expired invitation, and says which', () => {
    const past = new Date(Date.now() - 864e5).toISOString();
    expect(invitationProblem(make({ revokedAt: past }), 'guest@example.com')).toMatch(/withdrawn/i);
    expect(invitationProblem(make({ acceptedAt: past }), 'guest@example.com')).toMatch(/already been used/i);
    expect(invitationProblem(make({ expiresAt: past }), 'guest@example.com')).toMatch(/expired/i);
  });

  it('refuses an address the invitation was not sent to, and names both', () => {
    const problem = invitationProblem(make(), 'someone.else@example.com');
    expect(problem).toContain('guest@example.com');
    expect(problem).toContain('someone.else@example.com');
  });

  it('ignores case and surrounding space in the address', () => {
    expect(invitationProblem(make(), '  GUEST@Example.com ')).toBeNull();
  });

  it('asks a signed-out visitor to sign in rather than failing silently', () => {
    expect(invitationProblem(make(), null)).toMatch(/sign in/i);
  });

  it('accepts a valid invitation for the right address', () => {
    expect(invitationProblem(make(), 'guest@example.com')).toBeNull();
  });
});

describe('who may invite whom', () => {
  it('lets nobody without org.manage invite at all', () => {
    for (const r of ['sales', 'approver', 'engineer', 'viewer', 'customer'] as const)
      expect(invitableRoles(r)).toEqual([]);
    expect(invitableRoles(null)).toEqual([]);
  });

  it('never lets an inviter hand out a role above their own', () => {
    for (const inviter of ['owner', 'admin'] as const)
      for (const granted of invitableRoles(inviter))
        expect(roleRank[granted]).toBeLessThanOrEqual(roleRank[inviter]);
  });

  it('lets an admin invite a customer, and an owner invite an admin', () => {
    expect(invitableRoles('admin')).toContain('customer');
    expect(invitableRoles('owner')).toContain('admin');
    // An admin cannot create an owner.
    expect(invitableRoles('admin')).not.toContain('owner');
  });
});

describe('customer self-registration', () => {
  const org = (over: Partial<Organization> = {}) => ({ id: 'org_1', name: 'Solarworld', ...over } as Organization);

  it('is closed unless the workspace has been opened deliberately', () => {
    expect(registrationProblem(org())).toMatch(/not open/i);
    expect(registrationProblem(org({ customerSignupEnabled: false }))).toMatch(/not open/i);
  });

  it('is allowed once the workspace opts in', () => {
    expect(registrationProblem(org({ customerSignupEnabled: true }))).toBeNull();
  });

  it('says so plainly when the workspace does not exist', () => {
    expect(registrationProblem(null)).toMatch(/could not be found/i);
  });
});
