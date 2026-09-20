import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { LayoutDashboard, Users, FolderKanban, FileText, Box, Settings, LogOut, Boxes, Cloud, HardDrive } from 'lucide-react';
import { brand } from '../brand/brand';
import { useSession } from '../platform/auth';
import { useWorkspace } from '../platform/workspace';

type Link = { to: string; label: string; icon: typeof LayoutDashboard; end?: boolean };
const links: Link[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/customers', label: 'Customers', icon: Users },
  { to: '/projects', label: 'Projects', icon: FolderKanban },
  { to: '/quotes', label: 'Quotes', icon: FileText },
];
const tools: Link[] = [
  { to: '/studio', label: '3D Studio', icon: Box },
  { to: '/catalog', label: 'Catalogue', icon: Boxes },
  { to: '/settings', label: 'Settings', icon: Settings },
];

export function AppShell() {
  const { org, user, role, organizations, switchOrg, signOutUser, mode } = useSession();
  const { toast } = useWorkspace();
  const { pathname } = useLocation();
  const branding = org?.branding;
  const title = [...links, ...tools].find(l => (l.end ? pathname === l.to : pathname.startsWith(l.to)))?.label ?? 'Workspace';
  const initials = (user?.displayName ?? 'U').split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase();

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
          <h5>Pipeline</h5>
          {links.map(l => <NavLink key={l.to} to={l.to} end={l.end} className={({ isActive }) => (isActive ? 'active' : '')}><l.icon size={16} />{l.label}</NavLink>)}
          <h5>Engineering</h5>
          {tools.map(l => <NavLink key={l.to} to={l.to} className={({ isActive }) => (isActive ? 'active' : '')}><l.icon size={16} />{l.label}</NavLink>)}
        </nav>
        <div className="sidebar-foot">
          <img src={brand.wordmarkLight} alt={brand.vendor} />
          Developed and managed by<br /><a href={brand.vendorUrl} target="_blank" rel="noreferrer">{brand.vendorDomain}</a>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <div style={{ flex: 1, minWidth: 0 }}>
            <span className="crumb">{org?.name}{role ? ` · ${role}` : ''}</span>
            <h1>{title}</h1>
          </div>
          <span className="badge neutral" title={mode === 'firestore' ? 'Connected to Firestore' : 'Offline demo workspace stored in this browser'}>
            {mode === 'firestore' ? <Cloud size={12} /> : <HardDrive size={12} />}{mode === 'firestore' ? 'Cloud' : 'Demo'}
          </span>
          <div className="avatar" title={`${user?.displayName} · ${user?.email}`}>{initials}</div>
          <button className="btn ghost sm" onClick={() => void signOutUser()} title="Sign out"><LogOut size={15} /></button>
        </header>
        <div className="page"><Outlet /></div>
        <div className="platform-credit no-print">
          <img src={brand.mark} alt="" />
          {brand.creditLong} · {brand.copyright()}
        </div>
      </div>
      {toast && <div className="tip" style={{ left: 'auto', right: 24, bottom: 24, top: 'auto', position: 'fixed' }} role="status">{toast}</div>}
    </div>
  );
}
