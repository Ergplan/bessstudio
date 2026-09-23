import type { SizingResult } from './engine';
import { retentionFromTable, retentionAt, cellTemperature, temperatureFactor } from './engine';
import { packOf, cellOf, enclosureEnergyKWh } from '../catalog/products';

/**
 * Where a container's nameplate goes on its way to the meter.
 *
 * The studio could state the answer and could explain how many enclosures it took, and a reader
 * still had to take the factors between them on trust. They are the whole argument: the arithmetic
 * is one line, and anybody can check it in thirty seconds once they can see the five numbers going
 * into it. What they cannot do is discover, from a finished figure, that the usable window is a BMS
 * setting somebody chose, that the depth of discharge is a contract term rather than a property of
 * the cell, or that retention at year twenty is warranted rather than measured because nobody has a
 * twenty-year measurement of a three-year-old cell.
 *
 * So each step carries not only its factor but who is in a position to settle it and what document
 * does. The same descriptions drive the screen and `docs/VERIFICATION.md`, so a buyer reading the
 * pack and an engineer reading the workbench are looking at one set of claims.
 */
export type CascadeStep = {
  id: string;
  /** What this step takes away, as a heading. */
  label: string;
  /** The multiplier, or null for the starting nameplate and for the auxiliary subtraction. */
  factor: number | null;
  /** Energy entering and leaving this step, per enclosure, in kWh. */
  fromKWh: number;
  toKWh: number;
  /** Why the energy left. One sentence, for somebody checking the design. */
  detail: string;
  /** Who is in a position to settle this number — not the studio, in every case but the last. */
  settledBy: string;
  /** The document that settles it, named so it can be asked for. */
  evidence: string;
  /** How far this figure is from a measurement today. */
  provenance: 'supplied' | 'indicative' | 'assumed' | 'decision' | 'computed';
};

export type Cascade = {
  /** One enclosure, because that is the thing with a nameplate on it. */
  nameplateKWh: number;
  steps: CascadeStep[];
  /** What one enclosure delivers at the meter, after everything above. */
  deliverableKWh: number;
  /** And the whole fleet, which is the figure the contract is written against. */
  fleetDeliverableKWh: number;
  units: number;
  /** Hours the fleet runs at rated power, which is the claim a reader wants to check. */
  hoursAtRatedPower: number;
  atYear: number;
  retention: number;
};

/** Capacity retention at a given year, on whichever basis the design is using. */
export const retentionAtYear = (s: SizingResult, year: number): number => {
  if (year <= 0) return 1;
  if (s.input.degradation.mode === 'table') return retentionFromTable(year, s.input.degradation.retention);
  const cell = cellOf(packOf(s.enclosure));
  return retentionAt(year, s.efcPerYear, cell, temperatureFactor(cellTemperature(s.input.ambientC, s.enclosure.cooling)));
};

/**
 * The nameplate of one enclosure, taken down to what the fleet delivers at the meter in a given
 * year. Mirrors `usableAc` inside the engine exactly, in the order the losses are met.
 */
export function energyCascade(s: SizingResult, atYear = 0): Cascade {
  const enc = s.enclosure, pack = packOf(enc), cell = cellOf(pack), L = s.input.losses;
  const nameplateKWh = enclosureEnergyKWh(enc);
  const retention = retentionAtYear(s, atYear);
  const auxKWh = enc.auxMWhPerDayDischarge * L.auxScale * 1000 / Math.max(s.input.cyclesPerDay, 1);
  const steps: CascadeStep[] = [];
  let at = nameplateKWh;
  const take = (id: string, label: string, factor: number | null, to: number,
    detail: string, settledBy: string, evidence: string, provenance: CascadeStep['provenance']) => {
    steps.push({ id, label, factor, fromKWh: at, toKWh: to, detail, settledBy, evidence, provenance });
    at = to;
  };

  take('retention', atYear <= 0 ? 'Capacity, as built' : `Capacity remaining, year ${atYear}`,
    atYear <= 0 ? null : retention, nameplateKWh * retention,
    atYear <= 0 ? `${pack.model} packs, ${cell.model} cells, at the nameplate the schedule states.`
      : `The cells have lost ${((1 - retention) * 100).toFixed(1)}% of their capacity by the end of year ${atYear}.`,
    atYear <= 0 ? 'The cell maker, then whoever assembles the container'
      : 'Nobody, in advance — this one is warranted rather than measured',
    atYear <= 0 ? 'Cell data sheet and the container bill of materials, so the cell count multiplies out. Capacity per IEC 62620.'
      : 'The supplier’s guaranteed capacity curve year by year, with its conditions and its remedy. Cycle-life evidence per IEC 61427-2.',
    atYear <= 0 ? cell.provenance : 'indicative');

  take('window', 'Usable state-of-charge window', L.usableDcWindow, at * L.usableDcWindow,
    `The BMS holds ${((1 - L.usableDcWindow) * 100).toFixed(0)}% back at the top and bottom of the range, where a cell ages fastest.`,
    'The battery management system’s configuration — the integrator',
    'The BMS parameter sheet, or a written statement of usable energy against nameplate. This is a setting, not a property: it can be read off a commissioned system.',
    'indicative');

  take('dod', 'Depth of discharge', s.input.dod, at * s.input.dod,
    `The duty uses ${(s.input.dod * 100).toFixed(0)}% of that window in a cycle. Deeper is more energy and shorter life.`,
    'Whoever writes the contract',
    'Nothing — it is a decision, and it belongs in the performance annexure beside the warranty it trades against.',
    'decision');

  take('path', 'Conversion and cable losses', s.dischargePathEfficiency, at * s.dischargePathEfficiency,
    `DC cable ${(L.dcCableLoss * 100).toFixed(2)}%, converter ${(L.pcsLoss * 100).toFixed(2)}%, AC cable ${(L.acCableLoss * 100).toFixed(2)}%${s.transformer && L.idtOnDischarge ? `, transformer ${(L.idtLoss * 100).toFixed(2)}%` : ''} — measured at the connection, not at the terminals.`,
    'The converter and transformer makers, plus whoever sized the cable',
    'Converter efficiency curve per IEC 61683, weighted per EN 50530 · transformer routine test per IEC 60076-1, no-load and load loss · the cable calculation for the run actually installed.',
    'indicative');

  take('aux', 'Auxiliaries', null, Math.max(0, at - auxKWh),
    `${auxKWh.toFixed(0)} kWh a cycle for cooling, controls and communications${s.input.cyclesPerDay < 1 ? ` — a whole day’s worth, because the plant cycles ${s.input.cyclesPerDay} times a day and the cooling runs anyway` : ''}.`,
    'The integrator — and this is the term most often left outside the fence',
    'The thermal management rating and a heat balance at the site’s design ambient. Ask whether a quoted round-trip efficiency is measured inside or outside the auxiliaries; it moves the answer by points.',
    enc.provenance);

  const deliverableKWh = at;
  const fleetDeliverableKWh = deliverableKWh * s.units;
  return {
    nameplateKWh, steps, deliverableKWh, fleetDeliverableKWh, units: s.units,
    hoursAtRatedPower: fleetDeliverableKWh / Math.max(s.ratedPowerMW * 1000, 1e-9),
    atYear, retention,
  };
}
