'use client';
import { useState } from 'react';
import { Card, Badge, Tabs, KV } from '../components/ui';
import * as units from '../../domain/units';
import { cells, enclosures, packSpecs, pcsUnits, transformers, cellOf, packOf, packEnergyKWh, enclosureStrings } from '../../catalog/products';
import { enclosureSummary } from '../../sizing/engine';
import { applications } from '../../sizing/applications';

type Tab = 'enclosures' | 'cells' | 'power' | 'applications';
const tone = (p: string) => (p === 'supplied' ? 'good' : p === 'indicative' ? 'info' : 'warn') as 'good' | 'info' | 'warn';

export function Catalog() {
  const [tab, setTab] = useState<Tab>('enclosures');
  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="notice info">
        <b>Provenance</b>
        <p>Entries marked <b>supplied</b> come from the customer brief. Entries marked <b>indicative</b> are platform defaults for
          concept sizing and must be replaced with the supplier data sheet before any figure is issued.</p>
      </div>
      <Tabs<Tab> active={tab} onChange={setTab} tabs={[
        { id: 'enclosures', label: 'Enclosures' }, { id: 'cells', label: 'Cells & packs' },
        { id: 'power', label: 'Power conversion' }, { id: 'applications', label: 'Applications' }]} />

      {tab === 'enclosures' && (
        <Card tight>
          <table className="data">
            <thead><tr><th>Model</th><th>Family</th><th className="num">Energy</th><th className="num">Power</th><th className="num">Topology</th><th className="num">Cells</th><th className="num">DC window</th><th className="num">Aux</th><th>Cooling</th><th>Provenance</th></tr></thead>
            <tbody>{enclosures.map(e => { const s = enclosureSummary(e); return (
              <tr key={e.id}><td><b>{e.model}</b><div className="muted" style={{ fontSize: 11 }}>{e.lengthMm}×{e.widthMm}×{e.heightMm} mm · {(e.massKg / 1000).toFixed(2)} t · {packOf(e).model}</div></td>
                <td style={{ textTransform: 'capitalize' }}>{e.family}</td>
                <td className="num"><b>{units.energyText(s.energyKWh / 1000)}</b><div className="muted" style={{ fontSize: 11 }}>label {units.energyText(e.labelKWh / 1000)}</div></td>
                <td className="num">{e.ratedKW.toLocaleString()} kW</td>
                <td className="num">{e.packsInSeries}S × {enclosureStrings(e)}P<div className="muted" style={{ fontSize: 11 }}>{e.racks} racks × {e.packsPerRack}</div></td>
                <td className="num">{s.cells.toLocaleString()}</td>
                <td className="num">{e.dcMinV}–{e.dcMaxV} V</td>
                <td className="num">{e.auxMWhPerDayCharge} / {e.auxMWhPerDayDischarge}<div className="muted" style={{ fontSize: 11 }}>MWh per day</div></td>
                <td>{e.cooling} · {e.ipRating}</td>
                <td><Badge tone={tone(e.provenance)}>{e.provenance}</Badge></td></tr>
            ); })}</tbody>
          </table>
        </Card>
      )}

      {tab === 'cells' && (
        <div className="grid cols-2">
          <Card title="Cells" tight>
            <table className="data">
              <thead><tr><th>Model</th><th className="num">Capacity</th><th className="num">Voltage window</th><th className="num">Cycle life</th><th className="num">Temperature</th><th>Approved vendors</th></tr></thead>
              <tbody>{cells.map(c => (
                <tr key={c.id}><td><b>{c.model}</b><div className="muted" style={{ fontSize: 11 }}>{c.widthMm}×{c.heightMm}×{c.thicknessMm} mm · {c.massKg} kg · {c.chemistry}</div></td>
                  <td className="num">{c.ah} Ah @ {c.nominalV} V<div className="muted" style={{ fontSize: 11 }}>{(c.nominalV * c.ah / 1000).toFixed(3)} kWh</div></td>
                  <td className="num">{c.minV}–{c.maxV} V</td>
                  <td className="num">{c.cycleLife.toLocaleString()} → {(c.cycleLifeRetention * 100).toFixed(0)}%<div className="muted" style={{ fontSize: 11 }}>at {(c.cycleLifeDod * 100).toFixed(0)}% DoD · {c.calendarYears} yr → {(c.calendarRetention * 100).toFixed(0)}%</div></td>
                  <td className="num">{c.chargeTempC[0]} to {c.chargeTempC[1]} °C<div className="muted" style={{ fontSize: 11 }}>discharge {c.dischargeTempC[0]} to {c.dischargeTempC[1]}</div></td>
                  <td className="muted" style={{ fontSize: 11.5 }}>{c.approvedVendors.join(', ')}<div>{c.certifications.join(' · ')}</div></td></tr>
              ))}</tbody>
            </table>
          </Card>
          <Card title="Packs" tight>
            <table className="data">
              <thead><tr><th>Model</th><th className="num">Arrangement</th><th className="num">Voltage</th><th className="num">Energy</th><th className="num">Current</th><th className="num">Mass</th></tr></thead>
              <tbody>{packSpecs.map(p => (
                <tr key={p.id}><td><b>{p.model}</b><div className="muted" style={{ fontSize: 11 }}>{cellOf(p).model}</div></td>
                  <td className="num">{p.series}S{p.parallel}P<div className="muted" style={{ fontSize: 11 }}>{p.rows}×{p.columns}</div></td>
                  <td className="num">{p.nominalV} V<div className="muted" style={{ fontSize: 11 }}>{p.minV}–{p.maxV} V</div></td>
                  <td className="num"><b>{packEnergyKWh(p).toFixed(3)} kWh</b><div className="muted" style={{ fontSize: 11 }}>label {p.labelKWh}</div></td>
                  <td className="num">{p.continuousA} A<div className="muted" style={{ fontSize: 11 }}>max {p.maxA} A</div></td>
                  <td className="num">{p.massKg} kg</td></tr>
              ))}</tbody>
            </table>
          </Card>
        </div>
      )}

      {tab === 'power' && (
        <div className="grid cols-2">
          <Card title="Power conversion systems" tight>
            <table className="data">
              <thead><tr><th>Model</th><th className="num">Rating</th><th className="num">DC window</th><th className="num">Max DC current</th><th className="num">Efficiency</th><th>Topology</th></tr></thead>
              <tbody>{pcsUnits.map(p => (
                <tr key={p.id}><td><b>{p.model}</b><div className="muted" style={{ fontSize: 11 }}>{p.acV} V AC</div></td>
                  <td className="num">{p.ratedKW.toLocaleString()} kW</td><td className="num">{p.dcMinV}–{p.dcMaxV} V</td>
                  <td className="num">{p.dcMaxA.toLocaleString()} A</td><td className="num">{(p.efficiency * 100).toFixed(2)}%</td>
                  <td style={{ textTransform: 'capitalize' }}>{p.topology}<div className="muted" style={{ fontSize: 11, textTransform: 'none' }}>{p.approvedVendors.join(', ')}</div></td></tr>
              ))}</tbody>
            </table>
          </Card>
          <Card title="Transformers" tight>
            <table className="data">
              <thead><tr><th>Model</th><th className="num">Rating</th><th className="num">Ratio</th><th className="num">Efficiency</th></tr></thead>
              <tbody>{transformers.map(t => (
                <tr key={t.id}><td><b>{t.model}</b></td><td className="num">{t.ratedKVA.toLocaleString()} kVA</td>
                  <td className="num">{t.lvKV} / {t.hvKV} kV</td><td className="num">{(t.efficiency * 100).toFixed(2)}%</td></tr>
              ))}</tbody>
            </table>
          </Card>
        </div>
      )}

      {tab === 'applications' && (
        <div className="grid cols-2">
          {applications.map(a => (
            <Card key={a.id} title={a.name} subtitle={a.summary}>
              <KV label="Default duration">{a.durationH} h</KV>
              <KV label="Duty cycle">{a.cyclesPerDay} cycles/day · {a.daysPerYear} days/yr</KV>
              <KV label="Depth of discharge">{(a.dod * 100).toFixed(0)}%</KV>
              <KV label="Response requirement">{a.responseMs} ms</KV>
              <KV label="Revenue basis"><span style={{ textTransform: 'capitalize' }}>{a.revenueModel.replace(/-/g, ' ')}</span></KV>
              <KV label="Imported energy share">{(a.chargeFactor * 100).toFixed(0)}% of discharge</KV>
              <div style={{ marginTop: 10 }}>
                <h4 style={{ fontSize: 11.5, marginBottom: 5 }}>Commercial risks</h4>
                {a.keyRisks.map(r => <div key={r} className="muted" style={{ fontSize: 12, padding: '2px 0' }}>· {r}</div>)}
              </div>
            </Card>
          ))}
        </div>
      )}
      <p className="muted">
        Pack reference: {packOf(enclosures[0]).model} — the supplied 104S1P assembly modelled in the 3D studio.
        Computed pack energy uses the cell nominal voltage, which differs slightly from the nameplate label; both are shown.
      </p>
    </div>
  );
}
