import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Box, FileText, RotateCcw } from 'lucide-react';
import { Card, Stat, Badge, Empty, Tabs, KV, NumberInput, SelectInput, TextInput, Field, levelTone, pct, date } from '../components/ui';
import { LineChart, BarChart, CompositionBar, series, status } from '../components/viz';
import { useWorkspace, quotesOf } from '../../platform/workspace';
import { useSession } from '../../platform/auth';
import { can, quoteStatuses } from '../../platform/types';
import { applications, application } from '../../sizing/applications';
import { defaultSizingInput, sizeSystem, enclosureSummary, type AugmentationStrategy, type SizingMode } from '../../sizing/engine';
import { evaluateFinance } from '../../sizing/finance';
import { createQuote, nextQuoteNumber } from '../../quoting/quote';
import { enclosures, pcsUnits, transformers } from '../../catalog/products';
import { convert, formatMoney } from '../../catalog/pricing';
import type { ApplicationId } from '../../sizing/applications';

type Tab = 'requirements' | 'design' | 'performance' | 'economics';

export function ProjectDetail() {
  const { projectId = '' } = useParams();
  const navigate = useNavigate();
  const { projects, quotes, priceBook, saveProject, saveQuote } = useWorkspace();
  const { org, user, role } = useSession();
  const [tab, setTab] = useState<Tab>('requirements');
  const project = projects.find(p => p.id === projectId);
  const currency = org?.currency ?? priceBook.currency;
  const money = (usd: number, compact = true) => formatMoney(convert(usd, currency), currency, compact);

  const computed = useMemo(() => {
    if (!project) return null;
    try { const sizing = sizeSystem(project.sizing); return { sizing, finance: evaluateFinance(sizing, priceBook) }; }
    catch (e) { return { error: e instanceof Error ? e.message : 'Sizing failed.' } as const; }
  }, [project, priceBook]);

  if (!project) return <Card><Empty title="Project not found" message="This project may have been deleted." action={<Link className="btn" to="/projects">Back to projects</Link>} /></Card>;
  if (!computed || 'error' in computed) return <Card><Empty title="Sizing could not run" message={('error' in (computed ?? {}) ? computed!.error : '') || 'Check the catalogue selection.'} /></Card>;

  const { sizing, finance } = computed;
  const app = application(project.sizing.applicationId);
  const errors = sizing.warnings.filter(w => w.level === 'error');
  const writable = can(role, 'project.write');
  const set = (patch: Partial<typeof project.sizing>) => void saveProject({ ...project, sizing: { ...project.sizing, ...patch } });

  const issueQuote = async () => {
    const customerName = project.customerName;
    const quote = createQuote({
      orgId: org!.id,
      customer: { id: project.customerId, name: customerName } as never,
      project, sizing, finance, priceBook: { ...priceBook, currency }, currency,
      number: nextQuoteNumber(quotes), preparedBy: user!.displayName, preparedByEmail: user!.email,
    });
    await saveQuote(quote, `Quotation ${quote.number} raised for ${project.name}.`, 'created');
    await saveProject({ ...project, status: 'quoted' });
    navigate(`/quotes/${quote.id}`);
  };

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="row">
        <Link className="btn ghost sm" to={`/customers/${project.customerId}`}><ArrowLeft size={15} /> {project.customerName}</Link>
        <div className="spacer" />
        <Link className="btn" to={`/studio?project=${project.id}`}><Box size={15} /> Open 3D studio</Link>
        {can(role, 'quote.write') && <button className="btn accent" onClick={() => void issueQuote()}><FileText size={15} /> Create quotation</button>}
      </div>

      <div className="grid cols-4">
        <Stat label="Rated power" value={sizing.ratedPowerMW.toFixed(2)} unit="MW" foot={`${sizing.pcsCount} × ${sizing.pcs.model}`} />
        <Stat label="Contracted usable" value={sizing.requiredUsableMWh.toFixed(1)} unit="MWh" foot={`${sizing.effectiveDurationH.toFixed(2)} h duration`} />
        <Stat label="Installed DC" value={sizing.installedDcMWh.toFixed(2)} unit="MWh" foot={`${sizing.units} × ${sizing.enclosure.model}${sizing.augmentations.length ? ` + ${sizing.totalUnits - sizing.units} augmentation` : ''}`} />
        <Stat label="Turnkey price" value={money(finance.capexUsd)} foot={`${money(finance.capexPerKWhUsd, false)} per kWh DC`} />
      </div>

      {errors.length > 0 && (
        <div className="notice error"><b>{errors.length} design check{errors.length > 1 ? 's' : ''} failed</b><p>{errors[0].text}</p></div>
      )}

      <Tabs<Tab> active={tab} onChange={setTab} tabs={[
        { id: 'requirements', label: 'Requirements' }, { id: 'design', label: 'Design' },
        { id: 'performance', label: 'Performance & ageing' }, { id: 'economics', label: 'Economics' },
      ]} />

      {tab === 'requirements' && (
        <div className="grid cols-3">
          <Card title="Application" subtitle="The duty cycle drives ageing, augmentation and revenue">
            <SelectInput label="Application" value={project.sizing.applicationId} options={applications.map(a => ({ value: a.id, label: a.name }))}
              onChange={id => { const preset = defaultSizingInput(id as ApplicationId); set({ applicationId: id as ApplicationId, durationH: preset.durationH, cyclesPerDay: preset.cyclesPerDay, daysPerYear: preset.daysPerYear, dod: preset.dod, availability: preset.availability, augmentation: preset.augmentation }); }} />
            <p className="muted">{app.summary}</p>
            <div style={{ marginTop: 12 }}>
              <h4 style={{ fontSize: 12, marginBottom: 6 }}>Commercial risks to raise</h4>
              {app.keyRisks.map(r => <div key={r} className="muted" style={{ fontSize: 12.2, padding: '3px 0' }}>· {r}</div>)}
            </div>
            <button className="btn sm" style={{ marginTop: 14 }} disabled={!writable}
              onClick={() => set(defaultSizingInput(project.sizing.applicationId))}><RotateCcw size={13} /> Reset to preset</button>
          </Card>

          <Card title="Duty and sizing basis">
            <SelectInput label="Sizing mode" value={project.sizing.mode} options={[{ value: 'power-duration', label: 'Power × duration' }, { value: 'usable-energy', label: 'Usable energy target' }]}
              onChange={mode => set({ mode: mode as SizingMode })} />
            {project.sizing.mode === 'power-duration'
              ? <><NumberInput label="Rated power" value={project.sizing.powerMW} unit="MW" min={0.05} max={1000} step={0.05} onChange={powerMW => set({ powerMW })} />
                  <NumberInput label="Duration at rated power" value={project.sizing.durationH} unit="h" min={0.25} max={24} step={0.25} onChange={durationH => set({ durationH })} /></>
              : <><NumberInput label="Usable energy" value={project.sizing.usableEnergyMWh} unit="MWh" min={0.1} max={5000} step={0.5} onChange={usableEnergyMWh => set({ usableEnergyMWh })} />
                  <NumberInput label="Discharge duration" value={project.sizing.durationH} unit="h" min={0.25} max={24} step={0.25} onChange={durationH => set({ durationH })} /></>}
            <NumberInput label="Cycles per day" value={project.sizing.cyclesPerDay} unit="/day" min={0.01} max={20} step={0.05} onChange={cyclesPerDay => set({ cyclesPerDay })} />
            <NumberInput label="Operating days per year" value={project.sizing.daysPerYear} unit="days" min={1} max={366} onChange={daysPerYear => set({ daysPerYear })} />
            <NumberInput label="Depth of discharge" value={Math.round(project.sizing.dod * 100)} unit="%" min={20} max={100} onChange={n => set({ dod: n / 100 })} />
            <NumberInput label="Availability" value={Math.round(project.sizing.availability * 100)} unit="%" min={50} max={100} onChange={n => set({ availability: n / 100 })}
              hint="Time-based availability. Applied to throughput and revenue, not to the energy in a single discharge." />
          </Card>

          <Card title="Site, grid and equipment">
            <TextInput label="Site location" value={project.site.location} onChange={location => void saveProject({ ...project, site: { ...project.site, location } })} />
            <div className="grid cols-2" style={{ gap: 0, columnGap: 12 }}>
              <NumberInput label="Design ambient" value={project.sizing.ambientC} unit="°C" min={-40} max={60} onChange={ambientC => set({ ambientC })} />
              <NumberInput label="Altitude" value={project.sizing.altitudeM} unit="m" min={0} max={5000} step={10} onChange={altitudeM => set({ altitudeM })} />
            </div>
            <SelectInput label="Enclosure" value={project.sizing.enclosureId} options={enclosures.map(e => ({ value: e.id, label: `${e.model} · ${(enclosureSummary(e).energyKWh / 1000).toFixed(2)} MWh ${e.family}` }))} onChange={enclosureId => set({ enclosureId })} />
            <SelectInput label="Power conversion" value={project.sizing.pcsId} options={pcsUnits.map(p => ({ value: p.id, label: `${p.model} · ${p.ratedKW} kW ${p.topology}` }))} onChange={pcsId => set({ pcsId })} />
            <SelectInput label="Step-up transformer" value={project.sizing.transformerId ?? ''} options={[{ value: '', label: 'None — connect at LV' }, ...transformers.map(t => ({ value: t.id, label: `${t.model} · ${t.ratedKVA} kVA ${t.lvKV}/${t.hvKV} kV` }))]} onChange={id => set({ transformerId: id || null })} />
            <div className="grid cols-2" style={{ gap: 0, columnGap: 12 }}>
              <NumberInput label="Grid voltage" value={project.sizing.gridKV} unit="kV" min={0.4} max={400} step={0.1} onChange={gridKV => set({ gridKV })} />
              <NumberInput label="Project life" value={project.sizing.projectYears} unit="yr" min={1} max={30} onChange={projectYears => set({ projectYears })} />
            </div>
            <SelectInput label="Capacity maintenance strategy" value={project.sizing.augmentation}
              options={[{ value: 'oversize-day1', label: 'Oversize on day one' }, { value: 'periodic', label: 'Augment when capacity falls short' }, { value: 'none', label: 'No maintenance — accept decline' }]}
              onChange={augmentation => set({ augmentation: augmentation as AugmentationStrategy })} />
          </Card>
        </div>
      )}

      {tab === 'design' && (
        <div className="grid cols-3">
          <div style={{ gridColumn: 'span 2' }} className="grid">
            <Card title="Configuration" subtitle={`${sizing.enclosure.model} · ${sizing.enclosure.cooling} cooled · ${sizing.enclosure.ipRating}`}>
              <div className="grid cols-2" style={{ gap: 0, columnGap: 26 }}>
                <div>
                  <KV label="Enclosures day one">{sizing.units}</KV>
                  <KV label="Battery racks">{sizing.racks.toLocaleString()}</KV>
                  <KV label="Battery packs">{sizing.packs.toLocaleString()}</KV>
                  <KV label="Cells">{sizing.cells.toLocaleString()}</KV>
                  <KV label="DC voltage window">{sizing.dcVoltageWindow[0]}–{sizing.dcVoltageWindow[1]} V</KV>
                  <KV label="System C-rate">{sizing.systemCRate.toFixed(3)} C</KV>
                </div>
                <div>
                  <KV label="Footprint">{sizing.footprintM2.toFixed(1)} m²</KV>
                  <KV label="Mass">{sizing.massTonnes.toFixed(1)} t</KV>
                  <KV label="PCS">{sizing.pcsCount} × {sizing.pcs.ratedKW} kW ({sizing.pcsTotalMW.toFixed(2)} MW)</KV>
                  <KV label="Transformer">{sizing.transformer ? `${sizing.transformerCount} × ${sizing.transformer.ratedKVA} kVA` : 'Not included'}</KV>
                  <KV label="Auxiliary load (peak)">{sizing.auxKW.toFixed(0)} kW</KV>
                  <KV label="Round trip at AC">{pct(sizing.rteAc)}</KV>
                </div>
              </div>
            </Card>

            <Card title="Design checks" subtitle="Geometry, thermal and electrical compatibility">
              {sizing.warnings.map(w => (
                <div key={w.code} className={`notice ${w.level}`}><b>{w.code.replace(/-/g, ' ')}</b><p>{w.text}</p></div>
              ))}
            </Card>
          </div>

          <div className="grid" style={{ alignContent: 'start' }}>
            <Card title="Bill of materials" subtitle="Day-one supply and services">
              <table className="data" style={{ fontSize: 12.5 }}>
                <tbody>{finance.lines.map(l => (
                  <tr key={l.id}><td><b>{l.label}</b><div className="muted" style={{ fontSize: 11 }}>{l.quantity.toLocaleString(undefined, { maximumFractionDigits: 1 })} {l.unit}{l.note ? ` · ${l.note}` : ''}</div></td>
                    <td className="num">{money(l.totalUsd)}</td></tr>
                ))}</tbody>
              </table>
            </Card>
            <Card title="Cost structure">
              <CompositionBar format={n => money(n)} parts={[
                { label: 'Equipment', value: finance.equipmentUsd, color: series[0] },
                { label: 'Balance of plant', value: finance.bopUsd, color: series[1] },
                { label: 'Services', value: finance.servicesUsd, color: series[2] },
                { label: 'Contingency & margin', value: finance.contingencyUsd + finance.marginUsd, color: series[3] },
              ]} />
            </Card>
          </div>
        </div>
      )}

      {tab === 'performance' && (
        <div className="grid">
          <div className="grid cols-4">
            <Stat label="Retention at year 1" value={pct(sizing.years[1]?.retention ?? 1)} foot={`${sizing.efcPerYear.toFixed(0)} equivalent full cycles per year`} />
            <Stat label={`Retention at year ${project.sizing.projectYears}`} value={pct(sizing.endOfLifeRetention)} foot={`Cell temperature ${sizing.cellTempC.toFixed(1)} °C, ageing factor ${sizing.tempFactor.toFixed(2)}×`} />
            <Stat label="Augmentation events" value={String(sizing.augmentations.length)} foot={sizing.augmentations.length ? `Years ${sizing.augmentations.map(a => a.year).join(', ')}` : 'None required'} />
            <Stat label="Lifetime throughput" value={Math.round(sizing.lifetimeThroughputMWh).toLocaleString()} unit="MWh" foot={`Warranty basis ${Math.round(sizing.warrantyThroughputMWh).toLocaleString()} MWh`} />
          </div>

          <Card title="Usable energy over the project life" subtitle="Cohort ageing: augmented capacity ages from its own installation year">
            <LineChart xLabel="Year" format={n => `${n.toFixed(0)} MWh`} rule={{ y: sizing.requiredUsableMWh, label: 'Contracted usable energy' }}
              data={[
                { name: 'Usable energy delivered', color: series[0], points: sizing.years.map(y => ({ x: y.year, y: y.usableMWh })) },
                { name: 'Installed DC nameplate', color: series[1], points: sizing.years.map(y => ({ x: y.year, y: y.installedDcMWh })), dashed: true },
              ]} />
          </Card>

          <div className="grid cols-2">
            <Card title="Capacity retention" subtitle="Fleet-weighted, calendar plus cycle fade at the modelled cell temperature">
              <LineChart xLabel="Year" width={460} yMin={0.5} format={n => `${(n * 100).toFixed(0)}%`}
                data={[{ name: 'Retention', color: series[2], points: sizing.years.map(y => ({ x: y.year, y: y.retention })) }]} />
              <p className="muted" style={{ marginTop: 4, fontSize: 11.5 }}>Axis starts at 50% retention.</p>
              <p className="muted" style={{ marginTop: 10 }}>
                Calendar fade follows a square-root-of-time law and cycle fade is linear in equivalent full cycles, both anchored on the
                catalogue warranty points and scaled by an Arrhenius-style thermal factor. Supplier warranty curves govern the contract.
              </p>
            </Card>
            <Card title="Annual energy discharged" subtitle="Throughput at the contracted duty cycle and availability">
              <BarChart width={460} format={n => `${(n / 1000).toFixed(1)} GWh`} colorFor={(b) => (sizing.augmentations.some(a => String(a.year) === b.label) ? status.warning : series[0])}
                bars={sizing.years.filter(y => y.year > 0).map(y => ({ label: String(y.year), value: y.throughputMWh, note: y.augmentedMWh ? `Augmented +${y.augmentedMWh.toFixed(2)} MWh` : undefined }))} />
              {sizing.augmentations.length > 0 && <p className="muted" style={{ marginTop: 8 }}>Highlighted years carry an augmentation delivery.</p>}
            </Card>
          </div>
        </div>
      )}

      {tab === 'economics' && (
        <div className="grid">
          <div className="grid cols-4">
            <Stat label="Levelised cost of storage" value={money(finance.lcosPerMWhUsd, false)} unit="/MWh" foot="Discounted lifetime cost per MWh discharged" />
            <Stat label="Net present value" value={money(finance.npvUsd)} foot={`At ${priceBook.discountRatePct}% discount rate`} />
            <Stat label="Internal rate of return" value={finance.irrPct === null ? 'n/a' : `${finance.irrPct.toFixed(1)}%`} foot={finance.paybackYears ? `Payback in ${finance.paybackYears.toFixed(1)} years` : 'No payback within the project life'} />
            <Stat label="Annual gross benefit" value={money(finance.annualBenefitUsd)} foot={`${app.revenueModel.replace(/-/g, ' ')} basis`} />
          </div>

          <div className="grid cols-2">
            <Card title="Cumulative cash position" subtitle="Nominal, after capital, operating and charging cost">
              <LineChart xLabel="Year" width={460} format={n => money(n)}
                data={[{ name: 'Cumulative cash', color: series[1], points: finance.rows.map(r => ({ x: r.year, y: r.cumulativeUsd })) }]}
                rule={{ y: 0, label: 'Break even' }} />
            </Card>
            <Card title="Annual net cash flow" subtitle="Benefit less operating, charging and augmentation cost">
              <BarChart width={460} format={n => money(n)} colorFor={b => (b.value >= 0 ? series[1] : status.serious)}
                bars={finance.rows.filter(r => r.year > 0).map(r => ({ label: String(r.year), value: r.netUsd, note: r.capexUsd ? `Augmentation ${money(r.capexUsd)}` : undefined }))} />
            </Card>
          </div>

          <Card title="Cash flow detail" tight>
            <table className="data">
              <thead><tr><th className="num">Year</th><th className="num">Capital</th><th className="num">Operating</th><th className="num">Charging</th><th className="num">Benefit</th><th className="num">Net</th><th className="num">Cumulative</th><th className="num">Discharged</th></tr></thead>
              <tbody>{finance.rows.map(r => (
                <tr key={r.year}><td className="num"><b>{r.year}</b></td><td className="num">{r.capexUsd ? money(r.capexUsd) : '—'}</td>
                  <td className="num">{r.opexUsd ? money(r.opexUsd) : '—'}</td><td className="num">{r.chargingUsd ? money(r.chargingUsd) : '—'}</td>
                  <td className="num">{r.benefitUsd ? money(r.benefitUsd) : '—'}</td>
                  <td className="num" style={{ color: r.netUsd >= 0 ? status.good : status.serious, fontWeight: 600 }}>{money(r.netUsd)}</td>
                  <td className="num">{money(r.cumulativeUsd)}</td><td className="num">{r.dischargedMWh ? `${Math.round(r.dischargedMWh).toLocaleString()} MWh` : '—'}</td></tr>
              ))}</tbody>
            </table>
          </Card>
        </div>
      )}

      <Card title="Quotations for this project" tight>
        {quotesOf(quotes, 'projectId', project.id).length ? (
          <table className="data">
            <thead><tr><th>Number</th><th>Status</th><th>Prepared by</th><th>Valid until</th><th className="num">Value</th></tr></thead>
            <tbody>{quotesOf(quotes, 'projectId', project.id).map(q => (
              <tr key={q.id}><td><Link to={`/quotes/${q.id}`}><b>{q.number}</b> r{q.version}</Link></td>
                <td><Badge tone={q.status === 'won' ? 'good' : q.status === 'lost' ? 'bad' : 'info'}>{quoteStatuses.includes(q.status) ? q.status : 'draft'}</Badge></td>
                <td className="muted">{q.preparedBy}</td><td className="muted">{date(q.validUntil)}</td>
                <td className="num">{formatMoney(q.total, q.currency, true)}</td></tr>
            ))}</tbody>
          </table>
        ) : <p className="muted" style={{ padding: 14 }}>No quotation raised yet.</p>}
      </Card>

      <Field label="Project notes"><textarea rows={3} value={project.notes} disabled={!writable} onChange={e => void saveProject({ ...project, notes: e.target.value })} /></Field>
    </div>
  );
}
