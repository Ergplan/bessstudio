'use client';
import {
  collection, doc, deleteDoc, getDoc, getDocs, limit, onSnapshot, orderBy,
  query, setDoc, type Firestore,
} from 'firebase/firestore';
import { firebase, firebaseEnabled } from './firebase';
import { nowIso, type Activity, type Customer, type Member, type Organization, type OrgSettings, type Project, type Quote } from './types';

/**
 * Data access for the platform. Both adapters expose the same surface so the UI never branches:
 * Firestore in production, a localStorage store for offline demonstrations and tests.
 *
 * Firestore layout — everything is scoped under one organization document, which keeps the
 * security rules to a single membership check per path:
 *   organizations/{orgId}
 *   organizations/{orgId}/members/{uid}
 *   organizations/{orgId}/customers/{customerId}
 *   organizations/{orgId}/projects/{projectId}
 *   organizations/{orgId}/quotes/{quoteId}
 *   organizations/{orgId}/activities/{activityId}
 *   organizations/{orgId}/settings/priceBook
 *   users/{uid}
 */
export type Collections = { customers: Customer; projects: Project; quotes: Quote; activities: Activity };
export type CollectionName = keyof Collections;

export interface Repository {
  readonly kind: 'firestore' | 'local';
  listOrganizations(uid: string): Promise<Organization[]>;
  getOrganization(orgId: string): Promise<Organization | null>;
  saveOrganization(org: Organization): Promise<void>;
  listMembers(orgId: string): Promise<Member[]>;
  saveMember(orgId: string, member: Member): Promise<void>;
  removeMember(orgId: string, uid: string): Promise<void>;
  list<K extends CollectionName>(orgId: string, name: K): Promise<Collections[K][]>;
  get<K extends CollectionName>(orgId: string, name: K, id: string): Promise<Collections[K] | null>;
  save<K extends CollectionName>(orgId: string, name: K, value: Collections[K]): Promise<void>;
  remove(orgId: string, name: CollectionName, id: string): Promise<void>;
  watch<K extends CollectionName>(orgId: string, name: K, onChange: (rows: Collections[K][]) => void): () => void;
  getSettings(orgId: string): Promise<OrgSettings | null>;
  saveSettings(orgId: string, settings: OrgSettings): Promise<void>;
}

const sortKey = (name: CollectionName) => (name === 'activities' ? 'at' : 'updatedAt');
const stripUndefined = <T>(value: T): T => JSON.parse(JSON.stringify(value ?? null));

class FirestoreRepository implements Repository {
  readonly kind = 'firestore' as const;
  constructor(private db: Firestore) {}
  private path(orgId: string, name: string) { return collection(this.db, 'organizations', orgId, name); }

  async listOrganizations(uid: string) {
    const user = await getDoc(doc(this.db, 'users', uid));
    const orgIds: string[] = (user.data()?.orgIds as string[]) ?? [];
    const orgs = await Promise.all(orgIds.map(id => getDoc(doc(this.db, 'organizations', id))));
    return orgs.filter(s => s.exists()).map(s => ({ id: s.id, ...s.data() }) as Organization);
  }
  async getOrganization(orgId: string) {
    const snap = await getDoc(doc(this.db, 'organizations', orgId));
    return snap.exists() ? ({ id: snap.id, ...snap.data() } as Organization) : null;
  }
  async saveOrganization(org: Organization) { await setDoc(doc(this.db, 'organizations', org.id), stripUndefined(org), { merge: true }); }
  async listMembers(orgId: string) { const snap = await getDocs(this.path(orgId, 'members')); return snap.docs.map(d => ({ uid: d.id, ...d.data() }) as Member); }
  async saveMember(orgId: string, member: Member) { await setDoc(doc(this.db, 'organizations', orgId, 'members', member.uid), stripUndefined(member), { merge: true }); }
  async removeMember(orgId: string, uid: string) { await deleteDoc(doc(this.db, 'organizations', orgId, 'members', uid)); }

  async list<K extends CollectionName>(orgId: string, name: K) {
    const snap = await getDocs(query(this.path(orgId, name), orderBy(sortKey(name), 'desc'), limit(500)));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }) as Collections[K]);
  }
  async get<K extends CollectionName>(orgId: string, name: K, id: string) {
    const snap = await getDoc(doc(this.db, 'organizations', orgId, name, id));
    return snap.exists() ? ({ id: snap.id, ...snap.data() } as Collections[K]) : null;
  }
  async save<K extends CollectionName>(orgId: string, name: K, value: Collections[K]) {
    await setDoc(doc(this.db, 'organizations', orgId, name, value.id), stripUndefined(value), { merge: true });
  }
  async remove(orgId: string, name: CollectionName, id: string) { await deleteDoc(doc(this.db, 'organizations', orgId, name, id)); }
  watch<K extends CollectionName>(orgId: string, name: K, onChange: (rows: Collections[K][]) => void) {
    return onSnapshot(query(this.path(orgId, name), orderBy(sortKey(name), 'desc'), limit(500)),
      snap => onChange(snap.docs.map(d => ({ id: d.id, ...d.data() }) as Collections[K])), () => onChange([]));
  }
  async getSettings(orgId: string) {
    const snap = await getDoc(doc(this.db, 'organizations', orgId, 'settings', 'priceBook'));
    return snap.exists() ? (snap.data() as OrgSettings) : null;
  }
  async saveSettings(orgId: string, settings: OrgSettings) { await setDoc(doc(this.db, 'organizations', orgId, 'settings', 'priceBook'), stripUndefined(settings)); }
}

const KEY = 'bess-studio-local-v1';
type LocalShape = { organizations: Record<string, Organization>; members: Record<string, Record<string, Member>>; settings: Record<string, OrgSettings>; data: Record<string, Record<string, Record<string, unknown>>> };
const emptyLocal = (): LocalShape => ({ organizations: {}, members: {}, settings: {}, data: {} });

export class LocalRepository implements Repository {
  readonly kind = 'local' as const;
  private listeners = new Map<string, Set<(rows: never[]) => void>>();
  // Local storage is unavailable in private browsing, under a full quota, and in tests, so the
  // repository keeps an in-memory copy and treats the browser store as a best-effort cache.
  private memory: LocalShape = emptyLocal();
  private read(): LocalShape {
    try {
      const raw = globalThis.localStorage?.getItem(KEY);
      if (raw) this.memory = { ...emptyLocal(), ...JSON.parse(raw) };
    } catch { /* fall back to the in-memory copy */ }
    return this.memory;
  }
  private write(shape: LocalShape) {
    this.memory = shape;
    try { globalThis.localStorage?.setItem(KEY, JSON.stringify(shape)); } catch { /* quota or private mode: this session keeps the in-memory copy */ }
  }
  private notify(orgId: string, name: CollectionName) {
    const rows = this.rows(this.read(), orgId, name);
    this.listeners.get(`${orgId}/${name}`)?.forEach(fn => (fn as (r: unknown[]) => void)(rows));
  }
  private rows(shape: LocalShape, orgId: string, name: CollectionName) {
    const bucket = shape.data[orgId]?.[name] ?? {};
    const key = sortKey(name);
    return Object.values(bucket).sort((a, b) => String((b as Record<string, unknown>)[key] ?? '').localeCompare(String((a as Record<string, unknown>)[key] ?? '')));
  }

  async listOrganizations(_uid: string) { void _uid; return Object.values(this.read().organizations); }
  async getOrganization(orgId: string) { return this.read().organizations[orgId] ?? null; }
  async saveOrganization(org: Organization) { const s = this.read(); s.organizations[org.id] = org; this.write(s); }
  async listMembers(orgId: string) { return Object.values(this.read().members[orgId] ?? {}); }
  async saveMember(orgId: string, member: Member) { const s = this.read(); (s.members[orgId] ??= {})[member.uid] = member; this.write(s); }
  async removeMember(orgId: string, uid: string) { const s = this.read(); delete s.members[orgId]?.[uid]; this.write(s); }

  async list<K extends CollectionName>(orgId: string, name: K) { return this.rows(this.read(), orgId, name) as Collections[K][]; }
  async get<K extends CollectionName>(orgId: string, name: K, id: string) { return (this.read().data[orgId]?.[name]?.[id] as Collections[K]) ?? null; }
  async save<K extends CollectionName>(orgId: string, name: K, value: Collections[K]) {
    const s = this.read(); ((s.data[orgId] ??= {})[name] ??= {})[value.id] = stripUndefined(value); this.write(s); this.notify(orgId, name);
  }
  async remove(orgId: string, name: CollectionName, id: string) { const s = this.read(); delete s.data[orgId]?.[name]?.[id]; this.write(s); this.notify(orgId, name); }
  watch<K extends CollectionName>(orgId: string, name: K, onChange: (rows: Collections[K][]) => void) {
    const key = `${orgId}/${name}`, set = this.listeners.get(key) ?? new Set();
    set.add(onChange as (rows: never[]) => void); this.listeners.set(key, set);
    onChange(this.rows(this.read(), orgId, name) as Collections[K][]);
    return () => { set.delete(onChange as (rows: never[]) => void); };
  }
  async getSettings(orgId: string) { return this.read().settings[orgId] ?? null; }
  async saveSettings(orgId: string, settings: OrgSettings) { const s = this.read(); s.settings[orgId] = settings; this.write(s); }
}

/**
 * The demonstration workspace always runs against browser storage, even on a deployment that has
 * Firestore configured. Without this, opening the demo on the live site would send every write to
 * Firestore as an unauthenticated caller, where the rules correctly refuse it, and the workspace
 * would simply appear broken.
 */
const DEMO_FLAG = 'bess-studio-demo-mode';
const storedDemoFlag = () => {
  try { return globalThis.localStorage?.getItem(DEMO_FLAG) === 'true'; } catch { return false; }
};

let instance: Repository | null = null, instanceKind: 'firestore' | 'local' | null = null;
// Held in memory as well as in storage, so the switch still works where storage is unavailable.
let forcedLocal = storedDemoFlag();

export const demoModeActive = () => forcedLocal;
export function setDemoMode(on: boolean) {
  try { if (on) globalThis.localStorage?.setItem(DEMO_FLAG, 'true'); else globalThis.localStorage?.removeItem(DEMO_FLAG); }
  catch { /* private mode or full quota: the in-memory flag still switches the repository */ }
  forcedLocal = on;
  instance = null;
}

export function repository(): Repository {
  const wanted: 'firestore' | 'local' = !forcedLocal && firebaseEnabled ? 'firestore' : 'local';
  if (!instance || instanceKind !== wanted) {
    const fb = wanted === 'firestore' ? firebase() : null;
    instance = fb ? new FirestoreRepository(fb.db) : new LocalRepository();
    instanceKind = wanted;
  }
  return instance;
}
/** Whether reads and writes are actually going to Firestore right now, not merely configured to. */
export const usingFirestore = () => repository().kind === 'firestore';

/** Append an audit trail entry. Failures never block the write the user asked for. */
export async function logActivity(orgId: string, entry: Omit<Activity, 'id' | 'orgId' | 'at'>) {
  const activity: Activity = { ...entry, id: `act_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, orgId, at: nowIso() };
  try { await repository().save(orgId, 'activities', activity); } catch { /* audit trail is best effort */ }
}
