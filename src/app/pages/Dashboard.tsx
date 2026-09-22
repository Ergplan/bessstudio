'use client';
import Link from 'next/link';
import { ArrowUpRight, Plus } from 'lucide-react';
import { Card, Stat, Badge, Empty, stageTone, quoteTone, date } from '../components/ui';
import { CompositionBar, Funnel, BarChart, series } from '../components/viz';
import { useWorkspace } from '../../platform/workspace';
import { useSession } from '../../platform/auth';
import { formatMoney, restate } from '../../catalog/pricing';
import { application, type ApplicationId } from '../../sizing/applications';
import { customerStages } from '../../platform/types';
import { sizeSystem } from '../../sizing/engine';

export function Dashboard() {
  const { customers, projects, quotes, activities, priceBook, loading } = useWorkspace();
  const { org, user } = useSession();
  const currency = org?.currency ?? priceBook.currency;
  const money = (n: number) => formatMoney(n, currency, true);

  const open = quotes.filter(q => ['draft', 'internal-review', 'sent'].includes(q.status));
  const won = quotes.filter(q => q.status === 'won');
  // Quotations are raised in the currency the customer asked for, so a total across them has to
  // restate each one before it is added to the next.
  const inOrgCurrency = (rows: typeof quotes) => rows.reduce((s, q) => s + restate(q.total, q.currency, currency, priceBook), 0);
  const pipelineValue = inOrgCurrency(open);
  const wonValue = inOrgCurrency(won);
  const winRate = won.length + quotes.filter(q => q.status === 'lost').length > 0
    ? won.length / (won.length + quotes.filter(q => q.status === 'lost').length) : 0;

  // Contracted capacity across every project that has been sized, in MWh and MW.
  const fleet = projects.reduce((acc, p) => {
    try { const s = sizeSystem(p.sizing); return { mwh: acc.mwh + s.installedDcMWh, mw: acc.mw + s.ratedPowerMW, units: acc.units + s.units }; }
    catch { return acc; }
  }, { mwh: 0, mw: 0, units: 0 });

  const funnel = customerStages.filter(s => s !== 'lost').map(stage => {
    const ids = customers.filter(c => c.stage === stage).map(c => c.id);
    const value = quotes.filter(q => ids.includes(q.customerId)).reduce((s, q) => s + q.total, 0);
    return { label: stage, count: ids.length, value };
  });

  const byApplication = Object.entries(projects.reduce<Record<string, number>>((acc, p) => {
    acc[p.sizing.applicationId] = (acc[p.sizing.applicationId] ?? 0) + 1; return acc;
    // The catalogue already writes these names properly. Prettifying the id and letting CSS
    // capitalise it gave "Ev Charging Buffer" and "Frequency Regulation / Fcas".
  }, {})).map(([id, value]) => ({ label: application(id as ApplicationId).name, value }));

  if (loading) return <p className="muted">Loading workspace…</p>;
  if (!customers.length) return (
    <Card><Empty title="Your workspace is empty" message="Add the first customer to start sizing and quoting. Every customer, project and quotation is stored against this organization."
      action={<Link className="btn accent" href="/app/customers"><Plus size={15} /> Add a customer</Link>} /></Card>
  );

  return (
    <div className="grid" style={{ gap: 18 }}>
      <div className="grid cols-4">
        <Stat label="Open pipeline" value={money(pipelineValue)} foot={`${open.length} live quotation${open.length === 1 ? '' : 's'}`} />
        <Stat label="Won this workspace" value={money(wonValue)} foot={`${(winRate * 100).toFixed(0)}% win rate on decided quotes`} />
        <Stat label="Fleet under quote" value={fleet.mwh.toFixed(1)} unit="MWh" foot={`${fleet.mw.toFixed(1)} MW across ${fleet.units} enclosures`} />
        <Stat label="Active customers" value={String(customers.filter(c => c.stage !== 'lost').length)} foot={`${projects.length} project${projects.length === 1 ? '' : 's'} in progress`} />
      </div>

      <div className="grid cols-2">
        <Card title="Sales funnel" subtitle="Quoted value by customer stage">
          <Funnel rows={funnel} format={money} />
        </Card>
        {/* Segments run in palette order. That order is what keeps neighbouring fills apart for
            colour-vision deficiency, so the statuses are laid out to suit it rather than picking
            slots by hand; won leads, which is also where the eye should land. */}
        <Card title="Quote value by status" subtitle="All quotations in this workspace">
          {quotes.length ? (
            <CompositionBar format={money} parts={[
              { label: 'Won', value: wonValue, color: series[0] },
              { label: 'Sent', value: quotes.filter(q => q.status === 'sent').reduce((s, q) => s + q.total, 0), color: series[1] },
              { label: 'Lost', value: quotes.filter(q => q.status === 'lost').reduce((s, q) => s + q.total, 0), color: series[2] },
              { label: 'Draft', value: quotes.filter(q => q.status === 'draft').reduce((s, q) => s + q.total, 0), color: series[3] },
            ].filter(p => p.value > 0)} />
          ) : <p className="muted">No quotations yet.</p>}
          {byApplication.length > 0 && <div style={{ marginTop: 22 }}>
            <h4 style={{ fontSize: 12.5, marginBottom: 8 }}>Projects by application</h4>
            <BarChart bars={byApplication} height={168} width={460} format={n => String(Math.round(n))} colorFor={() => series[1]} />
          </div>}
        </Card>
      </div>

      <div className="grid cols-2">
        <Card title="Recent quotations" actions={<Link className="btn sm" href="/app/quotes">All quotes <ArrowUpRight size={13} /></Link>} tight>
          {quotes.length ? (
            <table className="data">
              <thead><tr><th>Number</th><th>Customer</th><th>Status</th><th className="num">Value</th></tr></thead>
              <tbody>{quotes.slice(0, 6).map(q => (
                <tr key={q.id}><td><Link href={`/app/quotes?id=${q.id}`}><b>{q.number}</b> r{q.version}</Link></td>
                  <td>{q.customerName}</td><td><Badge tone={quoteTone[q.status]}>{q.status}</Badge></td>
                  <td className="num">{formatMoney(q.total, q.currency, true)}</td></tr>
              ))}</tbody>
            </table>
          ) : <p className="muted" style={{ padding: 16 }}>No quotations yet.</p>}
        </Card>

        <Card title="Activity" subtitle={`Signed in as ${user?.displayName}`} tight>
          {activities.length ? (
            <table className="data">
              <thead><tr><th>When</th><th>Record</th><th>Event</th></tr></thead>
              <tbody>{activities.slice(0, 7).map(a => (
                <tr key={a.id}><td style={{ whiteSpace: 'nowrap' }}>{date(a.at)}</td><td><b>{a.refName}</b></td><td className="muted">{a.message}</td></tr>
              ))}</tbody>
            </table>
          ) : <p className="muted" style={{ padding: 16 }}>Nothing logged yet.</p>}
        </Card>
      </div>

      <Card title="Customers" actions={<Link className="btn sm" href="/app/customers">Manage <ArrowUpRight size={13} /></Link>} tight>
        <table className="data">
          <thead><tr><th>Customer</th><th>Segment</th><th>Location</th><th>Stage</th><th className="num">Projects</th><th className="num">Quoted</th></tr></thead>
          <tbody>{customers.slice(0, 8).map(c => {
            const value = quotes.filter(q => q.customerId === c.id).reduce((s, q) => s + q.total, 0);
            return <tr key={c.id}><td><Link href={`/app/customers?id=${c.id}`}><b>{c.name}</b></Link></td>
              <td style={{ textTransform: 'capitalize' }}>{c.segment.replace(/-/g, ' ')}</td><td>{[c.city, c.country].filter(Boolean).join(', ')}</td>
              <td><Badge tone={stageTone[c.stage]}>{c.stage}</Badge></td>
              <td className="num">{projects.filter(p => p.customerId === c.id).length}</td>
              <td className="num">{value ? money(value) : '—'}</td></tr>;
          })}</tbody>
        </table>
      </Card>
    </div>
  );
}
