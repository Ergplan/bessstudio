'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Users, FolderKanban, FileText, Box, Settings, LogOut, Boxes, Cloud, HardDrive, Sparkles, Inbox } from 'lucide-react';
import { brand } from '../brand/brand';
import { useSession } from '../platform/auth';
import { useWorkspace } from '../platform/workspace';
import { isCustomerRole, roleLabels } from '../platform/types';
import { VerifyBanner } from './components/Gate';
import { Notifications } from './components/Notifications';

type Link_ = { to: string; label: string; icon: typeof LayoutDashboard; end?: boolean };
/**
 * Two navigations, one application. Staff see the pipeline; a customer sees their own designs and
 * their own quotations and nothing else — there is no customer list to show them, because every
 * record they can reach is theirs.
 */
const staffLinks: Link_[] = [
  { to: '/app', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/app/queue', label: 'Queue', icon: Inbox },
  { to: '/app/customers', label: 'Customers', icon: Users },
  { to: '/app/projects', label: 'Projects', icon: FolderKanban },
  { to: '/app/quotes', label: 'Quotes', icon: FileText },
];
const staffTools: Link_[] = [
  { to: '/app/studio', label: '3D Studio', icon: Box },
  { to: '/app/catalog', label: 'Catalogue', icon: Boxes },
  { to: '/app/settings', label: 'Settings', icon: Settings },
];
const customerLinks: Link_[] = [
  { to: '/app', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/app/projects', label: 'My designs', icon: FolderKanban },
  { to: '/app/quotes', label: 'My quotations', icon: FileText },
];
const customerTools: Link_[] = [
  { to: '/app/studio', label: '3D Studio', icon: Box },
  { to: '/app/settings', label: 'Account', icon: Settings },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { org, user, role, organizations, switchOrg, signOutUser, mode } = useSession();
  const { toast } = useWorkspace();
  const pathname = usePathname();
  const branding = org?.branding;
  const customer = isCustomerRole(role);
  const links = customer ? customerLinks : staffLinks;
  const tools = customer ? customerTools : staffTools;
  const title = [...links, ...tools].find(l => (l.end ? pathname === l.to : pathname.startsWith(l.to)))?.label ?? (customer ? 'My workspace' : 'Workspace');
  const active = (l: Link_) => (l.end ? pathname === l.to : pathname.startsWith(l.to));
  const initials = (user?.displayName ?? 'U').split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase();
  // The studio fills its own frame; the workbench gutter and the footer credit would box it in.
  const bleed = pathname.startsWith('/app/studio');

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          {branding?.logo ? <img src={branding.logo} alt="" /> : <div className="avatar" style={{ background: branding?.accent, color: '#1B2D12' }}>{(org?.name ?? 'W')[0]}</div>}
          <div><b>{branding?.displayName ?? org?.name}</b><small>{brand.platform}</small></div>
        </div>
        {organizations.length > 1 && (
          <div className="org-switch">
            <label><span className="visually-hidden" />
              <select aria-label="Switch organization" value={org?.id ?? ''} onChange={e => void switchOrg(e.target.value)}>
                {organizations.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </label>
          </div>
        )}
        <nav className="nav">
          <h5>{customer ? 'My work' : 'Pipeline'}</h5>
          {links.map(l => <Link key={l.to} href={l.to} className={active(l) ? 'active' : ''}><l.icon size={16} />{l.label}</Link>)}
          <h5>{customer ? 'Tools' : 'Engineering'}</h5>
          {tools.map(l => <Link key={l.to} href={l.to} className={active(l) ? 'active' : ''}><l.icon size={16} />{l.label}</Link>)}
        </nav>
        <div className="sidebar-foot">
          <img src={brand.wordmarkLight} alt={brand.vendor} />
          Developed and managed by<br /><a href={brand.vendorUrl} target="_blank" rel="noreferrer">{brand.vendorDomain}</a>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <div style={{ flex: 1, minWidth: 0 }}>
            <span className="crumb">{org?.name}{role ? ` · ${roleLabels[role]}` : ''}</span>
            <h1>{title}</h1>
          </div>
          <Link className="btn sm" href="/?build=1" title="Answer the opening question again and size a new plant">
            <Sparkles size={14} /> New design
          </Link>
          <Notifications />
          <span className="badge neutral" title={mode === 'firestore' ? 'Connected to Firestore' : 'Offline demo workspace stored in this browser'}>
            {mode === 'firestore' ? <Cloud size={12} /> : <HardDrive size={12} />}{mode === 'firestore' ? 'Cloud' : 'Demo'}
          </span>
          <div className="avatar" title={`${user?.displayName} · ${user?.email}`}>{initials}</div>
          <button className="btn ghost sm" onClick={() => void signOutUser()} aria-label="Sign out" title="Sign out"><LogOut size={15} /></button>
        </header>
        <div className={bleed ? 'page bleed' : 'page'}>
          {!bleed && <VerifyBanner />}
          {children}
        </div>
        {!bleed && (
          <div className="platform-credit no-print">
            <img src={brand.mark} alt="" />
            {brand.creditLong} · {brand.copyright()}
          </div>
        )}
      </div>
      {toast && <div className="tip" style={{ left: 'auto', right: 24, bottom: 24, top: 'auto', position: 'fixed' }} role="status">{toast}</div>}
    </div>
  );
}
