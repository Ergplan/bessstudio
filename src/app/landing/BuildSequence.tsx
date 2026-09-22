'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { brand } from '../../brand/brand';
import { cellOf, packOf } from '../../catalog/products';
import { defaultPriceBook, formatMoney, localRate } from '../../catalog/pricing';
import { evaluateFinance } from '../../sizing/finance';
import { application } from '../../sizing/applications';
import type { SizingResult } from '../../sizing/engine';
import { BuildScene, MAX_DRAWN, STAGE_COUNT, STAGE_MS } from './BuildScene';

type Row = [string, string];
type Step = {
  label: string; title: string; detail: string;
  value: number; render: (n: number) => string; unit: string; rows: Row[]; note?: string;
};

/** Counts a figure up as its step opens, so each number arrives rather than appearing. */
function useCountUp(value: number, key: number, ms = 820) {
  const [n, setN] = useState(0);
  useEffect(() => {
    let raf = 0;
    const t0 = performance.now();
    const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) { setN(value); return; }
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / ms);
      setN(value * (1 - (1 - p) ** 3));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, key, ms]);
  return n;
}

const round = (n: number, dp = 0) => n.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
const hours = (h: number) => (h < 1 ? `${Math.round(h * 60)} min` : `${h % 1 ? h.toFixed(1) : h} h`);

/**
 * The commissioning sequence between the opening question and the workbench.
 *
 * The plant is being sized, priced and written away while this plays, and every figure on screen
 * is read back from that same result — the sequence paces the work rather than standing in for it.
 * It can be skipped at any point, and anyone who has asked for reduced motion is taken straight to
 * the end.
 */
export function BuildSequence({ sizing, saving, onDone }: { sizing: SizingResult; saving: boolean; onDone: () => void }) {
  const [index, setIndex] = useState(0);
  const done = useRef(false);

  const steps = useMemo<Step[]>(() => {
    const pack = packOf(sizing.enclosure), cell = cellOf(pack);
    const finance = evaluateFinance(sizing, defaultPriceBook);
    const currency = defaultPriceBook.currency;
    // The price book's own rate for the currency it is written in, rather than its rupee rate
    // applied to whatever currency happens to be asked for.
    const rate = localRate(defaultPriceBook, currency);
    const capex = finance.capexUsd * rate;
    const perKWh = capex / Math.max(sizing.installedDcMWh * 1000, 1);
    const mwhPerUnit = sizing.installedDcMWh / Math.max(sizing.units, 1);
    return [
      {
        label: 'Duty cycle', title: 'Reading the duty cycle',
        detail: `A ${application(sizing.input.applicationId).name.toLowerCase()} plant discharging for ${hours(sizing.effectiveDurationH)} and charging back in ${hours(sizing.input.chargeDurationH)}. Those three numbers set everything that follows.`,
        value: sizing.ratedPowerMW, render: n => round(n, sizing.ratedPowerMW < 10 ? 2 : 1), unit: 'MW at the point of connection',
        rows: [
          ['Usable energy', `${round(sizing.requiredUsableMWh, sizing.requiredUsableMWh < 10 ? 2 : 1)} MWh`],
          ['Charge power', `${round(sizing.chargePowerMW, 2)} MW`],
          ['Cycles per day', `${sizing.input.cyclesPerDay}`],
          ['Round trip, AC', `${round(sizing.rteAc * 100, 1)} %`],
        ],
      },
      {
        label: 'Cells', title: 'Selecting the cells',
        detail: `${cell.model} in ${pack.series}S${pack.parallel}P packs. Depth of discharge, temperature and throughput are carried per cohort, so the fade is modelled rather than assumed.`,
        value: sizing.cells, render: n => round(n), unit: `cells across ${round(sizing.packs)} packs`,
        rows: [
          ['Chemistry', `${cell.chemistry} · ${cell.ah} Ah`],
          ['Strings', `${round(sizing.strings)} in parallel`],
          ['Pack rate', `${round(sizing.packCRate, 2)} C`],
          ['Cell temperature', `${round(sizing.cellTempC, 1)} °C`],
        ],
      },
      {
        label: 'Enclosure', title: 'Assembling the enclosure',
        detail: `${sizing.enclosure.model}, ${sizing.enclosure.racks} racks of ${sizing.enclosure.packsPerRack}, ${sizing.enclosure.cooling}-cooled. Busbars, coolant loop and the envelope close around the racks.`,
        value: mwhPerUnit, render: n => round(n, 2), unit: 'MWh installed per enclosure',
        rows: [
          ['Enclosure', sizing.enclosure.model],
          ['DC window', `${round(sizing.dcVoltageWindow[0])}–${round(sizing.dcVoltageWindow[1])} V`],
          ['Cooling', `${sizing.enclosure.cooling} · ${sizing.enclosure.ipRating}`],
          ['Auxiliaries', `${round(sizing.auxMWhPerDay / Math.max(sizing.units, 1), 2)} MWh/day each`],
        ],
      },
      {
        label: 'Plant', title: 'Laying out the plant',
        detail: `${sizing.units} enclosures with ${sizing.pcsCount} × ${round(sizing.pcs.ratedKW / 1000, 2)} MW conversion${sizing.transformer ? ` and ${sizing.transformerCount} × ${round(sizing.transformer.ratedKVA / 1000, 2)} MVA of transformation` : ''}. Augmentation is scheduled across the term, not bolted on at the end.`,
        value: sizing.units, render: n => round(n), unit: `enclosures · ${round(sizing.installedDcMWh, 1)} MWh installed`,
        rows: [
          ['Power conversion', `${sizing.pcsCount} × ${round(sizing.pcs.ratedKW / 1000, 2)} MW`],
          ['Footprint', `${round(sizing.footprintM2)} m²`],
          ['Mass', `${round(sizing.massTonnes)} t`],
          ['Augmentations', sizing.augmentations.length ? `${sizing.augmentations.length} over ${sizing.input.projectYears} years` : `None · ${round(sizing.endOfLifeRetention * 100)} % at year ${sizing.input.projectYears}`],
        ],
        note: sizing.units > MAX_DRAWN ? `Showing ${MAX_DRAWN} of ${sizing.units} enclosures.` : undefined,
      },
      {
        label: 'Costing', title: 'Pricing the plant',
        detail: 'Landed cost built up from FOB through freight, duty and clearance at the price book’s own exchange rate, then conversion, balance of plant and margin.',
        value: capex, render: n => formatMoney(n, currency, true), unit: 'day-one capital cost, indicative',
        rows: [
          ['Per kWh installed', formatMoney(perKWh, currency)],
          ['Levelised storage cost', `${formatMoney(finance.lcosPerMWhUsd * rate, currency)} / MWh`],
          ['Day-one usable', `${round(sizing.day1UsableMWh, 2)} MWh`],
          ['Lifetime throughput', `${round(sizing.lifetimeThroughputMWh)} MWh`],
        ],
      },
    ];
  }, [sizing]);

  // The clock is checked rather than chained, so a backgrounded tab resumes at the right step.
  useEffect(() => {
    const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) { setIndex(STAGE_COUNT - 1); done.current = true; onDone(); return; }
    const t0 = performance.now();
    const timer = window.setInterval(() => {
      const at = Math.floor((performance.now() - t0) / STAGE_MS);
      setIndex(Math.min(STAGE_COUNT - 1, at));
      if (at >= STAGE_COUNT && !done.current) { done.current = true; onDone(); }
    }, 90);
    return () => window.clearInterval(timer);
  }, [onDone]);

  const skip = () => { if (!done.current) { done.current = true; setIndex(STAGE_COUNT - 1); onDone(); } };
  const step = steps[Math.min(index, steps.length - 1)];
  const shown = useCountUp(step.value, index);

  return (
    <div className="l-build">
      <BuildScene sizing={sizing} className="l-build-canvas" />
      <div className="l-build-veil" />

      <div className="l-build-top">
        <span className="l-label">Step 02 · Building</span>
        <span className="l-build-spacer" />
        <button className="l-build-skip" onClick={skip}>Skip <ArrowRight size={13} /></button>
      </div>

      <div className="l-build-body">
        <div className="l-build-copy" key={`c${index}`}>
          <div className="l-label">{`0${index + 1}`} / {`0${STAGE_COUNT}`} · {step.label}</div>
          <h2 className="l-build-title">{step.title}</h2>
          <p className="l-build-detail">{step.detail}</p>
        </div>
        <div className="l-build-figures" key={`f${index}`}>
          <b className="l-build-headline">{step.render(shown)}</b>
          <span className="l-label l-build-unit">{step.unit}</span>
          <div className="l-build-rows">
            {step.rows.map(([k, v]) => (
              <div key={k}><span className="l-label">{k}</span><b>{v}</b></div>
            ))}
          </div>
          {step.note && <span className="l-label l-build-note">{step.note}</span>}
        </div>
      </div>

      <div className="l-build-rail">
        {steps.map((s, i) => (
          <div key={s.label} className={i < index ? 'past' : i === index ? 'now' : ''}>
            <i style={{ animationDuration: `${STAGE_MS}ms` }} />
            <span className="l-label">{s.label}</span>
          </div>
        ))}
      </div>

      <p className="l-build-foot">
        {saving ? 'Writing the project to your workspace…' : 'Ready — opening the workbench.'}
        <span> · {brand.credit}</span>
      </p>
    </div>
  );
}
