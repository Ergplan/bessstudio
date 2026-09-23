'use client';
import type { Readout } from '../../sim/lessons';
import { Instrument, Row, lampFor, type Reading } from './instruments';

/**
 * The plant, drawn rather than tabulated — for every card, not only the first.
 *
 * Three pieces, and they are deliberately three rather than one long wall. {@link PlantView} is
 * where the energy is coming from and going to, with the enclosure filling and emptying between
 * them. {@link Instruments} is what the two devices in the container are reading. The cell
 * chemistry lives in its own component. A card shows whichever of them its own section is for, so
 * nothing has to compete with anything else for the same square inch.
 *
 * The supply and the offtake are read off the run rather than passed in. A lesson with an array in
 * its scenario shows an array; one with a site behind an outage shows the site; one with neither
 * shows the grid on whichever side the energy is going. That is what lets the same view serve all
 * seven cards without any of them configuring it.
 */

const W = 300, H = 196;
const iso = (x: number, y: number, z: number): [number, number] => [
  W / 2 + (x - y) * 0.866,
  H / 2 + (x + y) * 0.5 - z,
];
const face = (points: [number, number, number][]) => points.map(p => iso(...p).join(',')).join(' ');
const at = <T,>(arr: T[], i: number): T => arr[Math.min(Math.max(i, 0), arr.length - 1)];

/** What is on the other side of the converter, this run, in the reader's words. */
export function ends(s: Readout['series'], act: number) {
  const genKW = at(s.generationW, act) / 1000;
  const loadKW = at(s.siteLoadW, act) / 1000;
  const acKW = at(s.achievedPowerW, act) / 1000;
  const islanded = loadKW > 1 && Math.abs(at(s.gridImportW, act)) < 1 && Math.abs(at(s.gridExportW, act)) < 1;
  return {
    acKW,
    discharging: acKW > 1,
    supply: genKW > 1
      ? { label: 'Rooftop array', detail: `${genKW.toFixed(0)} kW generated`, tone: '#E8AE3F' }
      : { label: 'The grid', detail: 'importing', tone: '#4FA8DA' },
    offtake: loadKW > 1
      ? { label: islanded ? 'The site, islanded' : 'The site', detail: `${loadKW.toFixed(0)} kW of load`, tone: '#E2685E' }
      : { label: 'The grid', detail: 'exporting', tone: '#4FA8DA' },
  };
}

export function PlantView({ readout }: { readout: Readout }) {
  const { series: s, act } = readout;
  const soc = at(s.soc, act);
  const cellV = at(s.cellVoltageV, act);
  const e = ends(s, act);
  const active = e.discharging ? e.offtake : e.supply;

  return (
    <div className="plant">
      <svg viewBox={`0 0 ${W} ${H}`} className="iso" role="img"
        aria-label={`Enclosure at ${(soc * 100).toFixed(0)} percent charge, ${e.discharging ? 'discharging' : at(s.dcPowerW, act) < -1000 ? 'charging' : 'idle'}`}>
        {(() => {
          const L = 150, D = 62, Hh = 78, level = Hh * Math.min(1, Math.max(0, soc));
          return (
            <>
              <polygon points={face([[-14, -14, 0], [L + 14, -14, 0], [L + 14, D + 14, 0], [-14, D + 14, 0]])} className="iso-pad" />
              <polygon points={face([[0, 0, level], [L, 0, level], [L, D, level], [0, D, level]])} className="iso-level-top" />
              <polygon points={face([[0, D, 0], [L, D, 0], [L, D, level], [0, D, level]])} className="iso-level" />
              <polygon points={face([[L, 0, 0], [L, D, 0], [L, D, level], [L, 0, level]])} className="iso-level dark" />
              <polygon points={face([[0, 0, Hh], [L, 0, Hh], [L, D, Hh], [0, D, Hh]])} className="iso-top" />
              <polygon points={face([[0, D, 0], [L, D, 0], [L, D, Hh], [0, D, Hh]])} className="iso-side" />
              <polygon points={face([[L, 0, 0], [L, D, 0], [L, D, Hh], [L, 0, Hh]])} className="iso-side dark" />
              {Array.from({ length: 5 }, (_, i) => {
                const x = (L / 6) * (i + 1);
                const [x1, y1] = iso(x, D, 0), [x2, y2] = iso(x, D, Hh);
                return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} className="iso-rib" />;
              })}
              <text {...xy(iso(L / 2, D / 2, Hh + 16))} className="iso-label">{(soc * 100).toFixed(0)}%</text>
            </>
          );
        })()}
      </svg>

      <div className="plant-flow">
        <span style={{ borderColor: e.discharging ? undefined : active.tone }}>
          <b>{e.discharging ? 'The cells' : e.supply.label}</b>
          <i>{e.discharging ? 'giving up charge' : e.supply.detail}</i>
        </span>
        <em aria-hidden className={e.discharging ? 'out' : 'in'}>→</em>
        <span style={{ borderColor: e.discharging ? active.tone : undefined }}>
          <b>{e.discharging ? e.offtake.label : 'The cells'}</b>
          <i>{e.discharging ? e.offtake.detail : 'storing it'}</i>
        </span>
        <b className="rate">{Math.abs(e.acKW).toFixed(0)} kW<small>at the connection</small></b>
      </div>

      <Gauges soc={soc} cellV={cellV} series={s} act={act} />
    </div>
  );
}

const xy = ([x, y]: [number, number]) => ({ x, y, textAnchor: 'middle' as const });

/**
 * Two gauges, because one of them would be a lie.
 *
 * A water cup tells you how full it is by how hard it pushes. Lithium iron phosphate does not, and
 * the sentence underneath counts the millivolts off the run on the screen rather than asserting it.
 */
function Gauges({ soc, cellV, series: s, act }: {
  soc: number; cellV: number; series: Readout['series']; act: number;
}) {
  const lo = 2.5, hi = 3.65;
  const v = Math.min(1, Math.max(0, (cellV - lo) / (hi - lo)));
  // The closing sample is left out: the current stops there and the terminal voltage rebounds to
  // open circuit, which is a real effect and not part of the plateau.
  const upTo = Math.max(1, Math.min(act, s.soc.length - 2));
  const volts = s.cellVoltageV.slice(0, upTo + 1), socs = s.soc.slice(0, upTo + 1);
  const mV = volts.length > 1 ? (Math.max(...volts) - Math.min(...volts)) * 1000 : 0;
  const points = socs.length > 1 ? Math.abs(Math.max(...socs) - Math.min(...socs)) * 100 : 0;

  return (
    <div className="gauges">
      <div className="gauge">
        <span>Charge level<b>{(soc * 100).toFixed(1)}%</b></span>
        <div className="gauge-bar"><i style={{ width: `${soc * 100}%` }} /></div>
        <small>Counted in and out by the battery management system.</small>
      </div>
      <div className="gauge">
        <span>Cell voltage<b>{cellV.toFixed(3)} V</b></span>
        <div className="gauge-bar flat"><i style={{ width: `${v * 100}%` }} /></div>
        <small>
          On a {lo}–{hi} V scale.{' '}
          {points > 1
            ? <>So far this run the charge level has moved <b>{points.toFixed(0)} points</b> and the
              cell has moved <b>{mV.toFixed(0)} mV</b>. That is why there are two bars: a voltmeter
              on the terminals would barely have noticed.</>
            : <>This chemistry is flat across the middle of its range, so the voltage is a poor fuel
              gauge and the counting above is the real one.</>}
        </small>
      </div>
    </div>
  );
}

/**
 * The two devices, as the devices show themselves.
 *
 * Every signal that has a limit is drawn against that limit, with the band where the protection
 * starts pulling the request back marked on it. A management system's whole job is judging single
 * cells against thresholds, so the extremes are what is shown — an average cell voltage has never
 * tripped anything.
 */
export function Instruments({ readout, pcsState, bmsState, constraint, limits }: {
  readout: Readout;
  pcsState: string; bmsState: string; constraint: string;
  limits: { cellMinV: number; cellMaxV: number; tempMaxC: number; currentMaxA: number };
}) {
  const { series: s, act } = readout;
  const held = constraint && constraint !== 'Request met in full';
  const maxV = at(s.cellVoltageMaxV, act), minV = at(s.cellVoltageMinV, act);
  const tempMax = at(s.cellTempMaxC, act), temp = at(s.cellTempC, act);
  const amps = at(s.packCurrentA, act);
  const askedKW = at(s.requestedPowerW, act) / 1000;
  const dcKW = at(s.dcPowerW, act) / 1000;
  const acKW = at(s.achievedPowerW, act) / 1000;
  const lossKW = (at(s.converterLossW, act) + at(s.auxiliaryW, act)) / 1000;
  const throughput = Math.max(Math.abs(dcKW), Math.abs(acKW));
  const efficiency = throughput > 1
    ? (Math.abs(acKW) > Math.abs(dcKW) ? Math.abs(dcKW) / Math.abs(acKW) : Math.abs(acKW) / Math.abs(dcKW))
    : null;

  const bms: Reading[] = [
    { label: 'Charge level', value: (at(s.soc, act) * 100).toFixed(1), unit: '%',
      bar: { value: at(s.soc, act) * 100, min: 0, max: 100 } },
    { label: 'Highest cell', value: maxV.toFixed(3), unit: 'V', from: 'of 104 in series',
      bar: { value: maxV, min: limits.cellMinV, max: limits.cellMaxV, derateFrom: limits.cellMaxV - 0.08, derateTo: limits.cellMaxV },
      tone: maxV > limits.cellMaxV - 0.08 ? 'warn' : undefined },
    { label: 'Lowest cell', value: minV.toFixed(3), unit: 'V', from: 'of 104 in series',
      bar: { value: minV, min: limits.cellMinV, max: limits.cellMaxV, derateFrom: limits.cellMinV, derateTo: limits.cellMinV + 0.15 },
      tone: minV < limits.cellMinV + 0.15 ? 'warn' : undefined },
    { label: 'Spread, highest to lowest', value: ((maxV - minV) * 1000).toFixed(0), unit: 'mV',
      // Zero on every card but the weak-cell one, and saying why is the point: a reader who sees
      // two identical numbers should be told the model carries one representative cell rather than
      // left to conclude the panel is broken.
      from: maxV - minV < 1e-6 ? 'one representative cell — spread is injected, not modelled' : undefined },
    { label: 'String voltage', value: Math.round(at(s.packVoltageV, act)).toLocaleString('en'), unit: 'V' },
    { label: 'Current', value: Math.round(amps).toLocaleString('en'), unit: 'A',
      from: amps > 0 ? 'out of the battery' : amps < 0 ? 'into the battery' : 'at rest',
      bar: { value: Math.abs(amps), min: 0, max: limits.currentMaxA * 1.3, derateFrom: limits.currentMaxA, derateTo: limits.currentMaxA * 1.3 } },
    { label: 'Hottest cell', value: tempMax.toFixed(1), unit: '°C', from: `mean ${temp.toFixed(1)} °C`,
      bar: { value: tempMax, min: 0, max: limits.tempMaxC + 5, derateFrom: limits.tempMaxC - 10, derateTo: limits.tempMaxC },
      tone: tempMax > limits.tempMaxC - 10 ? 'warn' : undefined },
  ];

  const pcs: Reading[] = [
    { label: 'Asked for', value: askedKW.toFixed(0), unit: 'kW' },
    { label: 'Battery side, direct current', value: dcKW.toFixed(0), unit: 'kW' },
    { label: 'At the connection, alternating', value: acKW.toFixed(0), unit: 'kW' },
    // Measured where the request was made — at the connection. Against the battery side it reads
    // negative on a discharge, because the cells have to supply the losses as well as the load.
    { label: 'Held back', value: Math.max(0, Math.abs(askedKW) - Math.abs(acKW)).toFixed(0), unit: 'kW',
      from: held ? constraint : 'nothing is limiting', tone: held ? 'warn' : undefined },
    { label: 'Conversion efficiency', value: efficiency === null ? '—' : (efficiency * 100).toFixed(1), unit: '%',
      from: efficiency === null ? 'not dispatching' : undefined },
    { label: 'Lost as heat and auxiliaries', value: lossKW.toFixed(1), unit: 'kW' },
  ];

  return (
    <div className="instruments">
      <Instrument tag="BMS-01" name="Battery management system" state={bmsState} lamp={lampFor(bmsState)}
        absent="A commissioned system also reports insulation resistance, contactor cycles and per-module balancing current. This model does not carry them, so they are not shown.">
        {bms.map(r => <Row key={r.label} r={r} />)}
      </Instrument>
      <Instrument tag="PCS-01" name="Power conversion system" state={pcsState} lamp={lampFor(pcsState)}
        absent="Grid voltage, frequency and reactive power are on a real converter's panel and are outside this model, so they are absent rather than estimated.">
        {pcs.map(r => <Row key={r.label} r={r} />)}
      </Instrument>
    </div>
  );
}
