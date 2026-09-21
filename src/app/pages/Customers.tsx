'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { Plus, Trash2, ArrowLeft, Building2 } from 'lucide-react';
import { Card, Badge, Empty, Modal, TextInput, SelectInput, Field, stageTone, quoteTone, date, KV } from '../components/ui';
import { useWorkspace, projectsOf, quotesOf } from '../../platform/workspace';
import { useSession } from '../../platform/auth';
import { can, customerStages, segments, uid, nowIso, type Customer, type CustomerStage, type Segment } from '../../platform/types';
import { formatMoney } from '../../catalog/pricing';
import { defaultSizingInput } from '../../sizing/engine';

const blank = (orgId: string, ownerUid: string, ownerName: string): Customer => ({
  id: uid('cus'), orgId, name: '', segment: 'commercial', stage: 'lead', country: '', city: '', website: '', notes: '',
  contacts: [{ id: uid('con'), name: '', title: '', email: '', phone: '', primary: true }],
  ownerUid, ownerName, createdAt: nowIso(), updatedAt: nowIso(),
});

function CustomerForm({ value, onChange }: { value: Customer; onChange: (c: Customer) => void }) {
  const contact = value.contacts[0] ?? { id: uid('con'), name: '', title: '', email: '', phone: '', primary: true };
  const setContact = (patch: Partial<typeof contact>) => onChange({ ...value, contacts: [{ ...contact, ...patch }, ...value.contacts.slice(1)] });
  return (
    <>
      <TextInput label="Customer name" value={value.name} onChange={name => onChange({ ...value, name })} placeholder="Rajasthan Renewable Power" />
      <div className="grid cols-2" style={{ gap: 0, columnGap: 14 }}>
        <SelectInput label="Segment" value={value.segment} onChange={segment => onChange({ ...value, segment: segment as Segment })}
          options={segments.map(s => ({ value: s, label: s.replace(/-/g, ' ').replace(/^./, m => m.toUpperCase()) }))} />
        <SelectInput label="Stage" value={value.stage} onChange={stage => onChange({ ...value, stage: stage as CustomerStage })}
          options={customerStages.map(s => ({ value: s, label: s.replace(/^./, m => m.toUpperCase()) }))} />
        <TextInput label="City" value={value.city} onChange={city => onChange({ ...value, city })} />
        <TextInput label="Country" value={value.country} onChange={country => onChange({ ...value, country })} />
      </div>
      <TextInput label="Website" value={value.website} onChange={website => onChange({ ...value, website })} placeholder="https://" />
      <h4 style={{ fontSize: 12.5, margin: '16px 0 10px' }}>Primary contact</h4>
      <div className="grid cols-2" style={{ gap: 0, columnGap: 14 }}>
        <TextInput label="Name" value={contact.name} onChange={name => setContact({ name })} />
        <TextInput label="Title" value={contact.title} onChange={title => setContact({ title })} />
        <TextInput label="Email" type="email" value={contact.email} onChange={email => setContact({ email })} />
        <TextInput label="Phone" value={contact.phone} onChange={phone => setContact({ phone })} />
      </div>
      <Field label="Notes"><textarea rows={3} value={value.notes} onChange={e => onChange({ ...value, notes: e.target.value })} /></Field>
    </>
  );
}

export function Customers() {
  const { customers, projects, quotes, saveCustomer } = useWorkspace();
  const { org, user, role } = useSession();
  const [draft, setDraft] = useState<Customer | null>(null);
  const [filter, setFilter] = useState(''), [stage, setStage] = useState<'all' | CustomerStage>('all');
  const writable = can(role, 'customer.write');

  const rows = useMemo(() => customers.filter(c =>
    (stage === 'all' || c.stage === stage) &&
    (!filter || `${c.name} ${c.country} ${c.city} ${c.segment}`.toLowerCase().includes(filter.toLowerCase()))
  ), [customers, filter, stage]);

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="row">
        <input placeholder="Search customers…" value={filter} onChange={e => setFilter(e.target.value)} aria-label="Search customers"
          style={{ padding: '8px 12px', border: '1px solid var(--line)', borderRadius: 8, minWidth: 260, fontSize: 13 }} />
        <select value={stage} onChange={e => setStage(e.target.value as typeof stage)} aria-label="Filter by stage"
          style={{ padding: '8px 12px', border: '1px solid var(--line)', borderRadius: 8, fontSize: 13 }}>
          <option value="all">All stages</option>
          {customerStages.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <div className="spacer" />
        {writable && <button className="btn accent" onClick={() => setDraft(blank(org!.id, user!.uid, user!.displayName))}><Plus size={15} /> New customer</button>}
      </div>

      <Card tight>
        {rows.length ? (
          <table className="data">
            <thead><tr><th>Customer</th><th>Segment</th><th>Location</th><th>Stage</th><th>Owner</th><th className="num">Projects</th><th className="num">Quoted</th><th>Updated</th></tr></thead>
            <tbody>{rows.map(c => {
              const value = quotesOf(quotes, 'customerId', c.id).reduce((s, q) => s + q.total, 0);
              return (
                <tr key={c.id}>
                  <td><Link href={`/app/customers?id=${c.id}`}><b>{c.name}</b></Link></td>
                  <td style={{ textTransform: 'capitalize' }}>{c.segment.replace(/-/g, ' ')}</td>
                  <td>{[c.city, c.country].filter(Boolean).join(', ') || '—'}</td>
                  <td><Badge tone={stageTone[c.stage]}>{c.stage}</Badge></td>
                  <td className="muted">{c.ownerName}</td>
                  <td className="num">{projectsOf(projects, c.id).length}</td>
                  <td className="num">{value ? formatMoney(value, org?.currency ?? 'USD', true) : '—'}</td>
                  <td className="muted">{date(c.updatedAt)}</td>
                </tr>
              );
            })}</tbody>
          </table>
        ) : <Empty title="No customers match" message="Adjust the search or stage filter, or add a new customer record." />}
      </Card>

      {draft && (
        <Modal title="New customer" onClose={() => setDraft(null)} footer={<>
          <button className="btn" onClick={() => setDraft(null)}>Cancel</button>
          <button className="btn accent" disabled={draft.name.trim().length < 2}
            onClick={() => { void saveCustomer(draft, `${draft.name} created.`); setDraft(null); }}>Create customer</button>
        </>}>
          <CustomerForm value={draft} onChange={setDraft} />
        </Modal>
      )}
    </div>
  );
}

export function CustomerDetail({ id: customerId }: { id: string }) {
  const router = useRouter();
  const { customers, projects, quotes, activities, saveCustomer, saveProject, removeRecord } = useWorkspace();
  const { org, user, role } = useSession();
  const customer = customers.find(c => c.id === customerId);
  const [edit, setEdit] = useState<Customer | null>(null);
  const [newProject, setNewProject] = useState('');
  const writable = can(role, 'customer.write');

  if (!customer) return <Card><Empty title="Customer not found" message="This record may have been deleted or belongs to another organization." action={<Link className="btn" href="/app/customers">Back to customers</Link>} /></Card>;

  const mine = projectsOf(projects, customer.id), theirQuotes = quotesOf(quotes, 'customerId', customer.id);
  const createProject = async () => {
    const name = newProject.trim(); if (!name) return;
    const id = uid('prj');
    await saveProject({
      id, orgId: org!.id, customerId: customer.id, customerName: customer.name, name,
      reference: `${customer.name.slice(0, 3).toUpperCase()}-${String(mine.length + 1).padStart(2, '0')}`,
      status: 'sizing', site: { location: [customer.city, customer.country].filter(Boolean).join(', '), latitude: null, longitude: null, gridOperator: '', commissioningTarget: '' },
      sizing: defaultSizingInput(), studioConfig: null, notes: '', createdAt: nowIso(), updatedAt: nowIso(), updatedBy: user!.displayName,
    }, `Project ${name} created for ${customer.name}.`);
    setNewProject('');
    router.push(`/app/projects?id=${id}`);
  };

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="row">
        <Link className="btn ghost sm" href="/app/customers"><ArrowLeft size={15} /> Customers</Link>
        <div className="spacer" />
        {writable && <button className="btn" onClick={() => setEdit(customer)}>Edit</button>}
        {can(role, 'org.manage') && <button className="btn danger" onClick={() => { if (confirm(`Delete ${customer.name} and keep its projects? This cannot be undone.`)) { void removeRecord('customers', customer.id); router.push('/app/customers'); } }}><Trash2 size={14} /> Delete</button>}
      </div>

      <div className="grid cols-3">
        <div style={{ gridColumn: 'span 2' }} className="grid">
          <Card title={customer.name} subtitle={[customer.city, customer.country].filter(Boolean).join(', ') || 'Location not set'}
            actions={<Badge tone={stageTone[customer.stage]}>{customer.stage}</Badge>}>
            <div className="grid cols-2" style={{ gap: 0, columnGap: 24 }}>
              <div>
                <KV label="Segment"><span style={{ textTransform: 'capitalize' }}>{customer.segment.replace(/-/g, ' ')}</span></KV>
                <KV label="Owner">{customer.ownerName}</KV>
                <KV label="Website">{customer.website ? <a href={customer.website} target="_blank" rel="noreferrer">{customer.website.replace(/^https?:\/\//, '')}</a> : '—'}</KV>
              </div>
              <div>
                <KV label="Projects">{mine.length}</KV>
                <KV label="Quoted value">{formatMoney(theirQuotes.reduce((s, q) => s + q.total, 0), org?.currency ?? 'USD', true)}</KV>
                <KV label="Added">{date(customer.createdAt)}</KV>
              </div>
            </div>
            {customer.notes && <p className="muted" style={{ marginTop: 14 }}>{customer.notes}</p>}
          </Card>

          <Card title="Projects" tight actions={writable ? (
            <div className="row" style={{ gap: 6 }}>
              <input placeholder="New project name" value={newProject} onChange={e => setNewProject(e.target.value)} aria-label="New project name"
                onKeyDown={e => { if (e.key === 'Enter') void createProject(); }}
                style={{ padding: '6px 10px', border: '1px solid var(--line)', borderRadius: 8, fontSize: 12.5, width: 190 }} />
              <button className="btn accent sm" onClick={() => void createProject()} disabled={!newProject.trim()}><Plus size={14} /> Add</button>
            </div>
          ) : undefined}>
            {mine.length ? (
              <table className="data">
                <thead><tr><th>Project</th><th>Reference</th><th>Application</th><th>Status</th><th>Updated</th></tr></thead>
                <tbody>{mine.map(p => (
                  <tr key={p.id}><td><Link href={`/app/projects?id=${p.id}`}><b>{p.name}</b></Link></td><td className="mono">{p.reference}</td>
                    <td style={{ textTransform: 'capitalize' }}>{p.sizing.applicationId.replace(/-/g, ' ')}</td>
                    <td><Badge tone={p.status === 'awarded' ? 'good' : p.status === 'quoted' ? 'info' : 'neutral'}>{p.status}</Badge></td>
                    <td className="muted">{date(p.updatedAt)}</td></tr>
                ))}</tbody>
              </table>
            ) : <Empty title="No projects yet" message="Create a project to open the sizing workbench for this customer." />}
          </Card>

          <Card title="Quotations" tight>
            {theirQuotes.length ? (
              <table className="data">
                <thead><tr><th>Number</th><th>Project</th><th>Status</th><th>Valid until</th><th className="num">Value</th></tr></thead>
                <tbody>{theirQuotes.map(q => (
                  <tr key={q.id}><td><Link href={`/app/quotes?id=${q.id}`}><b>{q.number}</b> r{q.version}</Link></td><td>{q.projectName}</td>
                    <td><Badge tone={quoteTone[q.status]}>{q.status}</Badge></td><td className="muted">{date(q.validUntil)}</td>
                    <td className="num">{formatMoney(q.total, q.currency, true)}</td></tr>
                ))}</tbody>
              </table>
            ) : <Empty title="No quotations" message="Size a project and issue a quotation from the sizing workbench." />}
          </Card>
        </div>

        <div className="grid" style={{ alignContent: 'start' }}>
          <Card title="Contacts">
            {customer.contacts.filter(c => c.name).map(c => (
              <div key={c.id} style={{ paddingBottom: 12, marginBottom: 12, borderBottom: '1px solid var(--line-soft)' }}>
                <b style={{ fontSize: 13.5, color: 'var(--navy)' }}>{c.name}</b>{c.primary && <Badge tone="info">Primary</Badge>}
                <div className="muted">{c.title}</div>
                {c.email && <div className="muted"><a href={`mailto:${c.email}`}>{c.email}</a></div>}
                {c.phone && <div className="muted">{c.phone}</div>}
              </div>
            ))}
            {!customer.contacts.some(c => c.name) && <p className="muted">No contacts recorded.</p>}
          </Card>
          <Card title="Activity">
            {activities.filter(a => a.refId === customer.id || mine.some(p => p.id === a.refId)).slice(0, 8).map(a => (
              <div key={a.id} style={{ display: 'flex', gap: 10, padding: '7px 0', borderBottom: '1px solid var(--line-soft)' }}>
                <Building2 size={14} style={{ color: 'var(--slate-light)', flexShrink: 0, marginTop: 2 }} />
                <div><div style={{ fontSize: 12.5 }}>{a.message}</div><div className="muted" style={{ fontSize: 11 }}>{date(a.at)} · {a.actorName}</div></div>
              </div>
            ))}
          </Card>
        </div>
      </div>

      {edit && (
        <Modal title={`Edit ${customer.name}`} onClose={() => setEdit(null)} footer={<>
          <button className="btn" onClick={() => setEdit(null)}>Cancel</button>
          <button className="btn accent" onClick={() => { void saveCustomer(edit, `${edit.name} updated.`); setEdit(null); }}>Save changes</button>
        </>}>
          <CustomerForm value={edit} onChange={setEdit} />
        </Modal>
      )}
    </div>
  );
}
