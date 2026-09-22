'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  GoogleAuthProvider, createUserWithEmailAndPassword, onAuthStateChanged, sendEmailVerification,
  signInWithEmailAndPassword, signInWithPopup, signOut, updateProfile,
} from 'firebase/auth';
import { doc, setDoc, arrayUnion } from 'firebase/firestore';
import { firebase } from './firebase';
import { repository, demoModeActive, setDemoMode } from './repo';
import { defaultBranding } from '../brand/brand';
import { defaultPriceBook } from '../catalog/pricing';
import { nowIso, type Member, type Organization, type Role } from './types';
import { seedOrganization } from './seed';

export type SessionUser = { uid: string; email: string; displayName: string; photoURL: string | null; emailVerified: boolean };
export type Session = {
  ready: boolean; user: SessionUser | null; org: Organization | null; role: Role | null;
  organizations: Organization[]; mode: 'firestore' | 'local'; error: string;
  /**
   * Whether this session may be shown prices. A verified address is required for it, so an
   * unverified account can design and engineer but sees no money until it proves the mailbox.
   */
  emailVerified: boolean;
  /** Re-send the verification mail. Resolves to the message to show, verified or not. */
  sendVerification(): Promise<string>;
  /** Re-read the account from Firebase, to pick up a verification completed in another tab. */
  refreshVerification(): Promise<boolean>;
  signIn(email: string, password: string): Promise<void>;
  signUp(email: string, password: string, displayName: string, orgName: string): Promise<void>;
  /**
   * Create an account without creating a workspace for it, for someone joining an existing one.
   * The caller writes the membership afterwards; until it exists the account belongs nowhere,
   * which is deliberate — an invitation or a registration is what places it.
   */
  signUpWithoutWorkspace(email: string, password: string, displayName: string): Promise<SessionUser>;
  signInWithGoogle(): Promise<void>;
  signInAsDemo(): Promise<void>;
  signOutUser(): Promise<void>;
  switchOrg(orgId: string): Promise<void>;
  refreshOrg(): Promise<void>;
};

/**
 * Firebase auth failures arrive as codes. Two of them are project configuration rather than
 * anything the person at the keyboard did, and both are worth saying plainly — otherwise the first
 * deployment looks like broken software.
 */
const AUTH_MESSAGES: Record<string, string> = {
  'auth/configuration-not-found':
    'Authentication is not switched on for this Firebase project yet. Enable Email/Password under Authentication in the Firebase console, then try again.',
  'auth/operation-not-allowed':
    'That sign-in method is not enabled for this Firebase project. Turn it on under Authentication → Sign-in method.',
  'auth/unauthorized-domain':
    'This address is not in the project’s authorised domains. Add it under Authentication → Settings → Authorized domains.',
  'auth/invalid-credential': 'Email or password not recognised.',
  'auth/invalid-login-credentials': 'Email or password not recognised.',
  'auth/wrong-password': 'Email or password not recognised.',
  'auth/user-not-found': 'No account exists for that email address.',
  'auth/invalid-email': 'That does not look like an email address.',
  'auth/email-already-in-use': 'An account already exists for that email address. Sign in instead.',
  'auth/weak-password': 'Choose a password of at least six characters.',
  'auth/too-many-requests': 'Too many attempts from this device. Wait a few minutes and try again.',
  'auth/network-request-failed': 'Firebase could not be reached. Check the connection and try again.',
  'auth/popup-blocked': 'The sign-in window was blocked by the browser. Allow pop-ups for this site.',
  'auth/popup-closed-by-user': 'The sign-in window closed before it finished.',
  'auth/requires-recent-login': 'For this change, sign out and sign in again first.',
};

export function describeAuthError(error: unknown): string {
  const code = (error as { code?: string })?.code;
  if (code && AUTH_MESSAGES[code]) return AUTH_MESSAGES[code];
  const message = error instanceof Error ? error.message.replace(/^Firebase:\s*/, '') : '';
  return message || 'Sign-in failed.';
}

const SessionContext = createContext<Session | null>(null);
export const useSession = () => {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside SessionProvider');
  return ctx;
};

const LAST_ORG = 'bess-studio-last-org', LOCAL_USER = 'bess-studio-local-user';
const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'org';

export function SessionProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [org, setOrg] = useState<Organization | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [error, setError] = useState('');

  const loadOrgs = useCallback(async (account: SessionUser, demo = false) => {
    const repo = repository();
    let orgs = await repo.listOrganizations(account.uid);
    if (!orgs.length) {
      const created = demo
        ? await createOrganization(account, defaultBranding.displayName, true)
        : await createOrganization(account, `${account.displayName || 'My'} workspace`);
      orgs = [created];
    }
    setOrganizations(orgs);
    const preferred = orgs.find(o => o.id === globalThis.localStorage?.getItem(LAST_ORG)) ?? orgs[0];
    setOrg(preferred);
    const members = await repo.listMembers(preferred.id);
    setRole(members.find(m => m.uid === account.uid)?.role ?? (preferred.createdBy === account.uid ? 'owner' : 'viewer'));
  }, []);

  useEffect(() => {
    const fb = demoModeActive() ? null : firebase();
    if (!fb) {
      const raw = globalThis.localStorage?.getItem(LOCAL_USER);
      if (raw) { const account = JSON.parse(raw) as SessionUser; setUser(account); loadOrgs(account, true).finally(() => setReady(true)); }
      else setReady(true);
      return;
    }
    return onAuthStateChanged(fb.auth, async account => {
      // Opening the demonstration workspace signs in locally while this listener is still live.
      // Firebase then reports "no user", which would sign that session straight back out.
      if (demoModeActive()) return;
      if (!account) { setUser(null); setOrg(null); setOrganizations([]); setRole(null); setReady(true); return; }
      const next: SessionUser = { uid: account.uid, email: account.email ?? '', displayName: account.displayName ?? account.email?.split('@')[0] ?? 'User', photoURL: account.photoURL, emailVerified: account.emailVerified };
      setUser(next);
      try { await loadOrgs(next); setError(''); } catch (e) { setError(e instanceof Error ? e.message : 'Workspace could not be loaded.'); }
      setReady(true);
    });
  }, [loadOrgs]);

  /** `demo` keeps the reference branding intact so the demonstration workspace looks like a real tenant. */
  const createOrganization = async (account: SessionUser, name: string, demo = false): Promise<Organization> => {
    const repo = repository();
    const organization: Organization = {
      id: demo ? 'demo-workspace' : `${slug(name)}-${Math.random().toString(36).slice(2, 6)}`, name,
      branding: demo ? { ...defaultBranding } : { ...defaultBranding, displayName: name, legalName: name },
      currency: defaultPriceBook.currency, plan: 'trial', createdAt: nowIso(), createdBy: account.uid,
    };
    await repo.saveOrganization(organization);
    const member: Member = { uid: account.uid, email: account.email, displayName: account.displayName, role: 'owner', addedAt: nowIso() };
    await repo.saveMember(organization.id, member);
    await repo.saveSettings(organization.id, { priceBook: defaultPriceBook });
    await seedOrganization(organization.id, member);
    // The profile document only exists in Firestore, and only a signed-in caller may write it. In
    // the demonstration workspace there is no such caller, and a rejected write here would abandon
    // the organization that was just created.
    if (repository().kind === 'firestore') {
      const fb = firebase();
      try {
        if (fb) await setDoc(doc(fb.db, 'users', account.uid), { email: account.email, displayName: account.displayName, orgIds: arrayUnion(organization.id), updatedAt: nowIso() }, { merge: true });
      } catch { /* the workspace is usable without the profile index; membership is what grants access */ }
    }
    return organization;
  };

  const value = useMemo<Session>(() => ({
    ready, user, org, role, organizations, error, mode: repository().kind,
    // The demonstration workspace has no mailbox to verify and its prices are plainly not real,
    // so it is treated as verified rather than being locked out of its own figures.
    emailVerified: repository().kind === 'local' ? true : !!user?.emailVerified,
    async sendVerification() {
      const fb = firebase();
      if (!fb?.auth.currentUser) return 'Sign in first.';
      if (fb.auth.currentUser.emailVerified) return 'That address is already verified.';
      try {
        await sendEmailVerification(fb.auth.currentUser);
        return `Verification sent to ${fb.auth.currentUser.email}. Open the link, then choose “I have verified”.`;
      } catch (e) { return describeAuthError(e); }
    },
    async refreshVerification() {
      const fb = firebase();
      if (!fb?.auth.currentUser) return false;
      await fb.auth.currentUser.reload();
      const verified = fb.auth.currentUser.emailVerified;
      setUser(u => (u ? { ...u, emailVerified: verified } : u));
      return verified;
    },
    async signIn(email, password) {
      setDemoMode(false);
      const fb = firebase();
      if (!fb) return this.signInAsDemo();
      await signInWithEmailAndPassword(fb.auth, email, password);
    },
    async signUp(email, password, displayName, orgName) {
      setDemoMode(false);
      const fb = firebase();
      if (!fb) return this.signInAsDemo();
      const credential = await createUserWithEmailAndPassword(fb.auth, email, password);
      if (displayName) await updateProfile(credential.user, { displayName });
      const account: SessionUser = { uid: credential.user.uid, email, displayName: displayName || email.split('@')[0], photoURL: null, emailVerified: false };
      const created = await createOrganization(account, orgName || `${account.displayName} workspace`);
      globalThis.localStorage?.setItem(LAST_ORG, created.id);
      // A new account cannot see a price until the address is proved, so the mail goes out with
      // the sign-up rather than waiting for them to find the banner.
      try { await sendEmailVerification(credential.user); } catch { /* the banner offers it again */ }
    },
    async signUpWithoutWorkspace(email, password, displayName) {
      setDemoMode(false);
      const fb = firebase();
      if (!fb) throw new Error('Joining a workspace needs a configured Firebase project.');
      const credential = await createUserWithEmailAndPassword(fb.auth, email, password);
      if (displayName) await updateProfile(credential.user, { displayName });
      try { await sendEmailVerification(credential.user); } catch { /* the banner offers it again */ }
      return { uid: credential.user.uid, email, displayName: displayName || email.split('@')[0], photoURL: null, emailVerified: false };
    },
    async signInWithGoogle() {
      setDemoMode(false);
      const fb = firebase();
      if (!fb) return this.signInAsDemo();
      await signInWithPopup(fb.auth, new GoogleAuthProvider());
    },
    async signInAsDemo() {
      setDemoMode(true);
      const fb = firebase();
      if (fb && fb.auth.currentUser) await signOut(fb.auth);
      const account: SessionUser = { uid: 'demo-user', email: 'demo@joulewise.com', displayName: 'Demo Engineer', photoURL: null, emailVerified: true };
      globalThis.localStorage?.setItem(LOCAL_USER, JSON.stringify(account));
      setUser(account);
      try { await loadOrgs(account, true); } finally { setReady(true); }
    },
    async signOutUser() {
      const fb = firebase();
      globalThis.localStorage?.removeItem(LOCAL_USER);
      setDemoMode(false);
      if (fb) await signOut(fb.auth);
      setUser(null); setOrg(null); setOrganizations([]); setRole(null);
    },
    async switchOrg(orgId) {
      const next = organizations.find(o => o.id === orgId);
      if (!next || !user) return;
      globalThis.localStorage?.setItem(LAST_ORG, orgId);
      setOrg(next);
      const members = await repository().listMembers(orgId);
      setRole(members.find(m => m.uid === user.uid)?.role ?? 'viewer');
    },
    async refreshOrg() {
      if (!org) return;
      const fresh = await repository().getOrganization(org.id);
      if (fresh) { setOrg(fresh); setOrganizations(list => list.map(o => (o.id === fresh.id ? fresh : o))); }
    },
  }), [ready, user, org, role, organizations, error, loadOrgs]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
