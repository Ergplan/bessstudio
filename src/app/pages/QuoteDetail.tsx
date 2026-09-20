import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Printer, Copy, Send, Download } from 'lucide-react';
import { Card, Badge, Empty, Tabs, KV, NumberInput, SelectInput, Field, quoteTone, date } from '../components/ui';
import { Proposal } from '../components/Proposal';
import { useWorkspace } from '../../platform/workspace';
import { useSession } from '../../platform/auth';
import { can, quoteStatuses, type Quote, type QuoteStatus } from '../../platform/types';
import { quoteTotals, reviseQuote } from '../../quoting/quote';
import { currencies, formatMoney, type Currency } from '../../catalog/pricing';

type Tab = 'commercial' | 'scope' | 'proposal';

export function QuoteDetail() {
  const { quoteId = '' } = useParams();
  const navigate = useNavigate();
  const { quotes, saveQuote } = useWorkspace();
  const { org, role } = useSession();
  const [tab, setTab] = useState<Tab>('commercial');
  const quote = quotes.find(q => q.id === quoteId);
  const writable = can(role, 'quote.write');

  if (!quote || !org) return <Card><Empty title="Quotation not found" message="It may have been deleted." action={<Link className="btn" to="/quotes">Back to quotations</Link>} /></Card>;

  const money = (n: number) => formatMoney(n, quote.currency);
  const patch = (changes: Partial<Quote>, note?: string) => {
    const next = { ...quote, ...changes };
    void saveQuote({ ...next, ...quoteTotals(next.lines, next.discountPct, next.taxPct, next.freight) }, note);
  };
  const setLine = (id: string, changes: Partial<Quote['lines'][number]>) => {
    const lines = quote.lines.map(l => (l.id === id ? { ...l, ...changes, total: (changes.quantity ?? l.quantity) * (changes.unitPrice ?? l.unitPrice) } : l));
    patch({ lines });
  };
  const setStatus = (status: QuoteStatus) => patch({ status, sentAt: status === 'sent' ? new Date().toISOString() : quote.sentAt },
    `Quotation ${quote.number} moved to ${status}.`);
  const revise = async () => { const next = reviseQuote(quote); await saveQuote(next, `Revision ${next.version} of ${quote.number} created.`, 'created'); navigate(`/quotes/${next.id}`); };

  const exportJson = () => {
    const blob = new Blob([JSON.stringify({ organization: org.name, quote }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `${quote.number}-r${quote.version}.json`; a.click();
  };

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="row no-print">
        <Link className="btn ghost sm" to={`/projects/${quote.projectId}`}><ArrowLeft size={15} /> {quote.projectName}</Link>
        <div className="spacer" />
        {writable && quote.status === 'draft' && <button className="btn" onClick={() => setStatus('internal-review')}>Send for review</button>}
        {writable && ['draft', 'internal-review'].includes(quote.status) && can(role, 'quote.approve') && <button className="btn accent" onClick={() => setStatus('sent')}><Send size={14} /> Mark as sent</button>}
        {writable && quote.status === 'sent' && <>
          <button className="btn accent" onClick={() => setStatus('won')}>Mark won</button>
          <button className="btn danger" onClick={() => setStatus('lost')}>Mark lost</button>
        </>}
        {writable && <button className="btn" onClick={() => void revise()}><Copy size={14} /> New revision</button>}
        <button className="btn" onClick={exportJson}><Download size={14} /> JSON</button>
        <button className="btn primary" onClick={() => window.print()}><Printer size={14} /> Print / PDF</button>
      </div>

      <div className="grid cols-4 no-print">
        <div className="stat"><div className="label">Quotation</div><p className="value" style={{ fontSize: 21 }}>{quote.number}<small>r{quote.version}</small></p><div className="foot"><Badge tone={quoteTone[quote.status]}>{quote.status}</Badge></div></div>
        <div className="stat"><div className="label">Customer</div><p className="value" style={{ fontSize: 17 }}>{quote.customerName}</p><div className="foot">{quote.projectName}</div></div>
        <div className="stat"><div className="label">Total</div><p className="value">{money(quote.total)}</p><div className="foot">{currencies[quote.currency].name}</div></div>
        <div className="stat"><div className="label">Valid until</div><p className="value" style={{ fontSize: 19 }}>{date(quote.validUntil)}</p><div className="foot">Prepared by {quote.preparedBy}</div></div>
      </div>

      <div className="no-print">
        <Tabs<Tab> active={tab} onChange={setTab} tabs={[{ id: 'commercial', label: 'Pricing' }, { id: 'scope', label: 'Scope & terms' }, { id: 'proposal', label: 'Proposal document' }]} />
      </div>

      {tab === 'commercial' && (
        <div className="grid cols-3 no-print">
          <div style={{ gridColumn: 'span 2' }}>
            <Card title="Price lines" subtitle="Edit quantity or unit price; totals recalculate" tight>
              <table className="data">
                <thead><tr><th>Item</th><th className="num">Qty</th><th>Unit</th><th className="num">Unit price</th><th className="num">Amount</th><th>Optional</th></tr></thead>
                <tbody>{quote.lines.map(l => (
                  <tr key={l.id}>
                    <td><b>{l.label}</b>{l.note && <div className="muted" style={{ fontSize: 11 }}>{l.note}</div>}</td>
                    <td className="num"><input type="number" value={l.quantity} disabled={!writable} aria-label={`${l.label} quantity`}
                      onChange={e => setLine(l.id, { quantity: Number(e.target.value) })} style={{ width: 88, textAlign: 'right', padding: '4px 6px', border: '1px solid var(--line)', borderRadius: 6 }} /></td>
                    <td className="muted">{l.unit}</td>
                    <td className="num"><input type="number" value={Math.round(l.unitPrice * 100) / 100} disabled={!writable} aria-label={`${l.label} unit price`}
                      onChange={e => setLine(l.id, { unitPrice: Number(e.target.value) })} style={{ width: 104, textAlign: 'right', padding: '4px 6px', border: '1px solid var(--line)', borderRadius: 6 }} /></td>
                    <td className="num"><b>{money(l.total)}</b></td>
                    <td><input type="checkbox" checked={l.optional} disabled={!writable} aria-label={`${l.label} optional`} onChange={e => setLine(l.id, { optional: e.target.checked })} /></td>
                  </tr>
                ))}</tbody>
              </table>
            </Card>
          </div>
          <div className="grid" style={{ alignContent: 'start' }}>
            <Card title="Commercial terms">
              <SelectInput label="Currency" value={quote.currency} options={(Object.keys(currencies) as Currency[]).map(c => ({ value: c, label: `${c} — ${currencies[c].name}` }))}
                onChange={currency => patch({ currency })} hint="Changing the currency relabels the document; re-issue from the project to reprice." />
              <NumberInput label="Discount" value={quote.discountPct} unit="%" min={0} max={40} step={0.5} onChange={discountPct => patch({ discountPct })} />
              <NumberInput label="Tax" value={quote.taxPct} unit="%" min={0} max={40} step={0.5} onChange={taxPct => patch({ taxPct })} />
              <NumberInput label="Freight and insurance" value={Math.round(quote.freight)} unit={quote.currency} min={0} max={1e8} step={500} onChange={freight => patch({ freight })} />
              <div style={{ marginTop: 10 }}>
                <KV label="Subtotal">{money(quote.subtotal)}</KV>
                {quote.discount > 0 && <KV label="Discount">−{money(quote.discount)}</KV>}
                {quote.freight > 0 && <KV label="Freight">{money(quote.freight)}</KV>}
                {quote.tax > 0 && <KV label="Tax">{money(quote.tax)}</KV>}
                <KV label="Total"><span style={{ fontSize: 15 }}>{money(quote.total)}</span></KV>
              </div>
            </Card>
            <Card title="Status">
              <SelectInput label="Quotation status" value={quote.status} options={quoteStatuses.map(s => ({ value: s, label: s.replace(/-/g, ' ') }))} onChange={setStatus} />
              <KV label="Created">{date(quote.createdAt)}</KV>
              <KV label="Sent">{quote.sentAt ? date(quote.sentAt) : '—'}</KV>
              <KV label="Price book">{quote.priceBookId}</KV>
            </Card>
          </div>
        </div>
      )}

      {tab === 'scope' && (
        <div className="grid cols-2 no-print">
          <Card title="Delivery terms">
            <Field label="Incoterms"><input value={quote.incoterms} disabled={!writable} onChange={e => patch({ incoterms: e.target.value })} /></Field>
            <Field label="Payment terms"><textarea rows={2} value={quote.paymentTerms} disabled={!writable} onChange={e => patch({ paymentTerms: e.target.value })} /></Field>
            <div className="grid cols-2" style={{ gap: 0, columnGap: 12 }}>
              <NumberInput label="Delivery" value={quote.deliveryWeeks} unit="weeks" min={1} max={104} onChange={deliveryWeeks => patch({ deliveryWeeks })} />
              <NumberInput label="Warranty" value={quote.warrantyYears} unit="years" min={1} max={20} onChange={warrantyYears => patch({ warrantyYears })} />
            </div>
            <Field label="Valid until"><input type="date" value={quote.validUntil} disabled={!writable} onChange={e => patch({ validUntil: e.target.value })} /></Field>
          </Card>
          <Card title="Scope statements" subtitle="One item per line; these print on the proposal">
            <Field label="Included"><textarea rows={6} value={quote.scopeIncluded.join('\n')} disabled={!writable} onChange={e => patch({ scopeIncluded: e.target.value.split('\n').filter(Boolean) })} /></Field>
            <Field label="Excluded"><textarea rows={5} value={quote.scopeExcluded.join('\n')} disabled={!writable} onChange={e => patch({ scopeExcluded: e.target.value.split('\n').filter(Boolean) })} /></Field>
            <Field label="Basis of quotation"><textarea rows={5} value={quote.assumptions.join('\n')} disabled={!writable} onChange={e => patch({ assumptions: e.target.value.split('\n').filter(Boolean) })} /></Field>
          </Card>
        </div>
      )}

      {tab === 'proposal' && <Proposal quote={quote} org={org} />}
    </div>
  );
}
