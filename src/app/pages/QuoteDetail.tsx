'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useRef, useState } from 'react';
import { ArrowLeft, Printer, Copy, Send, Download, FileCode2, RotateCcw, Plus, Trash2 } from 'lucide-react';
import { Card, Badge, Empty, Tabs, KV, NumberInput, SelectInput, TextInput, TextArea, Field, quoteTone, date } from '../components/ui';
import { Proposal } from '../components/Proposal';
import { Offer } from '../components/Offer';
import { defaultOfferContent, offerOf, type OfferContent } from '../../quoting/offer';
import { offerHtml, download as downloadFile } from '../../quoting/export';
import { sizeSystem, type SizingInput } from '../../sizing/engine';
import { evaluateFinance } from '../../sizing/finance';
import { useWorkspace } from '../../platform/workspace';
import { useSession } from '../../platform/auth';
import { approvalModeOf, can, customerStatusLabels, isCustomerRole, type Quote } from '../../platform/types';
import { applyAction, availableActions, isEditable } from '../../quoting/lifecycle';
import { Financial, useFinancialAccess } from '../components/Gate';
import { addCustomLine, convertQuote, quoteTotals, removeLine, reviseQuote } from '../../quoting/quote';
import { atRate, currencies, formatMoney, type Currency } from '../../catalog/pricing';
import { designHashOf, engineeringAppendix, staleAgainst } from '../../quoting/appendix';
import type { StoredRun } from '../../sim/store';

type Tab = 'commercial' | 'scope' | 'content' | 'offer' | 'proposal' | 'appendix';

export function QuoteDetail({ id: quoteId }: { id: string }) {
  const router = useRouter();
  const { quotes, projects, priceBook, saveQuote, runs } = useWorkspace();
  const { org, role, user } = useSession();
  const [tab, setTab] = useState<Tab>('commercial');
  const [note, setNote] = useState('');
  const offerRef = useRef<HTMLDivElement>(null);
  const quote = quotes.find(q => q.id === quoteId);
  const customerView = isCustomerRole(role);
  const { allowed: showMoney } = useFinancialAccess();
  // Editable means the figures underneath may still move. Once sales owns the record, the
  // customer keeps sight of it but not the pen.
  const writable = quote ? isEditable(role, quote) : false;
  const approvalMode = approvalModeOf(org);
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
    // A partially typed number ("-", "1e") parses to NaN, and a NaN total spreads to the whole
    // quotation and cannot be typed back out of.
    const num = (v: number | undefined, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
    const lines = quote.lines.map(l => {
      if (l.id !== id) return l;
      const quantity = num(changes.quantity, l.quantity), unitPrice = num(changes.unitPrice, l.unitPrice);
      return { ...l, ...changes, quantity, unitPrice, total: atRate(quantity * unitPrice, quote.currency) };
    });
    patch({ lines });
  };
  const revise = async () => { const next = reviseQuote(quote); await saveQuote(next, `Revision ${next.version} of ${quote.number} created.`, 'created'); router.push(`/app/quotes?id=${next.id}`); };

  const setOffer = (patch: Partial<OfferContent>) =>
    patch && quote && void saveQuote({ ...quote, offer: { ...(quote.offer ?? {}), ...patch } });

  const exportOfferHtml = async () => {
    if (!offerRef.current || !quote) return;
    const node = offerRef.current.querySelector('.offer');
    if (!node) return;
    downloadFile(await offerHtml(node as HTMLElement, `${quote.number} r${quote.version} — ${quote.customerName}`),
      `${quote.number}-r${quote.version}-offer.html`);
  };

  const exportJson = () => {
    const blob = new Blob([JSON.stringify({ organization: org.name, quote }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `${quote.number}-r${quote.version}.json`; a.click();
  };

  const move = async (action: Parameters<typeof applyAction>[1], reason?: string) => {
    if (!user) return;
    const next = applyAction(quote, action, { uid: user.uid, displayName: user.displayName }, reason);
    await saveQuote(next, `${quote.number} — ${action.replace('-', ' ')}.`, 'status');
  };

  return (
    <div className="grid" style={{ gap: 16 }}>
      {quote.kind === 'indicative' && (
        <div className="notice warning no-print">
          <b>Indicative estimate</b>
          <p>
            Self-service pricing from the standard price book. It is illustrative, not an offer, and carries no
            commitment on scope, delivery or price.{' '}
            {quote.status === 'draft'
              ? 'Submit it and our sales team will confirm the details and issue a formal quotation.'
              : 'Our sales team has it and will be in touch to confirm the details.'}
          </p>
        </div>
      )}
      {quote.returnedReason && can(role, 'quote.prepare') && (
        <div className="notice error no-print"><b>Returned by the approver</b><p>{quote.returnedReason}</p></div>
      )}
      <div className="row no-print">
        <Link className="btn ghost sm" href={`/app/projects?id=${quote.projectId}`}><ArrowLeft size={15} /> {quote.projectName}</Link>
        <div className="spacer" />
        {/* One lifecycle, taken from the shared state machine, so the interface cannot offer a
            step the rules would refuse. */}
        {availableActions(role, quote, approvalMode).map(t => (
          <button key={t.action}
            className={['approve', 'submit', 'issue'].includes(t.action) ? 'btn accent' : t.action === 'return' || t.action === 'lose' ? 'btn danger' : 'btn'}
            title={t.describe}
            onClick={() => void move(t.action, t.action === 'return' ? window.prompt('Why is this going back?') ?? undefined : undefined)}>
            {t.action === 'submit' ? <Send size={14} /> : null}{t.label}
          </button>
        ))}
        {!customerView && can(role, 'quote.prepare') && <button className="btn" onClick={() => void revise()}><Copy size={14} /> New revision</button>}
        {!customerView && <button className="btn" onClick={exportJson}><Download size={14} /> JSON</button>}
        {showMoney && <button className="btn" onClick={() => void exportOfferHtml()} disabled={!built}><FileCode2 size={14} /> Offer HTML</button>}
        {showMoney && <button className="btn primary" onClick={() => { setTab('offer'); setTimeout(() => window.print(), 120); }}>
          <Printer size={14} /> Print offer / PDF
        </button>}
      </div>

      <div className="grid cols-4 no-print">
        <div className="stat"><div className="label">{quote.kind === 'indicative' ? 'Indicative estimate' : 'Quotation'}</div><p className="value" style={{ fontSize: 21 }}>{quote.number}<small>r{quote.version}</small></p><div className="foot"><Badge tone={quoteTone[quote.status] ?? 'neutral'}>{customerView ? (customerStatusLabels[quote.status] ?? quote.status) : quote.status}</Badge></div></div>
        <div className="stat"><div className="label">Customer</div><p className="value" style={{ fontSize: 17 }}>{quote.customerName}</p><div className="foot">{quote.projectName}</div></div>
        <div className="stat"><div className="label">Total</div><p className="value"><Financial inline>{money(quote.total)}</Financial></p><div className="foot">{currencies[quote.currency].name}</div></div>
        <div className="stat"><div className="label">Valid until</div><p className="value" style={{ fontSize: 19 }}>{date(quote.validUntil)}</p><div className="foot">Prepared by {quote.preparedBy}</div></div>
      </div>

      <div className="no-print">
        <Tabs<Tab> active={tab} onChange={setTab} tabs={[
          { id: 'commercial', label: 'Pricing' }, { id: 'scope', label: 'Scope & terms' },
          { id: 'content', label: 'Offer content' }, { id: 'appendix', label: 'Engineering appendix' },
          { id: 'offer', label: 'Offer document' }, { id: 'proposal', label: 'One-page summary' },
        ]} />
      </div>

      {tab === 'commercial' && (
        <div className="grid cols-3 no-print">
          <div style={{ gridColumn: 'span 2' }}>
            <Card title="Price lines" subtitle="Edit any line; totals recalculate" tight
              actions={writable ? (
                <button className="btn sm" onClick={() => void saveQuote(addCustomLine(quote), 'Line added.')}>
                  <Plus size={14} /> Add line
                </button>
              ) : undefined}>
              <table className="data">
                <thead><tr><th>Item</th><th className="num">Qty</th><th>Unit</th><th className="num">Unit price</th><th className="num">Amount</th><th>Optional</th><th /></tr></thead>
                <tbody>{quote.lines.map(l => (
                  <tr key={l.id}>
                    <td>
                      {writable
                        ? <input value={l.label} aria-label={`${l.label} description`} onChange={e => setLine(l.id, { label: e.target.value })}
                            style={{ width: '100%', minWidth: 160, padding: '4px 6px', border: '1px solid var(--line)', background: 'var(--field)', color: 'var(--ink)', fontSize: 13 }} />
                        : <b>{l.label}</b>}
                      {l.note && <div className="muted" style={{ fontSize: 11, marginTop: 3 }}>{l.note}</div>}
                    </td>
                    <td className="num"><input type="number" value={l.quantity} disabled={!writable} aria-label={`${l.label} quantity`}
                      onChange={e => setLine(l.id, { quantity: Number(e.target.value) })} style={{ width: 88, textAlign: 'right', padding: '4px 6px', border: '1px solid var(--line)', borderRadius: 6 }} /></td>
                    <td className="muted">{l.unit}</td>
                    <td className="num"><input type="number" value={Math.round(l.unitPrice * 100) / 100} disabled={!writable} aria-label={`${l.label} unit price`}
                      onChange={e => setLine(l.id, { unitPrice: Number(e.target.value) })} style={{ width: 104, textAlign: 'right', padding: '4px 6px', border: '1px solid var(--line)', borderRadius: 6 }} /></td>
                    <td className="num"><b>{money(l.total)}</b></td>
                    <td><input type="checkbox" checked={l.optional} disabled={!writable} aria-label={`${l.label} optional`} onChange={e => setLine(l.id, { optional: e.target.checked })} /></td>
                    <td className="num">{writable && (
                      <button className="btn ghost sm" aria-label={`Remove ${l.label}`} title="Remove this line"
                        onClick={() => void saveQuote(removeLine(quote, l.id), `${l.label} removed.`)}><Trash2 size={13} /></button>
                    )}</td>
                  </tr>
                ))}</tbody>
              </table>
            </Card>
          </div>
          <div className="grid" style={{ alignContent: 'start' }}>
            <Card title="Commercial terms">
              <SelectInput label="Currency" value={quote.currency} options={(Object.keys(currencies) as Currency[]).map(c => ({ value: c, label: `${c} — ${currencies[c].name}` }))}
                onChange={currency => {
                  try {
                    const next = convertQuote(quote, currency, priceBook);
                    void saveQuote(next, `${quote.number} restated in ${currency}.`);
                  } catch (e) { setNote(e instanceof Error ? e.message : 'That currency could not be applied.'); }
                }}
                hint="Every amount is converted at the price book's own rate, so the quotation still reconciles with the build-up that produced it." />
              {note && <p className="muted" style={{ color: 'var(--rose)', marginTop: -4 }}>{note}</p>}
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
              {/* Read-only on purpose. A free dropdown here let a draft become `sent` with nobody
                  recorded as issuing it, and `approved` with no approver — the whole lifecycle
                  bypassed by a select. The actions in the header are the only way to move it. */}
              <KV label="Status">
                <Badge tone={quoteTone[quote.status] ?? 'neutral'}>
                  {customerView ? (customerStatusLabels[quote.status] ?? quote.status) : quote.status}
                </Badge>
              </KV>
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
            <TextInput label="Reference" value={built.content.reference} disabled={!writable} onChange={reference => setOffer({ reference })} />
            <TextInput label="Title" value={built.content.title} disabled={!writable} onChange={title => setOffer({ title })} hint="For example 350 MW / 700 MWh" />
            <TextInput label="Subtitle" value={built.content.subtitle} disabled={!writable} onChange={subtitle => setOffer({ subtitle })} />
            <TextInput label="Configuration" value={built.content.configuration} disabled={!writable} onChange={configuration => setOffer({ configuration })} />
            <TextInput label="Submitted to" value={built.content.submittedTo} disabled={!writable} onChange={submittedTo => setOffer({ submittedTo })} />
            <div className="grid cols-2" style={{ gap: 0, columnGap: 12 }}>
              <TextInput label="Kind attention" value={built.content.attentionName} disabled={!writable} onChange={attentionName => setOffer({ attentionName })} />
              <TextInput label="Attention email" value={built.content.attentionEmail} disabled={!writable} onChange={attentionEmail => setOffer({ attentionEmail })} />
            </div>
          </Card>

          <Card title="Commercial header">
            <TextInput label="Price basis" value={built.content.priceBasis} disabled={!writable} onChange={priceBasis => setOffer({ priceBasis })} />
            <TextInput label="Manufacturer" value={built.content.manufacturer} disabled={!writable} onChange={manufacturer => setOffer({ manufacturer })} />
            <TextInput label="Supplied through" value={built.content.suppliedThrough} disabled={!writable} onChange={suppliedThrough => setOffer({ suppliedThrough })} />
            <TextInput label="Delivery period" value={built.content.deliveryPeriod} disabled={!writable} onChange={deliveryPeriod => setOffer({ deliveryPeriod })} />
            <NumberInput label="Validity" value={built.content.validityDays} disabled={!writable} unit="days" min={1} max={180} onChange={validityDays => setOffer({ validityDays })} />
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
                ? <>Open the <Link href={`/app/studio?project=${project.id}`}>3D studio</Link> and use “Capture for offer” to place a rendered cut-away on the cover. With no image the document draws a vector cut-away from the sizing.</>
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

      {tab === 'appendix' && (built ? (
        <Appendix quote={quote} sizing={built.sizing} project={project ?? null} role={role} runs={runs}
          onApprove={() => patch({
            evidenceApprovedBy: user?.displayName || user?.email || 'Unknown',
            evidenceApprovedByUid: user?.uid ?? null,
            evidenceApprovedAt: new Date().toISOString(),
          }, 'Engineering evidence approved.')}
          onAnchor={() => patch({ designHash: designHashOf(built.sizing, built.sizing.input) }, 'Quotation tied to the current design revision.')} />
      ) : <Card><Empty title="No design behind this quotation" message="An appendix describes a design, and this quotation has none available." /></Card>)}

      {tab === 'proposal' && <Proposal quote={quote} org={org} />}
    </div>
  );
}

/**
 * The engineering appendix, and the two things §16 will not let it do.
 *
 * It does not release anything: the buttons here record an engineering approval and tie the
 * quotation to a design revision, and neither is an approval of a price. And it does not let a
 * design change pass quietly: a quotation prepared against an earlier revision says so, in the
 * place somebody reads before sending it.
 */
function Appendix({ quote, sizing, project, role, runs, onApprove, onAnchor }: {
  quote: Quote; sizing: ReturnType<typeof sizeSystem>; project: { id: string; sizing: SizingInput } | null;
  role: Parameters<typeof can>[0]; runs: StoredRun[]; onApprove: () => void; onAnchor: () => void;
}) {
  const current = designHashOf(sizing, sizing.input);
  const live = project ? designHashOf(sizeSystem(project.sizing), project.sizing) : current;
  const staleness = staleAgainst(quote.designHash ?? current, live);
  // The newest result kept against this project, if there is one. A run whose four hashes do not
  // match what it is being attached to is refused by the appendix itself rather than here.
  const kept = project ? runs.filter(r => r.projectId === project.id)[0] ?? null : null;
  const appendix = engineeringAppendix({
    sizing, designHash: quote.designHash ?? current,
    run: kept
      ? {
        run: kept.record, series: kept.series,
        hashes: {
          scenario: kept.record.scenarioHash, plant: kept.record.plantHash,
          policy: kept.record.policyHash, parameters: kept.record.parameterSetHash,
        },
      }
      : null,
    evidence: quote.evidenceApprovedAt
      ? { approvedBy: quote.evidenceApprovedBy ?? 'Unknown', approvedAt: date(quote.evidenceApprovedAt) }
      : null,
  });
  return (
    <div className="grid" style={{ gap: 14 }}>
      {staleness.stale && (
        <div className="notice error"><b>The design has moved on since this quotation was prepared</b>
          <p>{staleness.message}</p></div>
      )}
      {!quote.designHash && (
        <div className="notice warning"><b>This quotation is not tied to a design revision yet</b>
          <p>Until it is, nothing can tell whether the design has changed under it.</p></div>
      )}
      {appendix.warnings.map(w => <div key={w} className="notice warning"><p>{w}</p></div>)}

      {appendix.sections.map(section => (
        <Card key={section.heading} title={section.heading} tight
          actions={<Badge tone={section.status === 'reviewed' ? 'good' : 'warn'}>{section.status}</Badge>}>
          {section.rows.map(r => <KV key={r.label} label={r.label}>{r.value}</KV>)}
          <ul className="muted" style={{ margin: '10px 0 0', paddingLeft: 18, lineHeight: 1.7 }}>
            {section.notes.map(n => <li key={n}>{n}</li>)}
          </ul>
        </Card>
      ))}

      <Card title="What this appendix is not" tight>
        <ul className="muted" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.8 }}>
          {appendix.limitations.map(l => <li key={l}>{l}</li>)}
        </ul>
        <div className="row" style={{ marginTop: 12 }}>
          <button className="btn sm" onClick={onAnchor} disabled={quote.designHash === live}>
            Tie this quotation to the current design
          </button>
          <button className="btn sm accent" onClick={onApprove} disabled={!can(role, 'evidence.approve') || !!quote.evidenceApprovedAt}>
            Approve the engineering evidence
          </button>
          <div className="spacer" />
          <span className="muted">
            {can(role, 'evidence.approve')
              ? 'Approving the evidence covers the model and its assumptions. It is not an approval of the price.'
              : 'Only a role that may vouch for engineering evidence can approve it, and that is not the role that releases a price.'}
          </span>
        </div>
      </Card>
    </div>
  );
}
