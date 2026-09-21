'use client';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Card, Badge, Empty, date } from '../components/ui';
import { useWorkspace } from '../../platform/workspace';
import { sizeSystem } from '../../sizing/engine';
import { applications } from '../../sizing/applications';

export function Projects() {
  const { projects } = useWorkspace();
  const [filter, setFilter] = useState(''), [app, setApp] = useState('all');

  const rows = useMemo(() => projects
    .filter(p => (app === 'all' || p.sizing.applicationId === app) && (!filter || `${p.name} ${p.customerName} ${p.reference}`.toLowerCase().includes(filter.toLowerCase())))
    .map(p => { try { return { p, s: sizeSystem(p.sizing) }; } catch { return { p, s: null }; } }), [projects, filter, app]);

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="row">
        <input placeholder="Search projects…" value={filter} onChange={e => setFilter(e.target.value)} aria-label="Search projects"
          style={{ padding: '8px 12px', border: '1px solid var(--line)', borderRadius: 8, minWidth: 260, fontSize: 13 }} />
        <select value={app} onChange={e => setApp(e.target.value)} aria-label="Filter by application"
          style={{ padding: '8px 12px', border: '1px solid var(--line)', borderRadius: 8, fontSize: 13 }}>
          <option value="all">All applications</option>
          {applications.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <div className="spacer" />
        <span className="muted">Projects are created from a customer record.</span>
      </div>

      <Card tight>
        {rows.length ? (
          <table className="data">
            <thead><tr><th>Project</th><th>Customer</th><th>Application</th><th className="num">Power</th><th className="num">Usable</th><th className="num">Units</th><th>Checks</th><th>Status</th><th>Updated</th></tr></thead>
            <tbody>{rows.map(({ p, s }) => {
              const errors = s?.warnings.filter(w => w.level === 'error').length ?? 0;
              const warns = s?.warnings.filter(w => w.level === 'warning').length ?? 0;
              return (
                <tr key={p.id}>
                  <td><Link href={`/app/projects?id=${p.id}`}><b>{p.name}</b></Link><div className="mono" style={{ color: 'var(--slate-light)' }}>{p.reference}</div></td>
                  <td><Link href={`/app/customers?id=${p.customerId}`}>{p.customerName}</Link></td>
                  <td style={{ textTransform: 'capitalize' }}>{p.sizing.applicationId.replace(/-/g, ' ')}</td>
                  <td className="num">{s ? `${s.ratedPowerMW.toFixed(2)} MW` : '—'}</td>
                  <td className="num">{s ? `${s.requiredUsableMWh.toFixed(1)} MWh` : '—'}</td>
                  <td className="num">{s?.totalUnits ?? '—'}</td>
                  <td>{errors ? <Badge tone="bad">{errors} error{errors > 1 ? 's' : ''}</Badge> : warns ? <Badge tone="warn">{warns} to review</Badge> : <Badge tone="good">Clear</Badge>}</td>
                  <td><Badge tone={p.status === 'awarded' ? 'good' : p.status === 'quoted' ? 'info' : 'neutral'}>{p.status}</Badge></td>
                  <td className="muted">{date(p.updatedAt)}</td>
                </tr>
              );
            })}</tbody>
          </table>
        ) : <Empty title="No projects" message="Open a customer and add a project to start sizing." action={<Link className="btn accent" href="/app/customers">Go to customers</Link>} />}
      </Card>
    </div>
  );
}
