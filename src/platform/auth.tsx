import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  GoogleAuthProvider, createUserWithEmailAndPassword, onAuthStateChanged, signInWithEmailAndPassword,
  signInWithPopup, signOut, updateProfile,
} from 'firebase/auth';
import { doc, setDoc, arrayUnion } from 'firebase/firestore';
import { firebase, firebaseEnabled } from './firebase';
import { repository } from './repo';
import { defaultBranding } from '../brand/brand';
import { defaultPriceBook } from '../catalog/pricing';
import { nowIso, type Member, type Organization, type Role } from './types';
import { seedOrganization } from './seed';

export type SessionUser = { uid: string; email: string; displayName: string; photoURL: string | null };
export type Session = {
  ready: boolean; user: SessionUser | null; org: Organization | null; role: Role | null;
  organizations: Organization[]; mode: 'firestore' | 'local'; error: string;
  signIn(email: string, password: string): Promise<void>;
  signUp(email: string, password: string, displayName: string, orgName: string): Promise<void>;
  signInWithGoogle(): Promise<void>;
  signInAsDemo(): Promise<void>;
  signOutUser(): Promise<void>;
  switchOrg(orgId: string): Promise<void>;
  refreshOrg(): Promise<void>;
};

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

  const loadOrgs = useCallback(async (account: SessionUser) => {
    const repo = repository();
    let orgs = await repo.listOrganizations(account.uid);
    if (!orgs.length) {
      const created = await createOrganization(account, `${account.displayName || 'My'} workspace`);
      orgs = [created];
    }
    setOrganizations(orgs);
    const preferred = orgs.find(o => o.id === globalThis.localStorage?.getItem(LAST_ORG)) ?? orgs[0];
    setOrg(preferred);
    const members = await repo.listMembers(preferred.id);
    setRole(members.find(m => m.uid === account.uid)?.role ?? (preferred.createdBy === account.uid ? 'owner' : 'viewer'));
  }, []);

  useEffect(() => {
    const fb = firebase();
    if (!fb) {
      const raw = globalThis.localStorage?.getItem(LOCAL_USER);
      if (raw) { const account = JSON.parse(raw) as SessionUser; setUser(account); loadOrgs(account).finally(() => setReady(true)); }
      else setReady(true);
      return;
    }
    return onAuthStateChanged(fb.auth, async account => {
      if (!account) { setUser(null); setOrg(null); setOrganizations([]); setRole(null); setReady(true); return; }
      const next: SessionUser = { uid: account.uid, email: account.email ?? '', displayName: account.displayName ?? account.email?.split('@')[0] ?? 'User', photoURL: account.photoURL };
      setUser(next);
      try { await loadOrgs(next); setError(''); } catch (e) { setError(e instanceof Error ? e.message : 'Workspace could not be loaded.'); }
      setReady(true);
    });
  }, [loadOrgs]);

  const createOrganization = async (account: SessionUser, name: string): Promise<Organization> => {
    const repo = repository();
    const organization: Organization = {
      id: `${slug(name)}-${Math.random().toString(36).slice(2, 6)}`, name,
      branding: { ...defaultBranding, displayName: name, legalName: name },
      currency: defaultPriceBook.currency, plan: 'trial', createdAt: nowIso(), createdBy: account.uid,
    };
    await repo.saveOrganization(organization);
    const member: Member = { uid: account.uid, email: account.email, displayName: account.displayName, role: 'owner', addedAt: nowIso() };
    await repo.saveMember(organization.id, member);
    await repo.saveSettings(organization.id, { priceBook: defaultPriceBook });
    await seedOrganization(organization.id, member);
    const fb = firebase();
    if (fb) await setDoc(doc(fb.db, 'users', account.uid), { email: account.email, displayName: account.displayName, orgIds: arrayUnion(organization.id), updatedAt: nowIso() }, { merge: true });
    return organization;
  };

  const value = useMemo<Session>(() => ({
    ready, user, org, role, organizations, error, mode: firebaseEnabled ? 'firestore' : 'local',
    async signIn(email, password) {
      const fb = firebase();
      if (!fb) return this.signInAsDemo();
      await signInWithEmailAndPassword(fb.auth, email, password);
    },
    async signUp(email, password, displayName, orgName) {
      const fb = firebase();
      if (!fb) return this.signInAsDemo();
      const credential = await createUserWithEmailAndPassword(fb.auth, email, password);
      if (displayName) await updateProfile(credential.user, { displayName });
      const account: SessionUser = { uid: credential.user.uid, email, displayName: displayName || email.split('@')[0], photoURL: null };
      const created = await createOrganization(account, orgName || `${account.displayName} workspace`);
      globalThis.localStorage?.setItem(LAST_ORG, created.id);
    },
    async signInWithGoogle() {
      const fb = firebase();
      if (!fb) return this.signInAsDemo();
      await signInWithPopup(fb.auth, new GoogleAuthProvider());
    },
    async signInAsDemo() {
      const account: SessionUser = { uid: 'demo-user', email: 'demo@joulewise.com', displayName: 'Demo Engineer', photoURL: null };
      globalThis.localStorage?.setItem(LOCAL_USER, JSON.stringify(account));
      setUser(account);
      await loadOrgs(account);
      setReady(true);
    },
    async signOutUser() {
      const fb = firebase();
      globalThis.localStorage?.removeItem(LOCAL_USER);
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
