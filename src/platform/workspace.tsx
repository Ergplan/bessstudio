'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { repository, logActivity } from './repo';
import { useSession } from './auth';
import { defaultPriceBook, type PriceBook } from '../catalog/pricing';
import { nowIso, type Activity, type Customer, type Project, type Quote, type ActivityKind } from './types';

export type Workspace = {
  loading: boolean; customers: Customer[]; projects: Project[]; quotes: Quote[]; activities: Activity[];
  priceBook: PriceBook; toast: string; setToast(message: string): void;
  saveCustomer(value: Customer, note?: string): Promise<void>;
  saveProject(value: Project, note?: string): Promise<void>;
  saveQuote(value: Quote, note?: string, kind?: ActivityKind): Promise<void>;
  removeRecord(name: 'customers' | 'projects' | 'quotes', id: string): Promise<void>;
  savePriceBook(value: PriceBook): Promise<void>;
};

const WorkspaceContext = createContext<Workspace | null>(null);
export const useWorkspace = () => {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error('useWorkspace must be used inside WorkspaceProvider');
  return ctx;
};

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { org, user } = useSession();
  const [loading, setLoading] = useState(true);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [priceBook, setPriceBook] = useState<PriceBook>(defaultPriceBook);
  const [toast, setToast] = useState('');

  useEffect(() => {
    if (!org) { setLoading(false); return; }
    setLoading(true);
    const repo = repository();
    const stops = [
      repo.watch(org.id, 'customers', setCustomers),
      repo.watch(org.id, 'projects', setProjects),
      repo.watch(org.id, 'quotes', setQuotes),
      repo.watch(org.id, 'activities', setActivities),
    ];
    repo.getSettings(org.id).then(s => setPriceBook(s?.priceBook ?? defaultPriceBook)).finally(() => setLoading(false));
    return () => stops.forEach(stop => stop());
  }, [org]);

  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(''), 4200); return () => clearTimeout(t); }, [toast]);

  const record = useCallback(async (refType: Activity['refType'], refId: string, refName: string, kind: ActivityKind, message: string) => {
    if (!org || !user) return;
    await logActivity(org.id, { refType, refId, refName, kind, message, actorUid: user.uid, actorName: user.displayName });
  }, [org, user]);

  const value = useMemo<Workspace>(() => ({
    loading, customers, projects, quotes, activities, priceBook, toast, setToast,
    async saveCustomer(customerValue, note) {
      if (!org) return;
      const next = { ...customerValue, orgId: org.id, updatedAt: nowIso() };
      await repository().save(org.id, 'customers', next);
      setCustomers(list => [next, ...list.filter(c => c.id !== next.id)]);
      if (note) await record('customer', next.id, next.name, 'updated', note);
      setToast(`${next.name} saved.`);
    },
    async saveProject(projectValue, note) {
      if (!org || !user) return;
      const next = { ...projectValue, orgId: org.id, updatedAt: nowIso(), updatedBy: user.displayName };
      await repository().save(org.id, 'projects', next);
      setProjects(list => [next, ...list.filter(p => p.id !== next.id)]);
      if (note) await record('project', next.id, next.name, 'updated', note);
      setToast(`${next.name} saved.`);
    },
    async saveQuote(quoteValue, note, kind = 'updated') {
      if (!org) return;
      const next = { ...quoteValue, orgId: org.id, updatedAt: nowIso() };
      await repository().save(org.id, 'quotes', next);
      setQuotes(list => [next, ...list.filter(q => q.id !== next.id)]);
      if (note) await record('quote', next.id, `${next.number} r${next.version}`, kind, note);
      setToast(`Quote ${next.number} saved.`);
    },
    async removeRecord(name, id) {
      if (!org) return;
      await repository().remove(org.id, name, id);
      if (name === 'customers') setCustomers(l => l.filter(x => x.id !== id));
      if (name === 'projects') setProjects(l => l.filter(x => x.id !== id));
      if (name === 'quotes') setQuotes(l => l.filter(x => x.id !== id));
      setToast('Record deleted.');
    },
    async savePriceBook(value) {
      if (!org) return;
      await repository().saveSettings(org.id, { priceBook: value });
      setPriceBook(value);
      setToast('Price book updated.');
    },
  }), [loading, customers, projects, quotes, activities, priceBook, toast, org, user, record]);

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export const projectsOf = (projects: Project[], customerId: string) => projects.filter(p => p.customerId === customerId);
export const quotesOf = (quotes: Quote[], key: 'projectId' | 'customerId', id: string) => quotes.filter(q => q[key] === id);
