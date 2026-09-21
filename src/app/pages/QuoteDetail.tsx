'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useRef, useState } from 'react';
import { ArrowLeft, Printer, Copy, Send, Download, FileCode2, RotateCcw } from 'lucide-react';
import { Card, Badge, Empty, Tabs, KV, NumberInput, SelectInput, TextInput, TextArea, Field, quoteTone, date } from '../components/ui';
import { Proposal } from '../components/Proposal';
import { Offer } from '../components/Offer';
import { defaultOfferContent, offerOf, type OfferContent } from '../../quoting/offer';
import { offerHtml, download as downloadFile } from '../../quoting/export';
import { sizeSystem, type SizingInput } from '../../sizing/engine';
import { evaluateFinance } from '../../sizing/finance';
import { useWorkspace } from '../../platform/workspace';
import { useSession } from '../../platform/auth';
import { can, quoteStatuses, type Quote, type QuoteStatus } from '../../platform/types';
import { quoteTotals, reviseQuote } from '../../quoting/quote';
import { currencies, formatMoney, type Currency } from '../../catalog/pricing';

type Tab = 'commercial' | 'scope' | 'content' | 'offer' | 'proposal';

export function QuoteDetail({ id: quoteId }: { id: string }) {
  const router = useRouter();
  const { quotes, projects, priceBook, saveQuote } = useWorkspace();
  const { org, role } = useSession();
  const [tab, setTab] = useState<Tab>('commercial');
  const offerRef = useRef<HTMLDivElement>(null);
  const quote = quotes.find(q => q.id === quoteId);
  const writable = can(role, 'quote.write');
  const project = projects.find(p => p.id === quote?.projectId);

  // The document is built from the sizing the quotation was raised against, so a sent offer never
  // moves when the project is edited afterwards.
  const built = useMemo(() => {
    if (!quote || !org) return null;
    const snapshot = (quote.sizingSnapshot as { input?: SizingInput } | null)?.input ?? project?.sizing;
    if (!snapshot) return null;
    try {
      const sizing = sizeSystem(snapshot);
      const finance = evaluateFinance(sizing, { ...priceBook, currency: quote.currency });
      const fallback = defaultOfferContent({
        org, sizing, customerName: quote.customerName, projectName: quote.projectName,
        number: quote.number, deliveryWeeks: quote.deliveryWeeks, warrantyYears: quote.warrantyYears,
      });
      fallback.coverImage = project?.studioImage ?? null;
      return { sizing, finance, content: offerOf(quote, fallback), fallback };
    } catch { return null; }
  }, [quote, org, project, priceBook]);

  if (!quote || !org) return <Card><Empty title="Quotation not found" message="It may have been deleted." action={<Link className="btn" href="/app/quotes">Back to quotations</Link>} /></Card>;

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
  const revise = async () => { const next = reviseQuote(quote); await saveQuote(next, `Revision ${next.version} of ${quote.number} created.`, 'created'); router.push(`/app/quotes?id=${next.id}`); };

  const setOffer = (patch: Partial<OfferContent>) =>
    patch && quote && void saveQuote({ ...quote, offer: { ...(quote.offer ?? {}), ...patch } });

  const exportOfferHtml = () => {
    if (!offerRef.current || !quote) return;
    const node = offerRef.current.querySelector('.offer');
    if (!node) return;
    downloadFile(offerHtml(node as HTMLElement, `${quote.number} r${quote.version} — ${quote.customerName}`),
      `${quote.number}-r${quote.version}-offer.html`);
  };

  const exportJson = () => {
    const blob = new Blob([JSON.stringify({ organization: org.name, quote }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `${quote.number}-r${quote.version}.json`; a.click();
  };

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="row no-print">
        <Link className="btn ghost sm" href={`/app/projects?id=${quote.projectId}`}><ArrowLeft size={15} /> {quote.projectName}</Link>
        <div className="spacer" />
        {writable && quote.status === 'draft' && <button className="btn" onClick={() => setStatus('internal-review')}>Send for review</button>}
        {writable && ['draft', 'internal-review'].includes(quote.status) && can(role, 'quote.approve') && <button className="btn accent" onClick={() => setStatus('sent')}><Send size={14} /> Mark as sent</button>}
        {writable && quote.status === 'sent' && <>
          <button className="btn accent" onClick={() => setStatus('won')}>Mark won</button>
          <button className="btn danger" onClick={() => setStatus('lost')}>Mark lost</button>
        </>}
        {writable && <button className="btn" onClick={() => void revise()}><Copy size={14} /> New revision</button>}
        <button className="btn" onClick={exportJson}><Download size={14} /> JSON</button>
        <button className="btn" onClick={exportOfferHtml} disabled={!built}><FileCode2 size={14} /> Offer HTML</button>
        <button className="btn primary" onClick={() => { setTab('offer'); setTimeout(() => window.print(), 120); }}>
          <Printer size={14} /> Print offer / PDF
        </button>
      </div>

      <div className="grid cols-4 no-print">
        <div className="stat"><div className="label">Quotation</div><p className="value" style={{ fontSize: 21 }}>{quote.number}<small>r{quote.version}</small></p><div className="foot"><Badge tone={quoteTone[quote.status]}>{quote.status}</Badge></div></div>
        <div className="stat"><div className="label">Customer</div><p className="value" style={{ fontSize: 17 }}>{quote.customerName}</p><div className="foot">{quote.projectName}</div></div>
        <div className="stat"><div className="label">Total</div><p className="value">{money(quote.total)}</p><div className="foot">{currencies[quote.currency].name}</div></div>
        <div className="stat"><div className="label">Valid until</div><p className="value" style={{ fontSize: 19 }}>{date(quote.validUntil)}</p><div className="foot">Prepared by {quote.preparedBy}</div></div>
      </div>

      <div className="no-print">
        <Tabs<Tab> active={tab} onChange={setTab} tabs={[
          { id: 'commercial', label: 'Pricing' }, { id: 'scope', label: 'Scope & terms' },
          { id: 'content', label: 'Offer content' }, { id: 'offer', label: 'Offer document' },
          { id: 'proposal', label: 'One-page summary' },
        ]} />
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
            <TextInput label="Incoterms" value={quote.incoterms} disabled={!writable} onChange={incoterms => patch({ incoterms })} />
            <TextArea label="Payment terms" rows={2} value={quote.paymentTerms} disabled={!writable} onChange={paymentTerms => patch({ paymentTerms })} />
            <div className="grid cols-2" style={{ gap: 0, columnGap: 12 }}>
              <NumberInput label="Delivery" value={quote.deliveryWeeks} unit="weeks" min={1} max={104} onChange={deliveryWeeks => patch({ deliveryWeeks })} />
              <NumberInput label="Warranty" value={quote.warrantyYears} unit="years" min={1} max={20} onChange={warrantyYears => patch({ warrantyYears })} />
            </div>
            <TextInput label="Valid until" type="date" value={quote.validUntil} disabled={!writable} onChange={validUntil => patch({ validUntil })} />
          </Card>
          <Card title="Scope statements" subtitle="One item per line; these print on the proposal">
            <TextArea label="Included" rows={6} value={quote.scopeIncluded.join('\n')} disabled={!writable} onChange={v => patch({ scopeIncluded: v.split('\n').filter(Boolean) })} />
            <TextArea label="Excluded" rows={5} value={quote.scopeExcluded.join('\n')} disabled={!writable} onChange={v => patch({ scopeExcluded: v.split('\n').filter(Boolean) })} />
            <TextArea label="Basis of quotation" rows={5} value={quote.assumptions.join('\n')} disabled={!writable} onChange={v => patch({ assumptions: v.split('\n').filter(Boolean) })} />
          </Card>
        </div>
      )}

      {tab === 'content' && (built ? (
        <div className="grid cols-3 no-print">
          <Card title="Offer header" subtitle="Shown on the cover and in every page header">
            <TextInput label="Reference" value={built.content.reference} onChange={reference => setOffer({ reference })} />
            <TextInput label="Title" value={built.content.title} onChange={title => setOffer({ title })} hint="For example 350 MW / 700 MWh" />
            <TextInput label="Subtitle" value={built.content.subtitle} onChange={subtitle => setOffer({ subtitle })} />
            <TextInput label="Configuration" value={built.content.configuration} onChange={configuration => setOffer({ configuration })} />
            <TextInput label="Submitted to" value={built.content.submittedTo} onChange={submittedTo => setOffer({ submittedTo })} />
            <div className="grid cols-2" style={{ gap: 0, columnGap: 12 }}>
              <TextInput label="Kind attention" value={built.content.attentionName} onChange={attentionName => setOffer({ attentionName })} />
              <TextInput label="Attention email" value={built.content.attentionEmail} onChange={attentionEmail => setOffer({ attentionEmail })} />
            </div>
          </Card>

          <Card title="Commercial header">
            <TextInput label="Price basis" value={built.content.priceBasis} onChange={priceBasis => setOffer({ priceBasis })} />
            <TextInput label="Manufacturer" value={built.content.manufacturer} onChange={manufacturer => setOffer({ manufacturer })} />
            <TextInput label="Supplied through" value={built.content.suppliedThrough} onChange={suppliedThrough => setOffer({ suppliedThrough })} />
            <TextInput label="Delivery period" value={built.content.deliveryPeriod} onChange={deliveryPeriod => setOffer({ deliveryPeriod })} />
            <NumberInput label="Validity" value={built.content.validityDays} unit="days" min={1} max={180} onChange={validityDays => setOffer({ validityDays })} />
            <label className="field" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" checked={built.content.confidential} disabled={!writable} style={{ width: 'auto' }}
                onChange={e => setOffer({ confidential: e.target.checked })} />
              <span style={{ margin: 0 }}>Mark the footer private &amp; confidential</span>
            </label>
            <TextInput label="Cover image" value={built.content.coverImage ?? ''} disabled={!writable}
              placeholder="Capture one from the 3D studio, or paste a URL"
              onChange={v => setOffer({ coverImage: v || null })} />
            <p className="muted">
              {project
                ? <>Open the <Link href={`/studio?project=${project.id}`}>3D studio</Link> and use “Capture for offer” to place a rendered cut-away on the cover. With no image the document draws a vector cut-away from the sizing.</>
                : 'With no image the document draws a vector cut-away from the sizing.'}
            </p>
            <button className="btn sm" disabled={!writable} onClick={() => quote && void saveQuote({ ...quote, offer: {} }, 'Offer content reset to the generated defaults.')}>
              <RotateCcw size={13} /> Reset all offer content
            </button>
          </Card>

          <Card title="Narrative" subtitle="One item per line">
            <TextArea label="Why us — heading and body separated by a colon" rows={5} disabled={!writable}
              value={built.content.highlights.map(h => `${h.title}: ${h.body}`).join('\n')}
              onChange={v => setOffer({ highlights: v.split('\n').filter(Boolean).map(line => {
                const i = line.indexOf(':');
                return i < 0 ? { title: line.trim(), body: '' } : { title: line.slice(0, i).trim(), body: line.slice(i + 1).trim() };
              }) })} />
            <TextArea label="Basis and qualifications" rows={7} disabled={!writable}
              value={built.content.qualifications.join('\n')}
              onChange={v => setOffer({ qualifications: v.split('\n').filter(Boolean) })} />
            <TextArea label="Acceptance note" rows={3} disabled={!writable} value={built.content.acceptanceNote}
              onChange={acceptanceNote => setOffer({ acceptanceNote })} />
          </Card>
        </div>
      ) : <Card><Empty title="No sizing behind this quotation" message="The project this quotation was raised against is no longer available, so the offer cannot be built." /></Card>)}

      {tab === 'offer' && (built ? (
        <div className="offer-preview" ref={offerRef}>
          <Offer quote={quote} org={org} sizing={built.sizing} finance={built.finance} content={built.content}
            priceBook={{ ...priceBook, currency: quote.currency }} />
        </div>
      ) : <Card><Empty title="No sizing behind this quotation" message="The project this quotation was raised against is no longer available, so the offer cannot be built." /></Card>)}

      {tab === 'proposal' && <Proposal quote={quote} org={org} />}
    </div>
  );
}
