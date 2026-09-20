import { brand } from '../../brand/brand';
import { formatMoney } from '../../catalog/pricing';
import { date } from './ui';
import type { Organization, Quote } from '../../platform/types';

/**
 * Customer-facing proposal. Printed via the browser (Ctrl/Cmd+P → Save as PDF), which keeps the
 * document in the organization's branding without shipping a PDF engine to the client.
 */
export function Proposal({ quote, org }: { quote: Quote; org: Organization }) {
  const b = org.branding, money = (n: number) => formatMoney(n, quote.currency);
  const snapshot = quote.sizingSnapshot as { units?: number; installedDcMWh?: number; ratedPowerMW?: number; enclosure?: string; pcs?: string; rteAc?: number; endOfLifeRetention?: number } | null;
  const billable = quote.lines.filter(l => !l.optional), optional = quote.lines.filter(l => l.optional);

  return (
    <article className="proposal" style={{ background: '#fff', padding: '34px 38px', borderRadius: 14, border: '1px solid var(--line)' }}>
      <header style={{ display: 'flex', alignItems: 'flex-start', gap: 18, paddingBottom: 18, borderBottom: `3px solid ${b.accent}` }}>
        {b.logo && <img src={b.logo} alt="" style={{ height: 62, objectFit: 'contain' }} />}
        <div style={{ flex: 1 }}>
          <h2 style={{ fontSize: 21, color: b.primary }}>{b.legalName || b.displayName}</h2>
          <div style={{ fontSize: 11.5, color: 'var(--slate-light)', lineHeight: 1.7, marginTop: 3 }}>
            {b.address}<br />{b.email} · {b.phone}{b.website && <> · {b.website.replace(/^https?:\/\//, '')}</>}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 10.5, letterSpacing: '.12em', color: 'var(--slate-light)', fontWeight: 600 }}>QUOTATION</div>
          <div style={{ fontSize: 19, fontWeight: 700, color: b.primary }}>{quote.number}</div>
          <div style={{ fontSize: 11.5, color: 'var(--slate-light)' }}>Revision {quote.version} · {date(quote.createdAt)}</div>
        </div>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 26, margin: '22px 0' }}>
        <div>
          <h4 style={{ fontSize: 10.5, letterSpacing: '.1em', color: 'var(--slate-light)' }}>PREPARED FOR</h4>
          <p style={{ margin: '5px 0 0', fontSize: 14.5, fontWeight: 600, color: b.primary }}>{quote.customerName}</p>
          <p style={{ margin: 0, fontSize: 12.5, color: 'var(--slate)' }}>{quote.projectName}</p>
        </div>
        <div>
          <h4 style={{ fontSize: 10.5, letterSpacing: '.1em', color: 'var(--slate-light)' }}>VALIDITY & TERMS</h4>
          <p style={{ margin: '5px 0 0', fontSize: 12.5, color: 'var(--slate)', lineHeight: 1.7 }}>
            Valid until <b>{date(quote.validUntil)}</b> · {quote.incoterms}<br />
            Delivery {quote.deliveryWeeks} weeks from order · Warranty {quote.warrantyYears} years
          </p>
        </div>
      </div>

      {snapshot && (
        <section style={{ background: '#F8FAFB', borderRadius: 10, padding: '14px 18px', marginBottom: 22 }}>
          <h4 style={{ fontSize: 11, letterSpacing: '.1em', color: 'var(--slate-light)', marginBottom: 9 }}>SYSTEM CONFIGURATION</h4>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, fontSize: 12.5 }}>
            {[
              ['Rated power', `${snapshot.ratedPowerMW?.toFixed(2)} MW`],
              ['Installed DC energy', `${snapshot.installedDcMWh?.toFixed(2)} MWh`],
              ['Enclosures', `${snapshot.units} × ${snapshot.enclosure}`],
              ['Power conversion', String(snapshot.pcs)],
              ['Round trip at AC', `${((snapshot.rteAc ?? 0) * 100).toFixed(1)}%`],
              ['Retention at end of life', `${((snapshot.endOfLifeRetention ?? 0) * 100).toFixed(1)}%`],
            ].map(([k, v]) => <div key={k}><div style={{ color: 'var(--slate-light)', fontSize: 11 }}>{k}</div><b style={{ color: b.primary }}>{v}</b></div>)}
          </div>
        </section>
      )}

      <table className="data" style={{ marginBottom: 18 }}>
        <thead><tr><th>Item</th><th className="num">Quantity</th><th>Unit</th><th className="num">Unit price</th><th className="num">Amount</th></tr></thead>
        <tbody>
          {billable.map(l => (
            <tr key={l.id}><td><b>{l.label}</b>{l.note && <div className="muted" style={{ fontSize: 11 }}>{l.note}</div>}</td>
              <td className="num">{l.quantity.toLocaleString(undefined, { maximumFractionDigits: 1 })}</td><td>{l.unit}</td>
              <td className="num">{money(l.unitPrice)}</td><td className="num"><b>{money(l.total)}</b></td></tr>
          ))}
        </tbody>
        <tfoot>
          <tr><td colSpan={4} className="num">Subtotal</td><td className="num">{money(quote.subtotal)}</td></tr>
          {quote.discountPct > 0 && <tr><td colSpan={4} className="num">Discount ({quote.discountPct}%)</td><td className="num">−{money(quote.discount)}</td></tr>}
          {quote.freight > 0 && <tr><td colSpan={4} className="num">Freight and insurance</td><td className="num">{money(quote.freight)}</td></tr>}
          {quote.taxPct > 0 && <tr><td colSpan={4} className="num">Tax ({quote.taxPct}%)</td><td className="num">{money(quote.tax)}</td></tr>}
          <tr><td colSpan={4} className="num" style={{ fontWeight: 700, color: b.primary, fontSize: 14 }}>Total {quote.currency}</td>
            <td className="num" style={{ fontWeight: 700, color: b.primary, fontSize: 14 }}>{money(quote.total)}</td></tr>
        </tfoot>
      </table>

      {optional.length > 0 && (
        <section style={{ marginBottom: 18 }}>
          <h4 style={{ fontSize: 12.5, color: b.primary, marginBottom: 7 }}>Optional scope, not included in the total</h4>
          {optional.map(l => <div key={l.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, padding: '4px 0', borderBottom: '1px solid var(--line-soft)' }}>
            <span>{l.label}</span><b>{money(l.total)}</b></div>)}
        </section>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 26, marginBottom: 20 }}>
        {([['Included in scope', quote.scopeIncluded], ['Excluded from scope', quote.scopeExcluded]] as const).map(([title, items]) => (
          <section key={title}>
            <h4 style={{ fontSize: 12.5, color: b.primary, marginBottom: 7 }}>{title}</h4>
            <ul style={{ margin: 0, paddingLeft: 17, fontSize: 12, color: 'var(--slate)', lineHeight: 1.75 }}>
              {items.map(t => <li key={t}>{t}</li>)}
            </ul>
          </section>
        ))}
      </div>

      <section style={{ marginBottom: 20 }}>
        <h4 style={{ fontSize: 12.5, color: b.primary, marginBottom: 7 }}>Basis of quotation</h4>
        <ul style={{ margin: 0, paddingLeft: 17, fontSize: 12, color: 'var(--slate)', lineHeight: 1.75 }}>
          {quote.assumptions.map(t => <li key={t}>{t}</li>)}
        </ul>
        <p style={{ fontSize: 11.5, color: 'var(--slate-light)', marginTop: 10, lineHeight: 1.6 }}>{brand.qualification}</p>
      </section>

      <section style={{ fontSize: 12, color: 'var(--slate)', lineHeight: 1.7, borderTop: '1px solid var(--line)', paddingTop: 14 }}>
        <b style={{ color: b.primary }}>Payment terms.</b> {quote.paymentTerms}
      </section>

      <footer style={{ marginTop: 26, paddingTop: 14, borderTop: '1px solid var(--line)', display: 'flex', alignItems: 'center', gap: 12, fontSize: 11, color: 'var(--slate-light)' }}>
        <img src={brand.mark} alt="" style={{ height: 18 }} />
        <span style={{ flex: 1 }}>Prepared by {quote.preparedBy} · {quote.preparedByEmail}<br />{brand.creditLong}</span>
        <span>{b.displayName} · {quote.number} r{quote.version}</span>
      </footer>
    </article>
  );
}
