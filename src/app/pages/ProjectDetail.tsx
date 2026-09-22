'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { ArrowLeft, Box, FileText, RotateCcw, Trash2 } from 'lucide-react';
import { Card, Stat, Badge, Empty, Tabs, KV, NumberInput, SelectInput, TextInput, TextArea, Field, Slider, pct, date } from '../components/ui';
import { LineChart, BarChart, CompositionBar, series, status } from '../components/viz';
import { quotesLeftBehind, reassign, HOLDING_ACCOUNT } from '../../platform/projects';
import { useWorkspace, quotesOf } from '../../platform/workspace';
import { useSession } from '../../platform/auth';
import { can, quoteStatuses, isCustomerRole } from '../../platform/types';
import { applications, application } from '../../sizing/applications';
import {
  defaultSizingInput, sizeSystem, normaliseSizingInput, enclosureSummary, defaultLossChain, defaultDegradation,
  suppliedRetention, retentionAt, cellTemperature, temperatureFactor,
  type AugmentationStrategy, type SizingMode, type DegradationMode, type LossChain, type SizingResult,
} from '../../sizing/engine';
import { evaluateFinance } from '../../sizing/finance';
import { createQuote, nextQuoteNumber } from '../../quoting/quote';
import { enclosures, pcsUnits, transformers, cellOf, packOf } from '../../catalog/products';
import { convert, formatMoney } from '../../catalog/pricing';
import type { ApplicationId } from '../../sizing/applications';

type Tab = 'requirements' | 'losses' | 'design' | 'performance' | 'economics';

/**
 * What the design ambient actually reaches, and whether it reaches the sizing at all.
 *
 * The supplied degradation schedule is a fixed 20-year table, so under it the temperature changes
 * nothing about the fleet — which makes the slider look broken to anyone who moves it and watches
 * the numbers stay still. It reaches the sizing only under the ageing model.
 */
function ambientHint(sizing: SizingResult, mode: DegradationMode): string {
  const cell = `Liquid-cooled, the cells sit near ${sizing.cellTempC.toFixed(0)} °C at this ambient`;
  const air = `Air-cooled, the cells sit near ${sizing.cellTempC.toFixed(0)} °C at this ambient`;
  const where = sizing.enclosure.cooling === 'liquid' ? cell : air;
  return mode === 'model'
    ? `${where}, ageing ${sizing.tempFactor.toFixed(2)}× the reference rate at 25 °C.`
    : `${where}. The supplied schedule is a fixed table, so this does not move the fleet — set Degradation basis to “derived from duty cycle and temperature”, under Losses & degradation.`;
}

export function ProjectDetail({ id: projectId }: { id: string }) {
  const router = useRouter();
  const { customers, projects, quotes, priceBook, saveProject, saveQuote, removeRecord } = useWorkspace();
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

  if (!project) return <Card><Empty title="Project not found" message="This project may have been deleted." action={<Link className="btn" href="/app/projects">Back to projects</Link>} /></Card>;
  if (!computed || 'error' in computed) return <Card><Empty title="Sizing could not run" message={('error' in (computed ?? {}) ? computed!.error : '') || 'Check the catalogue selection.'} /></Card>;

  const { sizing, finance } = computed;
  const app = application(project.sizing.applicationId);
  const errors = sizing.warnings.filter(w => w.level === 'error');
  const writable = can(role, 'project.write');
  const set = (patch: Partial<typeof project.sizing>) => void saveProject({ ...project, sizing: { ...normaliseSizingInput(project.sizing), ...patch } });
  const setLoss = (patch: Partial<LossChain>) => set({ losses: { ...project.sizing.losses, ...patch } });
  const setRetention = (year: number, value: number) => {
    const retention = [...normaliseSizingInput(project.sizing).degradation.retention];
    retention[year] = value;
    set({ degradation: { ...project.sizing.degradation, retention } });
  };

  const issueQuote = async () => {
    const customerName = project.customerName;
    const quote = createQuote({
      orgId: org!.id,
      customer: { id: project.customerId, name: customerName } as never,
      project, sizing, finance, priceBook: { ...priceBook, currency }, currency,
      number: nextQuoteNumber(quotes), preparedBy: user!.displayName, preparedByEmail: user!.email,
      // A customer pricing their own design gets an indicative quotation; only sales raises a formal one.
      kind: isCustomerRole(role) ? 'indicative' : 'formal', ownerUid: user!.uid,
    });
    await saveQuote(quote, `Quotation ${quote.number} raised for ${project.name}.`, 'created');
    await saveProject({ ...project, status: 'quoted' });
    router.push(`/app/quotes?id=${quote.id}`);
  };

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="row">
        <Link className="btn ghost sm" href={`/app/customers?id=${project.customerId}`}><ArrowLeft size={15} /> {project.customerName}</Link>
        {/* The opening question parks every anonymous design on one holding account, so without a
            way to move a project the second one raised there is stuck with the first one's name. */}
        {can(role, 'project.write') && customers.length > 1 && (
          <select aria-label="Move to customer" value={project.customerId} title="Move this project to another customer"
            onChange={async e => {
              const to = customers.find(c => c.id === e.target.value);
              if (!to || !user) return;
              const left = quotesLeftBehind(quotes, project.id);
              if (left && !window.confirm(`Move this project to ${to.name}?\n\n${left} quotation${left === 1 ? '' : 's'} already raised will keep the customer recorded on them, because an issued offer must not change when a record is tidied up.`)) return;
              await saveProject(reassign(project, to, { displayName: user.displayName }), `${project.name} moved to ${to.name}.`);
            }}
            style={{ padding: '6px 10px', border: '1px solid var(--line)', fontSize: 12.5, maxWidth: 220 }}>
            {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
        <div className="spacer" />
        <Link className="btn" href={`/app/studio?project=${project.id}`}><Box size={15} /> Open 3D studio</Link>
        {can(role, 'quote.write') && <button className="btn accent" onClick={() => void issueQuote()}><FileText size={15} /> Create quotation</button>}
        {can(role, 'project.write') && (
          <button className="btn danger" title="Delete this project"
            onClick={async () => {
              const left = quotesLeftBehind(quotes, project.id);
              const warning = left ? `\n\n${left} quotation${left === 1 ? '' : 's'} raised against it will remain, and will point at a project that no longer exists.` : '';
              if (!window.confirm(`Delete ${project.name}? This cannot be undone.${warning}`)) return;
              await removeRecord('projects', project.id);
              router.push('/app/projects');
            }}><Trash2 size={15} /></button>
        )}
      </div>
      <div className="project-head">
        {can(role, 'project.write')
          ? <input className="project-title" aria-label="Project name" value={project.name}
              placeholder="Name this design"
              onChange={e => void saveProject({ ...project, name: e.target.value })} />
          : <h2 className="project-title">{project.name}</h2>}
        <span className="project-ref">{project.reference}</span>
      </div>
      {project.customerName === HOLDING_ACCOUNT && can(role, 'project.write') && (
        <p className="holding-note">
          This design sits on a holding account, so the quotation would go out addressed to “{HOLDING_ACCOUNT}”.{' '}
          <Link href={`/app/customers?id=${project.customerId}`}>Name the customer</Link> before you issue it.
        </p>
      )}

      <div className="grid cols-4">
        <Stat label="Rated power" value={sizing.ratedPowerMW.toFixed(2)} unit="MW"
          foot={`${sizing.pcsCount} × ${sizing.pcs.model}${sizing.chargePowerMW > sizing.ratedPowerMW * 1.001 ? ` · sized on ${sizing.chargePowerMW.toFixed(1)} MW charging` : ''}`} />
        <Stat label="Contracted usable" value={sizing.requiredUsableMWh.toFixed(1)} unit="MWh" foot={`${sizing.effectiveDurationH.toFixed(2)} h duration`} />
        <Stat label="Installed DC" value={sizing.installedDcMWh.toFixed(2)} unit="MWh" foot={`${sizing.units} × ${sizing.enclosure.model}${sizing.augmentations.length ? ` + ${sizing.totalUnits - sizing.units} augmentation` : ''}`} />
        <Stat label={priceBook.supplyScope === 'turnkey' ? 'Turnkey price' : 'Delivered equipment price'}
          value={money(finance.capexUsd)} foot={`${money(finance.capexPerKWhUsd, false)} per kWh DC`} />
      </div>

      {errors.length > 0 && (
        <div className="notice error"><b>{errors.length} design check{errors.length > 1 ? 's' : ''} failed</b><p>{errors[0].text}</p></div>
      )}

      <Tabs<Tab> active={tab} onChange={setTab} tabs={[
        { id: 'requirements', label: 'Requirements' }, { id: 'losses', label: 'Losses & degradation' },
        { id: 'design', label: 'Design' }, { id: 'performance', label: 'Performance & ageing' },
        { id: 'economics', label: 'Economics' },
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
              ? <><Slider label="Rated power" value={project.sizing.powerMW} min={0.05} max={200} step={0.05} decimals={2} unit="MW" onChange={powerMW => set({ powerMW })} />
                  <Slider label="Duration at rated power" value={project.sizing.durationH} min={0.25} max={12} step={0.25} decimals={2} unit="h" onChange={durationH => set({ durationH })} /></>
              : <><Slider label="Usable energy" value={project.sizing.usableEnergyMWh} min={0.1} max={1000} step={0.1} decimals={1} unit="MWh" onChange={usableEnergyMWh => set({ usableEnergyMWh })} />
                  <Slider label="Discharge duration" value={project.sizing.durationH} min={0.25} max={12} step={0.25} decimals={2} unit="h" onChange={durationH => set({ durationH })} /></>}
            <Slider label="Hours allowed to charge" value={normaliseSizingInput(project.sizing).chargeDurationH} min={0.25} max={24} step={0.25} decimals={2} unit="h"
              onChange={chargeDurationH => set({ chargeDurationH })}
              hint={`Returning the contracted energy in this window asks ${sizing.chargePowerMW.toFixed(2)} MW at ${sizing.chargeCRate.toFixed(2)} C.`} />
            <Slider label="Cycles per day" value={project.sizing.cyclesPerDay} min={0.05} max={12} step={0.05} decimals={2} unit="/day" onChange={cyclesPerDay => set({ cyclesPerDay })} />
            <Slider label="Operating days per year" value={project.sizing.daysPerYear} min={30} max={366} step={1} unit="days" onChange={daysPerYear => set({ daysPerYear })} />
            <Slider label="Depth of discharge" value={project.sizing.dod} scale={100} min={20} max={100} step={1} unit="%" onChange={dod => set({ dod })} />
            <Slider label="Availability" value={project.sizing.availability} scale={100} min={50} max={100} step={0.5} decimals={1} unit="%" onChange={availability => set({ availability })}
              hint="Time-based availability. Applied to throughput and revenue, not to the energy in a single discharge." />
          </Card>

          <Card title="Site, grid and equipment">
            <TextInput label="Site location" value={project.site.location} onChange={location => void saveProject({ ...project, site: { ...project.site, location } })} />
            <Slider label="Design ambient temperature" value={project.sizing.ambientC} min={-20} max={58} step={1} unit="°C" onChange={ambientC => set({ ambientC })}
              hint={ambientHint(sizing, project.sizing.degradation.mode)} />
            <Slider label="Altitude" value={project.sizing.altitudeM} min={0} max={5000} step={10} unit="m" onChange={altitudeM => set({ altitudeM })} />
            <SelectInput label="System" value={project.sizing.enclosureId} options={enclosures.map(e => ({ value: e.id, label: `${e.model} · ${(enclosureSummary(e).energyKWh / 1000).toFixed(3)} MWh / ${e.ratedKW} kW ${e.family}` }))} onChange={enclosureId => set({ enclosureId })} />
            <SelectInput label="Power conversion" value={project.sizing.pcsId} options={pcsUnits.map(p => ({ value: p.id, label: `${p.model} · ${p.ratedKW} kW ${p.topology}` }))} onChange={pcsId => set({ pcsId })} />
            <SelectInput label="Step-up transformer" value={project.sizing.transformerId ?? ''} options={[{ value: '', label: 'None — connect at LV' }, ...transformers.map(t => ({ value: t.id, label: `${t.model} · ${t.ratedKVA} kVA ${t.lvKV}/${t.hvKV} kV` }))]} onChange={id => set({ transformerId: id || null })} />
            <div className="grid cols-2" style={{ gap: 0, columnGap: 12 }}>
              <NumberInput label="Grid voltage" value={project.sizing.gridKV} unit="kV" min={0.4} max={400} step={0.1} onChange={gridKV => set({ gridKV })} />
              <NumberInput label="Power factor" value={project.sizing.powerFactor} unit="pf" min={0.8} max={1} step={0.01} onChange={powerFactor => set({ powerFactor })} />
            </div>
            <Slider label="Project life" value={project.sizing.projectYears} min={1} max={30} step={1} unit="yr" onChange={projectYears => set({ projectYears })} />
            <SelectInput label="Capacity maintenance strategy" value={project.sizing.augmentation}
              options={[{ value: 'oversize-day1', label: 'Oversize on day one' }, { value: 'periodic', label: 'Augment when capacity falls short' }, { value: 'none', label: 'No maintenance — accept decline' }]}
              onChange={augmentation => set({ augmentation: augmentation as AugmentationStrategy })} />
          </Card>
        </div>
      )}

      {tab === 'losses' && (() => {
        const normalised = normaliseSizingInput(project.sizing), L = normalised.losses, deg = normalised.degradation;
        const cell = cellOf(packOf(sizing.enclosure));
        const modelCurve = Array.from({ length: project.sizing.projectYears + 1 }, (_, y) =>
          retentionAt(y, sizing.efcPerYear, cell, temperatureFactor(cellTemperature(project.sizing.ambientC, sizing.enclosure.cooling))));
        return (
          <div className="grid" style={{ gap: 16 }}>
            <div className="grid cols-3">
              <Card title="Efficiency chain" subtitle="Every loss between the grid and the cell, as supplied and editable">
                <Slider label="Usable DC window" value={L.usableDcWindow} scale={100} min={50} max={100} step={0.5} decimals={1} unit="%"
                  onChange={usableDcWindow => setLoss({ usableDcWindow })} hint="Fraction of nameplate energy actually cycled." />
                <Slider label="Charge efficiency, DC side" value={L.chargeEfficiencyDc} scale={100} min={80} max={100} step={0.25} decimals={2} unit="%"
                  onChange={chargeEfficiencyDc => setLoss({ chargeEfficiencyDc })} />
                <Slider label="Discharge efficiency, DC side" value={L.dischargeEfficiencyDc} scale={100} min={80} max={100} step={0.25} decimals={2} unit="%"
                  onChange={dischargeEfficiencyDc => setLoss({ dischargeEfficiencyDc })}
                  hint="Defaults to the square root of the 95% round trip, matching the supplied sizing sheet." />
                <Slider label="DC cable loss" value={L.dcCableLoss} scale={100} min={0} max={3} step={0.05} decimals={2} unit="%" onChange={dcCableLoss => setLoss({ dcCableLoss })} />
                <Slider label="PCS loss" value={L.pcsLoss} scale={100} min={0} max={5} step={0.05} decimals={2} unit="%" onChange={pcsLoss => setLoss({ pcsLoss })} />
                <Slider label="AC cable loss" value={L.acCableLoss} scale={100} min={0} max={3} step={0.05} decimals={2} unit="%" onChange={acCableLoss => setLoss({ acCableLoss })} />
                <Slider label="Transformer loss" value={L.idtLoss} scale={100} min={0} max={4} step={0.05} decimals={2} unit="%" onChange={idtLoss => setLoss({ idtLoss })}
                  hint={sizing.transformer ? `Applied to ${sizing.transformer.model}.` : 'No transformer in scope, so this is not applied.'} />
                <label className="field" style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                  <input type="checkbox" checked={L.idtOnDischarge} disabled={!writable} onChange={e => setLoss({ idtOnDischarge: e.target.checked })} style={{ width: 'auto' }} />
                  <span style={{ margin: 0 }}>Apply transformer loss on discharge as well as charge</span>
                </label>
                <p className="muted" style={{ fontSize: 11.5 }}>The supplied sheet omits it on discharge. Clearing this box reproduces that sheet exactly.</p>
              </Card>

              <Card title="Auxiliaries, wheeling and availability">
                <Slider label="Auxiliary consumption" value={L.auxScale} scale={100} min={0} max={300} step={5} unit="%"
                  onChange={auxScale => setLoss({ auxScale })}
                  hint={`Scales the catalogue figure of ${sizing.enclosure.auxMWhPerDayCharge} MWh/day charging and ${sizing.enclosure.auxMWhPerDayDischarge} MWh/day discharging per unit.`} />
                <Slider label="Open access / wheeling losses" value={L.openAccessLoss} scale={100} min={0} max={30} step={0.1} decimals={2} unit="%"
                  onChange={openAccessLoss => setLoss({ openAccessLoss })}
                  hint="Grosses charging energy up to the generation end when the system charges from a remote plant." />
                <Slider label="Dispatch availability factor" value={L.availabilityFactor} scale={100} min={50} max={100} step={0.5} decimals={1} unit="%"
                  onChange={availabilityFactor => setLoss({ availabilityFactor })}
                  hint="Applied to annual delivered and charged energy, as in the supplied sheet." />
                <div style={{ marginTop: 14 }}>
                  <KV label="Discharge path">{pct(sizing.dischargePathEfficiency, 2)}</KV>
                  <KV label="Charge path">{pct(sizing.chargePathEfficiency, 2)}</KV>
                  <KV label="Round trip at AC">{pct(sizing.rteAc, 2)}</KV>
                  <KV label="Auxiliary energy">{sizing.auxMWhPerDay.toFixed(3)} MWh/day</KV>
                </div>
                <button className="btn sm" style={{ marginTop: 12 }} disabled={!writable} onClick={() => set({ losses: defaultLossChain() })}>
                  <RotateCcw size={13} /> Reset to supplied chain
                </button>
              </Card>

              <Card title="Year one energy balance" subtitle="At the current configuration">
                <KV label="Stored DC energy">{sizing.years[1]?.storedDcMWh.toFixed(3)} MWh</KV>
                <KV label="Usable at AC">{sizing.years[1]?.usableMWh.toFixed(3)} MWh</KV>
                <KV label="Delivered to customer">{Math.round(sizing.years[1]?.deliveredMWh ?? 0).toLocaleString()} MWh/yr</KV>
                <KV label="Charging energy">{Math.round(sizing.years[1]?.chargeMWh ?? 0).toLocaleString()} MWh/yr</KV>
                <KV label="Required at generation end">{Math.round(sizing.years[1]?.gridChargeMWh ?? 0).toLocaleString()} MWh/yr</KV>
                <p className="muted" style={{ marginTop: 12 }}>
                  Delivered energy is the mean of this year's and last year's usable capacity over the annual cycle count,
                  scaled by the dispatch availability factor — the convention used in the supplied sizing model.
                </p>
              </Card>
            </div>

            <Card title="Capacity retention schedule" subtitle="The supplied 20-year degradation curve, editable year by year"
              actions={
                <div className="row" style={{ gap: 6 }}>
                  <button className="btn sm" disabled={!writable} onClick={() => set({ degradation: defaultDegradation() })}>Reset to supplied curve</button>
                  <button className="btn sm" disabled={!writable}
                    onClick={() => set({ degradation: { mode: 'table', retention: modelCurve } })}>Fill from ageing model</button>
                </div>
              }>
              <SelectInput label="Degradation basis" value={deg.mode}
                options={[{ value: 'table', label: 'Year-by-year schedule (supplied)' }, { value: 'model', label: 'Derived from duty cycle and temperature' }]}
                onChange={mode => set({ degradation: { ...deg, mode: mode as DegradationMode } })}
                hint={deg.mode === 'table'
                  ? 'Each year is set explicitly. Augmented capacity is aged from its own installation year against the same schedule.'
                  : `Calendar and cycle fade from the ${cell.model} warranty anchors at ${sizing.cellTempC.toFixed(1)} °C cell temperature and ${sizing.efcPerYear.toFixed(0)} equivalent full cycles per year.`} />

              <div style={{ margin: '14px 0' }}>
                <LineChart xLabel="Year" width={720} yMin={0.5} format={n => `${(n * 100).toFixed(0)}%`}
                  data={[
                    { name: 'Schedule in use', color: series[0], points: Array.from({ length: project.sizing.projectYears + 1 }, (_, y) => ({ x: y, y: sizing.years[y]?.retention ?? 1 })) },
                    { name: 'Supplied curve', color: series[3], dashed: true, points: suppliedRetention.slice(0, project.sizing.projectYears + 1).map((v, y) => ({ x: y, y: v })) },
                  ]} />
                <p className="muted" style={{ fontSize: 11.5, marginTop: 4 }}>Axis starts at 50% retention.</p>
              </div>

              {deg.mode === 'table' ? (
                <div className="degradation-grid">
                  {Array.from({ length: Math.max(project.sizing.projectYears, deg.retention.length - 1) }, (_, i) => i + 1).map(year => (
                    <Slider key={year} label={`Year ${year}`} value={deg.retention[year] ?? suppliedRetention.at(-1) ?? 0.69}
                      scale={100} min={20} max={100} step={0.5} decimals={1} unit="%" disabled={!writable}
                      onChange={v => setRetention(year, v)} />
                  ))}
                </div>
              ) : (
                <p className="muted">
                  Switch to the year-by-year schedule to edit individual years, or use “Fill from ageing model” to copy the
                  model curve into an editable schedule.
                </p>
              )}
            </Card>
          </div>
        );
      })()}

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
                  <KV label="Discharge / charge rate">{sizing.systemCRate.toFixed(3)} / {sizing.chargeCRate.toFixed(3)} C</KV>
                  <KV label="Charge power">{sizing.chargePowerMW.toFixed(2)} MW over {normaliseSizingInput(project.sizing).chargeDurationH} h</KV>
                </div>
                <div>
                  <KV label="Footprint">{sizing.footprintM2.toFixed(1)} m²</KV>
                  <KV label="Mass">{sizing.massTonnes.toFixed(1)} t</KV>
                  <KV label="PCS">{sizing.pcsCount} × {sizing.pcs.ratedKW} kW ({sizing.pcsTotalMW.toFixed(2)} MW)</KV>
                  <KV label="Transformer">{sizing.transformer ? `${sizing.transformerCount} × ${sizing.transformer.ratedKVA} kVA` : 'Not included'}</KV>
                  <KV label="Auxiliary energy">{sizing.auxMWhPerDay.toFixed(2)} MWh/day</KV>
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
              ].filter(p => p.value > 0)} />
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
                bars={sizing.years.filter(y => y.year > 0).map(y => ({ label: String(y.year), value: y.deliveredMWh, note: y.augmentedMWh ? `Augmented +${y.augmentedMWh.toFixed(2)} MWh` : undefined }))} />
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
              <tr key={q.id}><td><Link href={`/app/quotes?id=${q.id}`}><b>{q.number}</b> r{q.version}</Link></td>
                <td><Badge tone={q.status === 'won' ? 'good' : q.status === 'lost' ? 'bad' : 'info'}>{quoteStatuses.includes(q.status) ? q.status : 'draft'}</Badge></td>
                <td className="muted">{q.preparedBy}</td><td className="muted">{date(q.validUntil)}</td>
                <td className="num">{formatMoney(q.total, q.currency, true)}</td></tr>
            ))}</tbody>
          </table>
        ) : <p className="muted" style={{ padding: 14 }}>No quotation raised yet.</p>}
      </Card>

      <TextArea label="Project notes" rows={3} value={project.notes} disabled={!writable} onChange={notes => void saveProject({ ...project, notes })} />
    </div>
  );
}
