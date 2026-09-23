'use client';
import type { Readout } from '../../sim/lessons';
import { LineChart, series as palette } from './viz';

/**
 * The first card, drawn as the thing it is describing.
 *
 * A reader meeting a battery plant for the first time was shown four numbers and two line charts.
 * Both were true and neither was a picture of anything: nothing on the screen said that energy
 * arrives from somewhere, crosses a converter, sits in cells and leaves again, which is the entire
 * content of the lesson.
 *
 * So the left is the machine — an isometric enclosure with the supply on one side and the load on
 * the other, and arrows that run in the direction the energy is actually going at this moment. The
 * right is what an engineer reads: the battery management system's own signals, and the converter's.
 *
 * **The fill is deliberately two bars, not one.** A water cup tells you how full it is by how hard
 * it pushes, and lithium iron phosphate does not: the cell sits within about a tenth of a volt from
 * nine-tenths full down to a fifth, which is why a voltage reading is a bad fuel gauge and why the
 * management system counts charge in and out instead. Drawing the charge level alone would teach
 * the water-cup intuition this chemistry spends its whole life breaking.
 */

const W = 300, H = 210;
/** Isometric projection: x to the right and down, y to the left and down, z straight up. */
const iso = (x: number, y: number, z: number): [number, number] => [
  W / 2 + (x - y) * 0.866,
  H / 2 + (x + y) * 0.5 - z,
];
const face = (points: [number, number, number][]) => points.map(p => iso(...p).join(',')).join(' ');

type Flow = { label: string; side: 'in' | 'out'; kW: number; tone: string };

export function PlantDashboard({ readout, occasion }: { readout: Readout; occasion: number }) {
  const { series: s, act } = readout;
  const soc = s.soc[Math.min(act, s.soc.length - 1)] ?? 0;
  const cellV = s.cellVoltageV[Math.min(act, s.cellVoltageV.length - 1)] ?? 0;
  const dcKW = (s.dcPowerW[Math.min(act, s.dcPowerW.length - 1)] ?? 0) / 1000;
  const acKW = (s.achievedPowerW[Math.min(act, s.achievedPowerW.length - 1)] ?? 0) / 1000;
  const genKW = (s.generationW[Math.min(act, s.generationW.length - 1)] ?? 0) / 1000;
  const loadKW = (s.siteLoadW[Math.min(act, s.siteLoadW.length - 1)] ?? 0) / 1000;
  const discharging = dcKW > 1;

  // Where the energy is coming from and going to, named for the occasion the learner chose.
  const supply: Flow = occasion === -2
    ? { label: 'Rooftop array', side: 'in', kW: Math.max(genKW, Math.abs(acKW)), tone: '#E8AE3F' }
    : { label: 'The grid', side: 'in', kW: Math.abs(acKW), tone: '#4FA8DA' };
  const offtake: Flow = occasion === 2
    ? { label: 'The site, islanded', side: 'out', kW: loadKW, tone: '#E2685E' }
    : { label: 'The grid', side: 'out', kW: Math.abs(acKW), tone: '#4FA8DA' };
  const active = discharging ? offtake : supply;

  return (
    <div className="dash">
      <div className="dash-machine">
        <Enclosure soc={soc} discharging={discharging} dcKW={dcKW} />
        <div className="dash-flow">
          <span className="from" style={{ borderColor: discharging ? undefined : active.tone }}>
            <b>{discharging ? 'Cells' : supply.label}</b>
            <i>{discharging ? 'giving up charge' : 'supplying'}</i>
          </span>
          <em aria-hidden className={discharging ? 'out' : 'in'}>→</em>
          <span className="to" style={{ borderColor: discharging ? active.tone : undefined }}>
            <b>{discharging ? offtake.label : 'Cells'}</b>
            <i>{discharging ? 'taking the energy' : 'storing it'}</i>
          </span>
          <b className="rate">{Math.abs(acKW).toFixed(0)} kW<small>at the connection</small></b>
        </div>
        <Gauges soc={soc} cellV={cellV} series={s} act={act} />
      </div>
      <div className="dash-charts">
        <Panel title="The battery management system sees" subtitle="Cell voltage against the window it protects, and the current through the pack">
          <LineChart height={150} yLabel="V/cell" format={n => `${n.toFixed(2)}`}
            data={[
              { name: 'Highest cell', color: palette[2], points: pts(s, s.cellVoltageMaxV) },
              { name: 'Lowest cell', color: palette[1], points: pts(s, s.cellVoltageMinV) },
            ]} />
          <LineChart height={130} yLabel="A" format={n => `${n.toFixed(0)}`}
            data={[{ name: 'Pack current', color: palette[0], points: pts(s, s.packCurrentA) }]} />
        </Panel>
        <Panel title="The converter sees" subtitle="What was asked, what crossed the direct-current side, and what reached the connection">
          <LineChart height={150} yLabel="kW" format={n => `${n.toFixed(0)}`}
            data={[
              { name: 'Asked for', color: palette[3], dashed: true, points: pts(s, s.requestedPowerW.map(v => v / 1000)) },
              { name: 'Battery side', color: palette[0], points: pts(s, s.dcPowerW.map(v => v / 1000)) },
              { name: 'At the connection', color: palette[1], points: pts(s, s.achievedPowerW.map(v => v / 1000)) },
            ]} />
          <LineChart height={130} yLabel="kW lost" format={n => `${n.toFixed(1)}`}
            data={[
              { name: 'In the converter', color: palette[4], points: pts(s, s.converterLossW.map(v => v / 1000)) },
              { name: "In the cells' resistance", color: palette[2], points: pts(s, s.batteryLossW.map(v => v / 1000)) },
              { name: 'Auxiliaries', color: palette[5], points: pts(s, s.auxiliaryW.map(v => v / 1000)) },
            ]} />
        </Panel>
      </div>
    </div>
  );
}

const pts = (s: Readout['series'], values: number[]) =>
  values.map((y, i) => ({ x: s.timeSeconds[i] / 60, y }));

function Panel({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <section className="dash-panel">
      <h4>{title}</h4>
      <p>{subtitle}</p>
      {children}
    </section>
  );
}

/** The enclosure, filling and emptying, with the racks inside it showing through. */
function Enclosure({ soc, discharging, dcKW }: { soc: number; discharging: boolean; dcKW: number }) {
  const L = 150, D = 62, Hh = 78;
  const level = Hh * Math.min(1, Math.max(0, soc));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="iso" role="img"
      aria-label={`Enclosure at ${(soc * 100).toFixed(0)} percent charge, ${discharging ? 'discharging' : dcKW < -1 ? 'charging' : 'idle'}`}>
      {/* The pad it stands on. */}
      <polygon points={face([[-14, -14, 0], [L + 14, -14, 0], [L + 14, D + 14, 0], [-14, D + 14, 0]])}
        className="iso-pad" />
      {/* The charge, drawn as a solid the height of the state of charge, inside the shell. */}
      <polygon points={face([[0, 0, level], [L, 0, level], [L, D, level], [0, D, level]])} className="iso-level-top" />
      <polygon points={face([[0, D, 0], [L, D, 0], [L, D, level], [0, D, level]])} className="iso-level" />
      <polygon points={face([[L, 0, 0], [L, D, 0], [L, D, level], [L, 0, level]])} className="iso-level dark" />
      {/* The shell, drawn after so its edges sit over the fill. */}
      <polygon points={face([[0, 0, Hh], [L, 0, Hh], [L, D, Hh], [0, D, Hh]])} className="iso-top" />
      <polygon points={face([[0, D, 0], [L, D, 0], [L, D, Hh], [0, D, Hh]])} className="iso-side" />
      <polygon points={face([[L, 0, 0], [L, D, 0], [L, D, Hh], [L, 0, Hh]])} className="iso-side dark" />
      {/* Rack divisions, so it reads as a container of racks rather than a block. */}
      {Array.from({ length: 5 }, (_, i) => {
        const x = (L / 6) * (i + 1);
        const [x1, y1] = iso(x, D, 0), [x2, y2] = iso(x, D, Hh);
        return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} className="iso-rib" />;
      })}
      <text {...xy(iso(L / 2, D / 2, Hh + 16))} className="iso-label">{(soc * 100).toFixed(0)}%</text>
    </svg>
  );
}

const xy = ([x, y]: [number, number]) => ({ x, y, textAnchor: 'middle' as const });

/**
 * Two gauges, because one of them would be a lie.
 *
 * The charge level is what the management system counts. The cell voltage is what a meter reads,
 * and on this chemistry it is nearly flat across the middle of the range — the bar barely moves
 * while the one above it empties. That is the whole reason a lithium iron phosphate pack needs a
 * management system counting coulombs rather than a voltmeter on the terminals.
 */
function Gauges({ soc, cellV, series: s, act }: {
  soc: number; cellV: number; series: Readout['series']; act: number;
}) {
  const lo = 2.5, hi = 3.65;
  const v = Math.min(1, Math.max(0, (cellV - lo) / (hi - lo)));
  // Measured off the run on the screen, not asserted: the closing sample is left out because the
  // current stops there and the terminal voltage rebounds to open circuit, which is a real effect
  // and not part of the plateau.
  const upTo = Math.max(1, Math.min(act, s.soc.length - 2));
  const volts = s.cellVoltageV.slice(0, upTo + 1);
  const socs = s.soc.slice(0, upTo + 1);
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
              cell has moved <b>{mV.toFixed(0)} mV</b>. That is the whole reason there are two bars
              here: a voltmeter on the terminals would barely have noticed.</>
            : <>This chemistry is flat across the middle of its range, so the voltage is a poor fuel
              gauge and the counting above is the real one. Press Play and watch the two bars
              disagree.</>}
        </small>
      </div>
    </div>
  );
}
