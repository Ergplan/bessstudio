'use client';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Card, Badge, Empty, quoteTone, date } from '../components/ui';
import { useWorkspace } from '../../platform/workspace';
import { formatMoney } from '../../catalog/pricing';
import { quoteStatuses, type QuoteStatus } from '../../platform/types';

export function Quotes() {
  const { quotes } = useWorkspace();
  const [filter, setFilter] = useState(''), [statusFilter, setStatusFilter] = useState<'all' | QuoteStatus>('all');
  const rows = useMemo(() => quotes.filter(q =>
    (statusFilter === 'all' || q.status === statusFilter) &&
    (!filter || `${q.number} ${q.customerName} ${q.projectName}`.toLowerCase().includes(filter.toLowerCase()))
  ), [quotes, filter, statusFilter]);
  const total = rows.reduce((s, q) => s + q.total, 0);

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="row">
        <input placeholder="Search quotations…" value={filter} onChange={e => setFilter(e.target.value)} aria-label="Search quotations"
          style={{ padding: '8px 12px', border: '1px solid var(--line)', borderRadius: 8, minWidth: 260, fontSize: 13 }} />
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as typeof statusFilter)} aria-label="Filter by status"
          style={{ padding: '8px 12px', border: '1px solid var(--line)', borderRadius: 8, fontSize: 13 }}>
          <option value="all">All statuses</option>{quoteStatuses.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <div className="spacer" />
        <span className="muted">{rows.length} quotation{rows.length === 1 ? '' : 's'} · {rows.length ? formatMoney(total, rows[0].currency, true) : '—'}</span>
      </div>
      <Card tight>
        {rows.length ? (
          <table className="data">
            <thead><tr><th>Number</th><th>Customer</th><th>Project</th><th>Status</th><th>Prepared</th><th>Valid until</th><th className="num">Value</th></tr></thead>
            <tbody>{rows.map(q => (
              <tr key={q.id}>
                <td><Link href={`/app/quotes?id=${q.id}`}><b>{q.number}</b></Link> <span className="muted">r{q.version}</span></td>
                <td><Link href={`/app/customers?id=${q.customerId}`}>{q.customerName}</Link></td>
                <td><Link href={`/app/projects?id=${q.projectId}`}>{q.projectName}</Link></td>
                <td><Badge tone={quoteTone[q.status]}>{q.status}</Badge></td>
                <td className="muted">{q.preparedBy}<div style={{ fontSize: 11 }}>{date(q.createdAt)}</div></td>
                <td className="muted">{date(q.validUntil)}</td>
                <td className="num"><b>{formatMoney(q.total, q.currency)}</b></td>
              </tr>
            ))}</tbody>
          </table>
        ) : <Empty title="No quotations" message="Size a project, then raise a quotation from the sizing workbench." action={<Link className="btn accent" href="/app/projects">Go to projects</Link>} />}
      </Card>
    </div>
  );
}
