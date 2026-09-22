'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { Card, Badge, Empty, Field, Modal, TextInput, date } from '../components/ui';
import { useWorkspace } from '../../platform/workspace';
import { useSession } from '../../platform/auth';
import { newProject as makeProject } from '../../platform/projects';
import { can } from '../../platform/types';
import { sizeSystem } from '../../sizing/engine';
import { applications } from '../../sizing/applications';

export function Projects() {
  const { customers, projects, saveProject } = useWorkspace();
  const { org, user, role } = useSession();
  const router = useRouter();
  const [filter, setFilter] = useState(''), [app, setApp] = useState('all');

  const [draft, setDraft] = useState<{ customerId: string; name: string } | null>(null);

  const create = async () => {
    const customer = customers.find(c => c.id === draft?.customerId);
    if (!draft || !customer || !org || !user) return;
    const project = makeProject({
      orgId: org.id, customer, name: draft.name,
      existing: projects.filter(p => p.customerId === customer.id).length,
      by: { uid: user.uid, displayName: user.displayName },
    });
    await saveProject(project, `Project ${project.name} created for ${customer.name}.`);
    setDraft(null);
    router.push(`/app/projects?id=${project.id}`);
  };

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
        {can(role, 'project.write') && customers.length > 0 && (
          <button className="btn accent" onClick={() => setDraft({ customerId: customers[0].id, name: '' })}>
            <Plus size={15} /> New project
          </button>
        )}
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
        ) : projects.length ? (
          <Empty title="No projects match" message="Nothing matches this search or application filter."
            action={<button className="btn" onClick={() => { setFilter(''); setApp('all'); }}>Clear the filter</button>} />
        ) : customers.length ? (
          // A project can be raised from right here now, so sending them to the customers page for
          // it is a detour the interface no longer needs.
          <Empty title="No projects yet" message="A project is one plant: its duty cycle, its sizing, its engineering and the quotations raised from it."
            action={can(role, 'project.write')
              ? <button className="btn accent" onClick={() => setDraft({ customerId: customers[0].id, name: '' })}><Plus size={15} /> New project</button>
              : undefined} />
        ) : (
          <Empty title="A customer comes first" message="Every project belongs to a customer, so there needs to be one before a plant can be sized."
            action={<Link className="btn accent" href="/app/customers">Add a customer</Link>} />
        )}
      </Card>
      {draft && (
        <Modal title="New project" onClose={() => setDraft(null)} footer={<>
          <button className="btn" onClick={() => setDraft(null)}>Cancel</button>
          <button className="btn accent" disabled={draft.name.trim().length < 2} onClick={() => void create()}>Create project</button>
        </>}>
          <Field label="Customer">
            <select value={draft.customerId} onChange={e => setDraft({ ...draft, customerId: e.target.value })}>
              {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <TextInput label="Project name" value={draft.name} onChange={name => setDraft({ ...draft, name })}
            hint="Sizing starts from the default application preset and is editable once the project is open." />
        </Modal>
      )}
    </div>
  );
}
