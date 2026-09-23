'use client';
import { useEffect, useRef, useState } from 'react';
import { brand } from '../../brand/brand';
import { atRate, formatMoney, fromLanded, localRate, type Currency } from '../../catalog/pricing';
import { uplift } from '../../quoting/quote';
import { packOf, cellOf } from '../../catalog/products';
import type { SizingResult } from '../../sizing/engine';
import { landedForSizing, type FinanceResult } from '../../sizing/finance';
import { energySchedule, offerTotals, plantConfiguration, type OfferContent } from '../../quoting/offer';
import type { PriceBook } from '../../catalog/pricing';
import type { Organization, Quote } from '../../platform/types';
import { EnclosureDiagram } from './EnclosureDiagram';
import { date } from './ui';
import { offerCss } from '../offerStyles';

export type OfferProps = { quote: Quote; org: Organization; sizing: SizingResult; finance: FinanceResult; content: OfferContent; priceBook: PriceBook };

const num = (n: number, d = 0) => n.toLocaleString('en', { minimumFractionDigits: d, maximumFractionDigits: d });

/** A4 is 297 mm; anything past it would be clipped in print, so the page says so on screen. */
const A4_PX = 297 / 25.4 * 96;

function Page({ n, org, content, title, children }: { n: number; org: Organization; content: OfferContent; title: string; children: React.ReactNode }) {
  const b = org.branding;
  const ref = useRef<HTMLElement>(null);
  const [over, setOver] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const measure = () => setOver(Math.round(el.getBoundingClientRect().height - A4_PX));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [children]);
  return (
    <article className="offer-page" ref={ref}>
      <header className="offer-head" style={{ background: b.primary, borderBottomColor: b.accent }}>
        {b.logo && <img src={b.logo} alt="" />}
        <div className="who"><b>{(b.legalName || b.displayName).toUpperCase()}</b><span>Battery Energy Storage Systems · Solar EPC · Manufacturing</span></div>
        <div className="what"><b>{content.title} BESS</b><span>{title}</span></div>
      </header>
      <div className="offer-body">{children}</div>
      {over > 1 && <div className="offer-overflow">Page {n} runs {Math.round(over / 96 * 25.4)} mm past A4 and would be cut in print. Shorten the text on this page.</div>}
      <footer className="offer-foot">
        <div className="row-1">
          <span>{b.legalName || b.displayName} · {b.address} · {b.email} · {b.website.replace(/^https?:\/\//, '')}</span>
        </div>
        <div className="row-2">
          <span className="conf">{content.confidential ? 'Private & confidential · ' : ''}Ref. {content.reference} · {brand.credit}</span>
          <span><b>Page {n} of 4</b></span>
        </div>
      </footer>
    </article>
  );
}

const Section = ({ n, title, note, children }: { n: number; title: string; note?: string; children?: React.ReactNode }) => (
  <>
    <h2 className="sec"><em>{n}.</em>{title}</h2>
    {note && <p className="sec-note">{note}</p>}
    {children}
  </>
);

/** Twenty-year energy chart: two stacked plots on one shared year axis, never a second scale. */
function EnergyChart({ rows, accent, navy }: { rows: ReturnType<typeof energySchedule>; accent: string; navy: string }) {
  const years = rows.filter(r => r.year > 0);
  if (!years.length) return null;
  const w = 720, padL = 44, padR = 12, barsH = 86, lineH = 34, gap = 10;
  const maxE = Math.max(...years.map(r => Math.max(r.suppliedGWh, r.chargingGWh))) * 1.1 || 1;
  const slot = (w - padL - padR) / years.length, bw = Math.min(11, slot / 2.6);
  const ticks = [0, maxE].map(t => Math.round(t * 10) / 10);
  const x = (i: number) => padL + slot * (i + 0.5);
  const yE = (v: number) => barsH - (v / maxE) * (barsH - 10);
  const yR = (v: number) => barsH + gap + lineH - ((v - 0.5) / 0.55) * (lineH - 8);
  return (
    <>
      <svg className="offer-chart" viewBox={`0 0 ${w} ${barsH + gap + lineH + 18}`} role="img" aria-label="Annual energy and capacity retention over the project life">
        {ticks.map(t => <g key={t}><line x1={padL} x2={w - padR} y1={yE(t)} y2={yE(t)} stroke="#E4EAEE" strokeWidth="1" /><text x={padL - 6} y={yE(t) + 3} textAnchor="end" fontSize="8">{t}</text></g>)}
        <text x={padL - 6} y={10} textAnchor="end" fontSize="8" fontWeight="600">GWh</text>
        {years.map((r, i) => (
          <g key={r.year}>
            <rect x={x(i) - bw - 1} y={yE(r.chargingGWh)} width={bw} height={barsH - yE(r.chargingGWh)} rx="1.5" fill="#B9CCDA" />
            <rect x={x(i) + 1} y={yE(r.suppliedGWh)} width={bw} height={barsH - yE(r.suppliedGWh)} rx="1.5" fill={navy} />
          </g>
        ))}
        <line x1={padL} x2={w - padR} y1={barsH} y2={barsH} stroke="#B6C3CC" strokeWidth="1" />
        {[1, 0.5].map(t => <g key={t}><line x1={padL} x2={w - padR} y1={yR(t)} y2={yR(t)} stroke="#EEF2F5" strokeWidth="1" /><text x={padL - 6} y={yR(t) + 3} textAnchor="end" fontSize="8">{Math.round(t * 100)}%</text></g>)}
        <polyline points={years.map((r, i) => `${x(i)},${yR(r.retention)}`).join(' ')} fill="none" stroke={accent} strokeWidth="2" strokeLinejoin="round" />
        {years.map((r, i) => <circle key={r.year} cx={x(i)} cy={yR(r.retention)} r="2" fill="#fff" stroke={accent} strokeWidth="1.4" />)}
        {years.filter((_, i) => i % 2 === 0 || i === years.length - 1).map((r) => (
          <text key={r.year} x={x(years.indexOf(r))} y={barsH + gap + lineH + 12} textAnchor="middle" fontSize="8">{r.year}</text>
        ))}
      </svg>
      <div className="offer-legend">
        <span><i style={{ background: '#B9CCDA' }} />Charging energy required, incl. auxiliaries</span>
        <span><i style={{ background: navy }} />Energy supplied to customer</span>
        <span><i style={{ background: accent }} />Capacity retention</span>
      </div>
    </>
  );
}

export function Offer({ quote, org, sizing, finance, content, priceBook }: OfferProps) {
  const b = org.branding, enc = sizing.enclosure, pack = packOf(enc), cell = cellOf(pack);
  const L = sizing.input.losses;
  const local: Currency = quote.currency;
  const money = (n: number) => formatMoney(n, local);
  const allRows = energySchedule(sizing), totals = offerTotals(sizing);
  const rows = allRows.length > 21 ? allRows.slice(0, 21) : allRows;
  const truncated = allRows.length - rows.length;
  const unitMWh = sizing.installedDcMWh / sizing.units;
  const rate = localRate(priceBook, local);

  // The build-up on the customer's page is a SELLING price build-up: contingency and margin ride
  // inside the basic rate, exactly as they do in a supplier's own offer, so the per-enclosure
  // figures multiply out to the order value on the same page.
  const factor = uplift(finance);
  // Struck by the same function that prices the project, with the uplift applied to every rate.
  // Rebuilding it here drifted the moment the rates stopped being one number for every product.
  const landed = finance.landed ? landedForSizing(sizing, priceBook, factor) : null;
  // The landed build-up is struck in rupees at the offer's own rate. Quoted in any other currency
  // every rupee figure travels back through that rate and out at the reference rate for the
  // currency asked for — otherwise a rupee amount is printed under a dollar heading, and the
  // build-up stops reconciling with the order value beside it.
  const fromInr = (inr: number) => fromLanded(inr, priceBook.landed, local);
  // The table prints the rate and the amount side by side, so the amount is computed from the rate
  // as printed. Otherwise "7 × 44,791,087" sits next to a figure two rupees away from it.
  const perEnclosure = landed ? atRate(fromInr(landed.deliveredInr), local) : 0;
  const perPcs = landed ? atRate(fromInr(landed.pcsInr), local) : 0;
  const enclosuresTotal = sizing.units * perEnclosure;
  const pcsTotal = sizing.units * perPcs;

  return (
    <div className="offer" style={{ ['--o-navy' as string]: b.primary, ['--o-accent' as string]: b.accent }}>
      <style>{offerCss}</style>

      {/* ---------------------------------------------------------------- cover */}
      <Page n={1} org={org} content={content} title="Technical & Commercial Proposal">
        <div className="hero-eyebrow">Technical &amp; Commercial Proposal</div>
        <h1 className="hero-title">{content.title}</h1>
        <p className="hero-sub">{content.subtitle}</p>
        <p className="hero-line">
          {sizing.units} enclosures · {num(sizing.packs)} packs · {num(sizing.cells)} prismatic {cell.chemistry} cells · {sizing.effectiveDurationH.toFixed(1)}-hour duration at {sizing.systemCRate.toFixed(2)} C
        </p>

        <div className="stat-row">
          {[
            [`${num(sizing.installedDcMWh, 1)} MWh`, 'Nameplate energy'],
            [`${num(sizing.units * enc.ratedKW / 1000, 1)} MW`, 'Nominal DC power'],
            [`${sizing.input.projectYears} years`, 'Design life modelled'],
            [`≥ ${num(cell.cycleLife)}`, `Cycles at ${Math.round(cell.cycleLifeDod * 100)}% DoD`],
          ].map(([v, k]) => <div className="stat-tile" key={k} style={{ background: b.primary, borderBottomColor: b.accent }}><b>{v}</b><span>{k}</span></div>)}
        </div>

        <figure className="cover-figure">
          {content.coverImage
            ? <img src={content.coverImage} alt={`${enc.model} assembly`} />
            : <EnclosureDiagram sizing={sizing} accent={b.accent} navy={b.primary} />}
          <figcaption>{enc.cooling === 'liquid' ? 'Liquid-cooled' : 'Air-cooled'} {unitMWh.toFixed(3)} MWh enclosure{content.coverImage ? '' : ' — cut-away'}. Illustrative; the approved general arrangement drawing governs.</figcaption>
        </figure>

        <div className="two-col">
          <div className="why">
            <h4 className="eyebrow">Why {b.displayName}</h4>
            <ul>{content.highlights.map(h => <li key={h.title}><b>{h.title}</b><span>{h.body}</span></li>)}</ul>
          </div>
          <div>
            <h4 className="eyebrow">Proposal details</h4>
            <table className="offer-table spec-table">
              <tbody>
                <tr><td>Reference</td><td>{content.reference}</td></tr>
                <tr><td>Date</td><td>{date(quote.createdAt)}</td></tr>
                <tr><td>Validity</td><td>{content.validityDays} days from date of proposal</td></tr>
                <tr><td>Submitted to</td><td>{content.submittedTo}</td></tr>
                {content.attentionName && <tr><td>Kind attention</td><td>{content.attentionName}{content.attentionEmail ? ` · ${content.attentionEmail}` : ''}</td></tr>}
                <tr><td>Price basis</td><td>{content.priceBasis}</td></tr>
                <tr><td>Manufacturer</td><td>{content.manufacturer}</td></tr>
                <tr><td>Supplied through</td><td><img src={brand.wordmark} alt={brand.vendor} style={{ height: '3.4mm', verticalAlign: '-0.4mm', marginRight: '1mm' }} />— {content.suppliedThrough}</td></tr>
                <tr><td>Configuration</td><td>{content.configuration}</td></tr>
                <tr><td>Delivery</td><td>{content.deliveryPeriod}</td></tr>
                <tr><td>Order value</td><td><b>{formatMoney(quote.total, local, true)}</b> {content.priceBasis.toLowerCase().includes('gst') ? 'inclusive of GST' : ''}</td></tr>
              </tbody>
            </table>
          </div>
        </div>

        <div className="contents" style={{ background: b.primary }}>
          <h5>In this proposal</h5>
          <div className="three-col">
            <div><b>Page 2 — Technical</b><p>Plant configuration, enclosure and pack specification, compliance and certification, electrical interfaces, quality assurance and documentation.</p></div>
            <div><b>Page 3 — Energy</b><p>{sizing.input.projectYears}-year modelled performance: capacity retention, usable energy per cycle, annual energy supplied and charging energy required, with the loss basis stated.</p></div>
            <div><b>Page 4 — Commercial</b><p>Price build-up per enclosure, total order value, payment and delivery terms, scope of supply, warranty and the governing commercial terms.</p></div>
          </div>
          <div className="strip">{content.priceBasis} · after-sales support from the works · {quote.warrantyYears}-year warranty</div>
        </div>
      </Page>

      {/* ------------------------------------------------------------- technical */}
      <Page n={2} org={org} content={content} title="Technical & Commercial Proposal">
        <Section n={1} title="Plant Configuration" note={`How the contracted ${sizing.ratedPowerMW.toFixed(1)} MW / ${sizing.requiredUsableMWh.toFixed(0)} MWh rating is built up from the repeating units.`}>
          <table className="offer-table">
            <thead><tr><th style={{ width: '8%' }}>Sl.</th><th style={{ width: '34%' }}>Parameter</th><th>Unit value</th><th>Plant total</th></tr></thead>
            <tbody>{plantConfiguration(sizing).map(r => (
              <tr key={r.sl}><td>{r.sl}</td><td>{r.parameter}</td><td>{r.unit}</td><td><b>{r.total}</b></td></tr>
            ))}</tbody>
          </table>
        </Section>

        <Section n={2} title="Enclosure and Battery Pack Specification">
          <div className="two-col">
            <table className="offer-table spec-table">
              <thead><tr><th>Enclosure</th><th>Specification</th></tr></thead>
              <tbody>
                <tr><td>Rated energy</td><td>{unitMWh.toFixed(3)} MWh ({enc.racks * enc.packsPerRack} × {pack.labelKWh} kWh)</td></tr>
                <tr><td>Nominal DC power</td><td>{(enc.ratedKW / 1000).toFixed(3)} MW at {sizing.packCRate.toFixed(2)} C</td></tr>
                <tr><td>Cell count</td><td>{num(sizing.cells / sizing.units)} prismatic {cell.chemistry} cells</td></tr>
                <tr><td>Cooling</td><td>{enc.cooling === 'liquid' ? 'Liquid-cooled, closed-loop to every rack' : 'Forced-air cooling'}</td></tr>
                <tr><td>Dimensions L×W×H</td><td>{num(enc.lengthMm)} × {num(enc.widthMm, 1)} × {num(enc.heightMm)} mm</td></tr>
                <tr><td>Access</td><td>{enc.doorBaysPerSide} external door bays per side</td></tr>
                <tr><td>Ingress protection</td><td>{enc.ipRating} enclosure / {enc.batteryIpRating} battery</td></tr>
                <tr><td>Fire safety</td><td>{enc.fireSafety}</td></tr>
                <tr><td>BMS</td><td>{enc.bms}</td></tr>
                <tr><td>Communication</td><td>{enc.communications}</td></tr>
                <tr><td>Operating range</td><td>{enc.operatingRangeC[0]} °C to +{enc.operatingRangeC[1]} °C (enclosure design)</td></tr>
                <tr><td>DC window</td><td>{num(enc.dcMinV)} – {num(enc.dcMaxV, 1)} V</td></tr>
              </tbody>
            </table>
            <table className="offer-table spec-table">
              <thead><tr><th>Battery pack {pack.model}</th><th>Specification</th></tr></thead>
              <tbody>
                <tr><td>Configuration</td><td>{pack.parallel}P{pack.series}S — {pack.series} cells in series</td></tr>
                <tr><td>Cell chemistry / format</td><td>{cell.chemistry}, prismatic, {cell.nominalV} V / {cell.ah} Ah</td></tr>
                <tr><td>Nominal voltage</td><td>{pack.nominalV} V DC</td></tr>
                <tr><td>Rated capacity / energy</td><td>{cell.ah} Ah / {pack.labelKWh} kWh</td></tr>
                <tr><td>Max charge voltage</td><td>{pack.maxV} V DC</td></tr>
                <tr><td>Discharge cut-off voltage</td><td>{pack.minV} V DC</td></tr>
                <tr><td>Continuous charge / discharge</td><td>{pack.continuousA} A / {pack.continuousA} A</td></tr>
                <tr><td>Peak charge / discharge</td><td>{pack.maxA} A / {pack.maxA} A</td></tr>
                <tr><td>Charging temperature</td><td>{cell.chargeTempC[0]} °C to +{cell.chargeTempC[1]} °C</td></tr>
                <tr><td>Discharging temperature</td><td>{cell.dischargeTempC[0]} °C to +{cell.dischargeTempC[1]} °C</td></tr>
                <tr><td>Cycle life</td><td>≥ {num(cell.cycleLife)} cycles to {Math.round(cell.cycleLifeRetention * 100)}% at {Math.round(cell.cycleLifeDod * 100)}% DoD, 25 °C</td></tr>
                <tr><td>Protections</td><td>Over-charge, over-discharge, short circuit, over- and under-temperature</td></tr>
              </tbody>
            </table>
          </div>
        </Section>

        <Section n={3} title="Compliance and Certification">
          <table className="offer-table">
            <thead><tr><th style={{ width: '26%' }}>Level</th><th>Applicable standards</th></tr></thead>
            <tbody>
              <tr><td>Cell</td><td>{cell.certifications.join('; ')}</td></tr>
              <tr><td>Module</td><td>{pack.certifications.join('; ')}</td></tr>
              <tr><td>Battery energy storage system</td><td>{enc.certifications.join('; ')}</td></tr>
              <tr><td>Enclosure and EMC</td><td>IEC 62933; IEC 62477-1; IEC 61000-6-2 / 61000-6-4</td></tr>
            </tbody>
          </table>
          <p style={{ fontSize: '7.2pt', color: 'var(--o-slate)' }}>
            Certificates applicable to the supplied configuration are furnished with dispatch documentation. Where a
            certification is in process at the date of order, its status is confirmed in writing in the order acknowledgement.
          </p>
        </Section>

        <Section n={4} title="Electrical Architecture and Interfaces">
          <table className="offer-table">
            <thead><tr><th style={{ width: '18%' }}>Interface</th><th>{b.displayName} scope</th><th>Customer / integrator scope</th></tr></thead>
            <tbody>{content.interfaces.map(i => <tr key={i.name}><td>{i.name}</td><td>{i.supplier}</td><td>{i.customer}</td></tr>)}</tbody>
          </table>
        </Section>

        <h4 className="eyebrow">Approved makes and support</h4>
        <table className="offer-table">
          <thead><tr><th style={{ width: '20%' }}>Item</th><th style={{ width: '38%' }}>Make / brand</th><th>Remarks</th></tr></thead>
          <tbody>{content.approvedMakes.map(m => (
            <tr key={m.item}><td>{m.item}</td>
              <td>{m.make === 'jouleWise' ? <img src={brand.wordmark} alt={brand.vendor} style={{ height: '3.2mm' }} /> : m.make}</td>
              <td>{m.remark}</td></tr>
          ))}</tbody>
        </table>
      </Page>

      {/* ---------------------------------------------------------------- energy */}
      <Page n={3} org={org} content={content} title="Technical & Commercial Proposal">
        <Section n={5} title={`Year-Wise Energy Performance — ${sizing.input.projectYears} Years`}
          note={`Modelled at plant level for ${sizing.units} enclosures at the AC delivery point. A duty of ${num(sizing.input.cyclesPerDay * sizing.input.daysPerYear)} cycles a year at ${num(L.availabilityFactor * sizing.input.availability * 100, 1)}% combined availability gives the annual cycles below; each column multiplies into the next.`}>
          <div className="chip-row">
            {[
              ['DC round-trip efficiency', `${(L.chargeEfficiencyDc * L.dischargeEfficiencyDc * 100).toFixed(1)}%`],
              ['DC cable losses', `${(L.dcCableLoss * 100).toFixed(2)}%`],
              ['PCS losses', `${(L.pcsLoss * 100).toFixed(2)}%`],
              ['AC cable losses', `${(L.acCableLoss * 100).toFixed(2)}%`],
              ['Inverter duty transformer', `${(L.idtLoss * 100).toFixed(2)}%`],
              ['Auxiliaries, each way', `${(enc.auxMWhPerDayCharge * L.auxScale).toFixed(2)} MWh/day`],
            ].map(([k, v]) => <div className="chip" key={k} style={{ borderLeftColor: b.accent }}><span>{k}</span><b>{v}</b></div>)}
          </div>

          <table className="offer-table">
            <thead><tr>
              <th>Year</th><th className="num">Annual cycles</th><th className="num">Capacity retention</th>
              <th className="num">Max DC energy stored (MWh)</th><th className="num">AC energy dispatched per cycle (MWh)</th>
              <th className="num">Energy supplied to customer (GWh/yr)</th><th className="num">Charging energy required (GWh/yr)</th>
            </tr></thead>
            <tbody>{rows.map(r => (
              <tr key={r.year}>
                <td>{r.year === 0 ? 'At commissioning' : r.year}</td>
                <td className="num">{r.cycles ? num(r.cycles) : '—'}</td>
                <td className="num">{Math.round(r.retention * 100)}%</td>
                {/* A decimal place: at whole megawatt-hours a fleet that fades a percent a year
                    and steps up at each augmentation reads as a column of numbers going up and
                    down at random. */}
                <td className="num">{num(r.storedMWh, 1)}</td>
                <td className="num">{r.year === 0 ? '—' : num(r.usablePerCycleMWh, 1)}</td>
                <td className="num">{r.year === 0 ? '—' : num(r.suppliedGWh, 1)}</td>
                <td className="num">{r.year === 0 ? '—' : num(r.chargingGWh, 1)}</td>
              </tr>
            ))}
              <tr className="total">
                <td>{sizing.input.projectYears}-year total</td><td className="num">{num(totals.cycles)}</td>
                <td className="num">—</td><td className="num">—</td><td className="num">—</td>
                <td className="num">{num(totals.suppliedGWh)}</td><td className="num">{num(totals.chargingGWh)}</td>
              </tr>
            </tbody>
          </table>

          <EnergyChart rows={rows} accent={b.accent} navy={b.primary} />
          {truncated > 0 && <p style={{ fontSize: '6.4pt', color: 'var(--o-muted)', marginTop: '1mm' }}>
            The table shows the first 20 years; the totals cover all {sizing.input.projectYears} years of the study.
          </p>}
        </Section>

        <h4 className="eyebrow" style={{ marginTop: '4mm' }}>Basis and qualifications</h4>
        <div className="qual"><ul>{content.qualifications.map(q => <li key={q}>{q}</li>)}</ul></div>

        <Section n={6} title="Quality Assurance and Documentation">
          <table className="offer-table">
            <thead><tr><th style={{ width: '18%' }}>Stage</th><th>Control</th><th style={{ width: '24%' }}>Deliverable</th></tr></thead>
            <tbody>{content.qaStages.map(s => <tr key={s.stage}><td>{s.stage}</td><td>{s.control}</td><td>{s.deliverable}</td></tr>)}</tbody>
          </table>
          <p style={{ fontFamily: 'var(--o-serif)', fontStyle: 'italic', fontSize: '7.2pt', color: 'var(--o-slate)' }}>
            A joint inspection and test plan is agreed within 30 days of order. Customer or third-party witness inspection at
            the works is arranged on written request at the order stage.
          </p>
        </Section>
      </Page>

      {/* ------------------------------------------------------------ commercial */}
      <Page n={4} org={org} content={content} title="Technical & Commercial Proposal">
        <Section n={7} title="Price Build-Up and Order Value"
          note={landed ? `Landed cost per enclosure and the total order value. ${content.priceBasis}.` : `Price build-up and the total order value. ${content.priceBasis}.`}>
          <div className="two-col" style={{ gridTemplateColumns: '1.15fr 1fr' }}>
            {landed ? (
              <table className="offer-table">
                <thead><tr><th>Particulars</th><th>Basis</th><th className="num">USD</th><th className="num">{local}</th></tr></thead>
                <tbody>
                  <tr><td>Container size</td><td>per enclosure</td><td className="num">—</td><td className="num">{num(landed.kWh)} kWh</td></tr>
                  <tr><td>Basic price</td><td>USD {num(landed.fobUsd / landed.kWh, 2)} / kWh</td><td className="num">{num(landed.fobUsd / landed.kWh, 2)}</td><td className="num">—</td></tr>
                  <tr><td>FOB price</td><td>{num(landed.kWh)} × {num(landed.fobUsd / landed.kWh, 2)}</td><td className="num">{num(landed.fobUsd)}</td><td className="num">—</td></tr>
                  <tr><td>Ocean freight</td><td /><td className="num">{num(landed.oceanFreightUsd)}</td><td className="num">—</td></tr>
                  <tr><td>Total CIF price</td><td /><td className="num">{num(landed.cifUsd)}</td><td className="num">—</td></tr>
                  <tr><td>Exchange rate</td><td>USD / {local}</td><td className="num">—</td><td className="num">{num(rate, 2)}</td></tr>
                  <tr><td>CIF price in {local}</td><td /><td className="num">—</td><td className="num">{num(fromInr(landed.cifInr))}</td></tr>
                  <tr><td>Customs duty</td><td>{num(landed.customsDutyInr / landed.cifInr * 100, 1)}% of CIF</td><td className="num">—</td><td className="num">{num(fromInr(landed.customsDutyInr))}</td></tr>
                  <tr><td>Inland freight and clearance</td><td>{num(landed.inlandClearanceInr / landed.cifInr * 100, 1)}% of CIF</td><td className="num">—</td><td className="num">{num(fromInr(landed.inlandClearanceInr))}</td></tr>
                  <tr className="subtotal"><td>Delivered price — BESS enclosure</td><td /><td className="num">—</td><td className="num">{num(fromInr(landed.deliveredInr))}</td></tr>
                  <tr><td>Power conversion system</td><td>per enclosure</td><td className="num">—</td><td className="num">{num(fromInr(landed.pcsInr))}</td></tr>
                  <tr className="total"><td>Total delivered price per enclosure</td><td /><td className="num">—</td><td className="num">{num(fromInr(landed.totalInr))}</td></tr>
                  <tr className="subtotal"><td>Equivalent rate</td><td>per kWh</td><td className="num">—</td><td className="num">{num(fromInr(landed.totalInrPerKWh))}</td></tr>
                </tbody>
              </table>
            ) : (
              <table className="offer-table">
                <thead><tr><th>Item</th><th className="num">Quantity</th><th>Unit</th><th className="num">Amount</th></tr></thead>
                <tbody>{quote.lines.filter(l => !l.optional).map(l => (
                  <tr key={l.id}><td>{l.label}</td><td className="num">{num(l.quantity, 1)}</td><td>{l.unit}</td><td className="num">{money(l.total)}</td></tr>
                ))}
                  <tr className="total"><td colSpan={3}>Total</td><td className="num">{money(quote.total)}</td></tr>
                </tbody>
              </table>
            )}

            <div>
              <table className="offer-table">
                <thead><tr><th>Order value — {sizing.units} enclosures / {num(sizing.installedDcMWh, 1)} MWh</th><th className="num">{local}</th></tr></thead>
                <tbody>
                  {landed && <tr><td>BESS enclosures ({sizing.units} × {num(perEnclosure)})</td><td className="num">{num(enclosuresTotal)}</td></tr>}
                  {landed && <tr><td>Power conversion systems ({sizing.units} × {num(perPcs)})</td><td className="num">{num(pcsTotal)}</td></tr>}
                  {!landed && quote.lines.filter(l => !l.optional).map(l => <tr key={l.id}><td>{l.label}</td><td className="num">{num(l.total)}</td></tr>)}
                  {landed && Math.abs(quote.subtotal - enclosuresTotal - pcsTotal) > 1 && (
                    <tr><td>Other supply and services</td><td className="num">{num(quote.subtotal - enclosuresTotal - pcsTotal)}</td></tr>
                  )}
                  <tr className="subtotal"><td>Subtotal</td><td className="num">{num(quote.subtotal)}</td></tr>
                  {quote.discountPct > 0 && <tr><td>Discount ({quote.discountPct}%)</td><td className="num">−{num(quote.discount)}</td></tr>}
                  {quote.freight > 0 && <tr><td>Freight and insurance</td><td className="num">{num(quote.freight)}</td></tr>}
                  {quote.taxPct > 0 && <tr><td>Tax ({quote.taxPct}%)</td><td className="num">{num(quote.tax)}</td></tr>}
                  <tr className="total"><td>Total order value</td><td className="num">{num(quote.total)}</td></tr>
                  <tr><td>In words</td><td className="num">{formatMoney(quote.total, local, true)}</td></tr>
                  <tr><td>Rate per kWh delivered</td><td className="num">{money(quote.total / (sizing.installedDcMWh * 1000))} / kWh</td></tr>
                  {landed && <tr><td>Rate per kWh — BESS only</td><td className="num">{formatMoney(fromInr(landed.deliveredInr) / landed.kWh, local)} / kWh</td></tr>}
                </tbody>
              </table>

              <div className="basis-card" style={{ borderLeftColor: b.accent }}>
                <h5 className="block">Commercial basis</h5>
                <div className="kv">
                  <span>Offer date</span><b>{date(quote.createdAt)}</b>
                  <span>Price basis</span><b>{content.priceBasis}</b>
                  <span>Delivery</span><b>{content.deliveryPeriod}</b>
                  <span>Payment</span><b>{quote.paymentTerms}</b>
                  <span>Warranty</span><b>{quote.warrantyYears} years from date of delivery</b>
                  <span>Validity</span><b>{content.validityDays} days · to {date(quote.validUntil)}</b>
                </div>
              </div>
            </div>
          </div>
        </Section>

        <Section n={8} title="Scope, Delivery and Payment">
          <div className="two-col">
            <div>
              <h5 className="block">Scope included</h5>
              <p className="prose">{quote.scopeIncluded.join('; ')}.</p>
              <h5 className="block">Scope excluded</h5>
              <p className="prose">{quote.scopeExcluded.join('; ')}. Each is available as a priced add-on.</p>
            </div>
            <div>
              <h5 className="block">Delivery</h5>
              <p className="prose">{content.deliveryNote}</p>
              <h5 className="block">Payment</h5>
              <p className="prose">{quote.paymentTerms}. {content.paymentNote}</p>
            </div>
          </div>
        </Section>

        <Section n={9} title="Warranty and Commercial Terms">
          <div className="terms-grid">
            {content.terms.map(t => <section key={t.title}><h5 className="block">{t.title}</h5><p>{t.body}</p></section>)}
          </div>
        </Section>

        <h4 className="eyebrow" style={{ marginTop: '4mm' }}>Optional add-ons — priced separately on request</h4>
        <div className="addons">
          {content.addOns.map(a => (
            <div key={a.title} style={{ borderLeftColor: b.accent }}>
              <b>{a.title === 'EMS' ? <><img src={brand.wordmark} alt={brand.vendor} />EMS</> : a.title}</b>
              <span>{a.body}</span>
            </div>
          ))}
        </div>

        {/* Under single-level release the quotation is approved against this document rather than
            in the application, so the document has to carry somewhere to record that. Without this
            block the approval leaves no trace anywhere. */}
        <div className="internal-approval">
          <b>Internal approval</b>
          <span>Prepared by {quote.preparedBy}, {date(quote.createdAt)}.</span>
          <span>Approved by <i /> name, designation, date and signature.</span>
        </div>

        <div className="accept" style={{ borderLeftColor: b.accent }}>
          <h5 className="block">Acceptance</h5>
          <p className="prose" style={{ margin: 0 }}>{content.acceptanceNote}</p>
          <div className="sign">
            <div>For and on behalf of {content.submittedTo} · name, designation, date, seal</div>
            <div>For {b.legalName || b.displayName} · authorised signatory</div>
          </div>
          <p className="close-note">{brand.qualification}</p>
        </div>
      </Page>
    </div>
  );
}
