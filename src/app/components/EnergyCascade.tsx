'use client';
import { useEffect, useRef, useState } from 'react';
import { energyCascade, type Cascade, type CascadeStep } from '../../sizing/cascade';
import type { SizingResult } from '../../sizing/engine';
import * as units from '../../domain/units';
import { Card } from './ui';

/**
 * Where the nameplate goes, drawn as it goes.
 *
 * A reader who is told a container delivers 3.56 MWh out of a 5.02 MWh nameplate has to take five
 * numbers on trust; a reader who watches the bar shrink five times, each step labelled with the
 * factor and who is in a position to settle it, can check the arithmetic by hand and knows which
 * supplier to ask about which number. That is the difference between a figure and an explanation.
 *
 * The bars animate on mount and again whenever the design changes, because the point of the
 * animation is that it is subtraction: each step takes something, and the thing it takes has a
 * name and an owner.
 */
const PROVENANCE: Record<CascadeStep['provenance'], { label: string; tone: string }> = {
  supplied: { label: 'From a supplied document', tone: 'ok' },
  indicative: { label: 'Platform default', tone: 'warn' },
  assumed: { label: 'Assumed — needs confirming', tone: 'warn' },
  decision: { label: 'A decision, not a measurement', tone: 'neutral' },
  computed: { label: 'Computed', tone: 'ok' },
};

const YEARS = [0, 1, 10, 20];

export function EnergyCascade({ sizing }: { sizing: SizingResult }) {
  const [year, setYear] = useState(0);
  const [open, setOpen] = useState<string | null>(null);
  const [run, setRun] = useState(0);
  const projectYears = sizing.input.projectYears;
  const years = YEARS.filter(y => y <= projectYears);
  const cascade = energyCascade(sizing, Math.min(year, projectYears));

  // Replay whenever the design or the year changes, so the animation always describes what is on
  // the screen now rather than what was there when the tab was opened.
  const key = `${sizing.enclosure.id}-${sizing.units}-${year}-${sizing.dischargePathEfficiency}-${sizing.input.dod}`;
  const previous = useRef(key);
  useEffect(() => { if (previous.current !== key) { previous.current = key; setRun(n => n + 1); } }, [key]);

  return (
    <Card title="Where the nameplate goes"
      subtitle={`One ${sizing.enclosure.model}, from the number on the label to the energy at the connection`}>
      <div className="row" style={{ marginBottom: 12 }}>
        <span className="muted" style={{ fontSize: 11.5, letterSpacing: '.08em', textTransform: 'uppercase' }}>At</span>
        {years.map(y => (
          <button key={y} className={`btn sm${y === year ? ' accent' : ''}`} aria-pressed={y === year}
            onClick={() => setYear(y)}>{y === 0 ? 'Commissioning' : `Year ${y}`}</button>
        ))}
      </div>

      <Cascaded cascade={cascade} run={run} open={open} onOpen={setOpen} />

      <div className="cascade-result">
        <div>
          <b>{units.energyText(cascade.deliverableKWh / 1000)}</b> from one enclosure
          {cascade.units > 1 && <> · <b>{units.energyText(cascade.fleetDeliverableKWh / 1000)}</b> from {cascade.units}</>}
        </div>
        <div className="muted">
          {cascade.hoursAtRatedPower.toFixed(2)} h at {units.powerText(sizing.ratedPowerMW)}
          {' · '}{(100 * cascade.deliverableKWh / cascade.nameplateKWh).toFixed(0)}% of nameplate reaches the connection
        </div>
      </div>

      <p className="cascade-check">
        Check it: {cascade.nameplateKWh.toLocaleString('en', { maximumFractionDigits: 0 })} kWh
        {cascade.steps.filter(s => s.factor !== null).map(s => ` × ${s.factor!.toFixed(4)}`).join('')}
        {' − '}{(cascade.steps.find(s => s.id === 'aux')!.fromKWh - cascade.steps.find(s => s.id === 'aux')!.toKWh).toFixed(0)} kWh
        {' = '}<b>{cascade.deliverableKWh.toLocaleString('en', { maximumFractionDigits: 0 })} kWh</b>.
        {' '}The arithmetic is one line. The five factors above it are the whole argument — each is
        settled by somebody other than this studio, and <b>Who settles this</b> on any step says who.
      </p>
    </Card>
  );
}

function Cascaded({ cascade, run, open, onOpen }: {
  cascade: Cascade; run: number; open: string | null; onOpen: (id: string | null) => void;
}) {
  // Mounted false on every replay, then true a frame later, so the bars transition from full width
  // rather than appearing at their final size.
  const [shown, setShown] = useState(false);
  useEffect(() => {
    setShown(false);
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)));
    return () => cancelAnimationFrame(id);
  }, [run]);

  const full = Math.max(cascade.nameplateKWh, 1e-9);
  return (
    <div className="cascade">
      <div className="cascade-row head">
        <span>Nameplate, as the label states it</span>
        <b>{cascade.nameplateKWh.toLocaleString('en', { maximumFractionDigits: 0 })} kWh</b>
      </div>
      <div className="cascade-bar nameplate"><span style={{ width: '100%' }} /></div>

      {cascade.steps.map((step, i) => {
        const lost = step.fromKWh - step.toKWh;
        const isOpen = open === step.id;
        return (
          <div className={`cascade-step${isOpen ? ' open' : ''}`} key={step.id}>
            <button className="cascade-row" aria-expanded={isOpen}
              onClick={() => onOpen(isOpen ? null : step.id)}>
              <span className="cascade-label">
                {step.label}
                {step.factor !== null && <em> × {step.factor.toFixed(4)}</em>}
              </span>
              {/* At commissioning nothing has aged yet, and "−0 kWh" is noise on the one row that
                  is there to say the nameplate is intact. */}
              <span className="cascade-lost">{lost < 0.5 ? '' : `−${lost.toLocaleString('en', { maximumFractionDigits: 0 })} kWh`}</span>
              <b>{step.toKWh.toLocaleString('en', { maximumFractionDigits: 0 })} kWh</b>
            </button>
            <div className="cascade-bar">
              {/* The bar is the energy still here; the ghost behind it is what this step took. */}
              <i style={{ width: `${(step.fromKWh / full) * 100}%`, transitionDelay: `${i * 90}ms` }} />
              <span style={{ width: shown ? `${(step.toKWh / full) * 100}%` : `${(step.fromKWh / full) * 100}%`,
                transitionDelay: `${i * 90}ms` }} />
            </div>
            <p className="cascade-detail">{step.detail}</p>
            {isOpen && (
              <div className="cascade-evidence">
                <div><span>Who settles this</span><b>{step.settledBy}</b></div>
                <div><span>Evidence to ask for</span><b>{step.evidence}</b></div>
                <div><span>Where this figure stands today</span>
                  <b className={`prov ${PROVENANCE[step.provenance].tone}`}>{PROVENANCE[step.provenance].label}</b></div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
