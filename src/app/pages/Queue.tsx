'use client';
import Link from 'next/link';
import { Inbox, Clock } from 'lucide-react';
import { Card, Badge, Empty, quoteTone, date } from '../components/ui';
import { useSession } from '../../platform/auth';
import { useWorkspace } from '../../platform/workspace';
import { salesQueue, waitingFor } from '../../platform/notifications';
import { can } from '../../platform/types';
import { Financial } from '../components/Gate';
import { currencies, formatMoney } from '../../catalog/pricing';

/**
 * The sales queue.
 *
 * Submitted enquiries used to sit in the main quotation list and had to be spotted, which is the
 * kind of gap that does not fail a test and does lose a customer. They have their own page now,
 * oldest first, with how long each has been waiting stated plainly.
 */
export function Queue() {
  const { role } = useSession();
  const { quotes, loading } = useWorkspace();
  const { waiting, inHand } = salesQueue(quotes, role);

  if (!can(role, 'quote.prepare')) {
    return <Empty title="Not your queue" message="Preparing quotations is a sales, approver or administrator task." />;
  }

  const money = (n: number, c: keyof typeof currencies) => formatMoney(n, c, true);

  const table = (rows: typeof waiting, emptyLine: string, showWait: boolean) => rows.length ? (
    <table className="data">
      <thead>
        <tr>
          <th>Quotation</th><th>Customer</th><th>Project</th>
          {showWait && <th>Waiting</th>}<th>Status</th><th className="num">Value</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(q => (
          <tr key={q.id}>
            <td><Link href={`/app/quotes/?id=${q.id}`}><b>{q.number}</b></Link></td>
            <td>{q.customerName}</td>
            <td>{q.projectName}</td>
            {showWait && <td><span className="waited"><Clock size={12} /> {waitingFor(q)}</span></td>}
            <td><Badge tone={quoteTone[q.status] ?? 'neutral'}>{q.status}</Badge></td>
            <td className="num"><Financial inline>{money(q.total, q.currency)}</Financial></td>
          </tr>
        ))}
      </tbody>
    </table>
  ) : <p className="muted" style={{ padding: '14px 18px' }}>{emptyLine}</p>;

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="grid cols-2">
        <div className="stat">
          <div className="label">Waiting to be picked up</div>
          <p className="value">{waiting.length}</p>
          <div className="foot">{waiting.length ? `Oldest has waited ${waitingFor(waiting[0])}` : 'Nothing waiting'}</div>
        </div>
        <div className="stat">
          <div className="label">In hand</div>
          <p className="value">{inHand.length}</p>
          <div className="foot">Being prepared, approved or awaiting issue</div>
        </div>
      </div>

      <Card title="New enquiries" subtitle="Customers who have asked for a formal quotation — oldest first" tight>
        {loading ? <p className="muted" style={{ padding: '14px 18px' }}>Loading…</p>
          : table(waiting, 'No enquiries waiting. Submitted designs appear here the moment a customer sends one.', true)}
      </Card>

      <Card title="In hand" subtitle="Already picked up, not yet issued" tight>
        {table(inHand, 'Nothing in hand.', false)}
      </Card>
    </div>
  );
}
