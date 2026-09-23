'use client';
import { useEffect, useRef, useState } from 'react';
import { energyCascade, type Cascade, type CascadeStep } from '../../sizing/cascade';
import { containerLadder, type LadderRung } from '../../sizing/ladder';
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

      {sizing.enclosure.family === 'container' && <ContainerLadder sizing={sizing} />}
    </Card>
  );
}

/**
 * "Would a bigger container have done it in one?"
 *
 * The question every buyer asks when a 5 MWh duty comes back as two containers, and the studio was
 * answering it with a sentence about rounding. Containers are not made to order — they come in the
 * rungs the cell generation gives them — so the answer is the ladder: what every size on the market
 * would do with this same duty, and what a single container would have to carry to do it alone.
 * Often that number is above every rung that exists, and then two units is not waste, it is the
 * shape of the product.
 */
function ContainerLadder({ sizing }: { sizing: SizingResult }) {
  const ladder = containerLadder(sizing);
  const need = ladder.singleUnitNeedsKWh;
  const ours = ladder.rungs.find(r => r.isCatalogue);
  const biggest = ladder.rungs[ladder.rungs.length - 1];

  return (
    <div className="ladder">
      <p className="ladder-head">Containers are not made to order</p>
      <p className="ladder-lede">
        A 20 ft container is a standard product, and the ladder moves when the cell generation moves.
        This duty needs <b>{units.energyText(ladder.requiredKWh / 1000)}</b> usable at year{' '}
        {ladder.atYear}, so one container would have to carry{' '}
        <b>{units.energyText(need / 1000)}</b> of nameplate to do it alone —{' '}
        {ladder.singleUnitAtKWh === null
          ? <>more than the largest size anyone lists ({biggest.label}). Two units is not rounding
            waste here; it is what the market builds.</>
          : <>which the {(ladder.singleUnitAtKWh / 1000).toFixed(2)} MWh rung meets.</>}
        {' '}Nothing below is priced: only the catalogue rung can be quoted.
      </p>
      <table className="ladder-t">
        <thead>
          <tr>
            <th>Standard size</th><th>Reaches the meter</th><th>Units</th>
            <th>Installed</th><th>Beyond the duty</th>
          </tr>
        </thead>
        <tbody>
          {ladder.rungs.map(r => <Rung key={r.nameplateKWh} rung={r} />)}
        </tbody>
      </table>
      {ours && ladder.rungs.some(r => r.nameplateKWh > ours.nameplateKWh && r.units >= ours.units) && (
        <p className="cascade-check" style={{ marginTop: 10 }}>
          Note the rungs above ours that still need {ours.units}: a larger container does not always
          buy fewer of them, and when it does not it is simply more nameplate standing idle. That is
          the test a bigger box has to pass before it is worth asking for a price.
        </p>
      )}
    </div>
  );
}

const EVIDENCE: Record<LadderRung['evidence'], string> = {
  catalogue: 'quotable',
  published: 'published',
  announced: 'announced',
};

function Rung({ rung }: { rung: LadderRung }) {
  return (
    <tr className={rung.isCatalogue ? 'ours' : undefined}>
      <td>
        <b>{rung.label}</b>
        <span className="ladder-tag">{EVIDENCE[rung.evidence]}</span>
        <span className="ladder-src">{rung.publisher}</span>
      </td>
      <td>{units.energyText(rung.deliverableKWh / 1000)}</td>
      <td>{rung.units}</td>
      <td>{units.energyText(rung.installedKWh / 1000)}</td>
      <td>{(rung.sparePortion * 100).toFixed(0)}%</td>
    </tr>
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
