import { repository } from './repo';
import { nowIso, invitationProblem, type Invite, type Member, type Organization, type Role } from './types';

/**
 * Joining an existing organization — by invitation, or by registering as a customer.
 *
 * There is no server here. On the free plan nothing privileged runs between the browser and the
 * database, so both paths are client writes that the Firestore rules have to be willing to accept
 * on their own. That shapes the design:
 *
 *  - An invitation is a bearer token. The document id is unguessable, single-use and expiring, and
 *    acceptance also requires the signed-in address to match the invited one, so possession of the
 *    link alone is not quite enough.
 *  - Customer registration needs no token, so it is gated on the organization itself carrying
 *    `customerSignupEnabled`, and it can only ever produce the `customer` role.
 *
 * Neither path can mint a role: the invitation names it, or it is `customer`. The rules check the
 * same two things.
 */

/** 32 hex characters from the platform's own generator, not Math.random. */
export function inviteToken(): string {
  const bytes = new Uint8Array(16);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

export const INVITE_DAYS = 14;

export function newInvite(args: { orgId: string; email: string; role: Role; by: { uid: string; displayName: string }; note?: string }): Invite {
  const expires = new Date(Date.now() + INVITE_DAYS * 864e5);
  return {
    token: inviteToken(), orgId: args.orgId, email: args.email.trim().toLowerCase(), role: args.role,
    createdAt: nowIso(), createdBy: args.by.displayName, createdByUid: args.by.uid,
    expiresAt: expires.toISOString(), expiresAtMs: expires.getTime(),
    acceptedAt: null, acceptedByUid: null, revokedAt: null, note: args.note ?? '',
  };
}

/** The link the inviter sends. Absolute, because it is going into a mail somebody else writes. */
export const inviteLink = (invite: Invite, origin?: string) =>
  `${origin ?? globalThis.location?.origin ?? ''}/join/?org=${encodeURIComponent(invite.orgId)}&token=${encodeURIComponent(invite.token)}`;

export const registerLink = (orgId: string, origin?: string) =>
  `${origin ?? globalThis.location?.origin ?? ''}/register/?org=${encodeURIComponent(orgId)}`;

/**
 * Accept an invitation for a signed-in account.
 *
 * The membership carries the token it was created from, because that is what the rules read to
 * confirm the role being claimed is the role that was offered.
 */
export async function acceptInvite(invite: Invite, account: { uid: string; email: string; displayName: string }): Promise<Member> {
  const problem = invitationProblem(invite, account.email);
  if (problem) throw new Error(problem);
  const repo = repository();
  const member: Member = {
    uid: account.uid, email: account.email, displayName: account.displayName,
    role: invite.role, addedAt: nowIso(), inviteToken: invite.token,
  };
  await repo.saveMember(invite.orgId, member);
  // Burn the token. A failure here leaves a usable invitation rather than a member without one,
  // which is the safer way round: the membership is what grants access and it is already written.
  await repo.saveInvite({ ...invite, acceptedAt: nowIso(), acceptedByUid: account.uid });
  return member;
}

/** Why this organization cannot be registered into, or null if it can. */
export function registrationProblem(org: Organization | null): string | null {
  if (!org) return 'That workspace could not be found. Check the link you followed.';
  if (!org.customerSignupEnabled) return `${org.name} is not open for self-registration. Ask them for an invitation.`;
  return null;
}

/** Register a signed-in account into an organization as a customer. Never any other role. */
export async function registerAsCustomer(org: Organization, account: { uid: string; email: string; displayName: string }): Promise<Member> {
  const problem = registrationProblem(org);
  if (problem) throw new Error(problem);
  const member: Member = {
    uid: account.uid, email: account.email, displayName: account.displayName,
    role: 'customer', addedAt: nowIso(), inviteToken: null,
  };
  await repository().saveMember(org.id, member);
  return member;
}

/**
 * The organization a visitor with no link lands in.
 *
 * Set `NEXT_PUBLIC_PUBLIC_ORG_ID` to the supplier's workspace once it exists, so that "Create an
 * account" from the website joins that workspace as a customer rather than opening an empty one.
 * Unset, registration requires an explicit `?org=` and says so.
 */
export const publicOrgId = (): string | null => process.env.NEXT_PUBLIC_PUBLIC_ORG_ID?.trim() || null;
