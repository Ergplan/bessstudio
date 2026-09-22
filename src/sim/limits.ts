import { ocv, resistanceAt } from './battery';
import type { CellParameters, Converter, PlantConfiguration } from './records';

/**
 * Who is allowed to stop the plant, and why.
 *
 * Every limit is expressed as a ceiling on **one cell's current**, because that is the one
 * quantity all of them can be compared in: a converter's kilowatt rating, its DC current limit,
 * the BMS's own limit, a cell voltage cutoff and a state-of-charge floor are otherwise four
 * different units arguing past each other. The lowest ceiling wins and its name is reported, which
 * is what §12.1 means by "name the binding constraint, every time".
 *
 * §12.3 is explicit that the converter's capability circle alone is not enough — a real converter
 * is usually bounded tighter by current at low DC voltage — so the current limit and the DC window
 * are separate ceilings here rather than being folded into the power rating.
 *
 * The state-of-charge ceiling deserves its own note. It is computed from where the step would
 * *end*, not from where it starts, because a limit checked only at the start of a step is a limit
 * a long step walks straight through. §13.1 names that specific failure: a solver that steps past
 * a protection limit and returns a legal-looking endpoint has silently broken the thing the model
 * exists to show.
 */

export type Limit = {
  /** Which subsystem owns this ceiling. */
  by: 'PCS' | 'BMS' | 'grid' | 'battery' | 'EMS';
  /** A name a reader recognises, shown as the binding constraint. */
  name: string;
  /** The ceiling, as one cell's current in amps. Always non-negative. */
  cellCurrentA: number;
  /** Why, in the words the explanation uses. */
  reason: string;
};

export type PlantShape = {
  seriesCells: number;
  parallelStrings: number;
  totalCells: number;
};

/** How the topology multiplies out. One place, so no caller has to remember which way round it is. */
export const plantShape = (plant: PlantConfiguration): PlantShape => {
  const seriesCells = plant.cellTopology.series * plant.packTopology.series;
  const parallelStrings = plant.cellTopology.parallel * plant.packTopology.parallel;
  return { seriesCells, parallelStrings, totalCells: seriesCells * parallelStrings };
};

/** The converter's active power ceiling at a temperature, after the derating §12.3 requires. */
export function deratedRatingW(c: Converter, tempC: number): number {
  const over = Math.max(0, tempC - c.deratingStartC);
  return c.ratedW * Math.max(0, 1 - over * c.deratingPerC);
}

/**
 * The cell current that this DC power needs, at this state.
 *
 * The inverse of the terminal-voltage relation, and `null` where the power is beyond what the
 * cell can deliver at all — which is a fact the caller has to report, not paper over.
 */
function cellCurrentForCellPower(cell: CellParameters, soc: number, tempC: number, cellPowerW: number): number | null {
  const v0 = ocv(cell, soc), r = resistanceAt(cell, tempC);
  if (r <= 0) return cellPowerW / v0;
  const discriminant = v0 * v0 - 4 * r * cellPowerW;
  if (discriminant < 0) return null;
  return (v0 - Math.sqrt(discriminant)) / (2 * r);
}

export type LimitInput = {
  plant: PlantConfiguration;
  cell: CellParameters;
  shape: PlantShape;
  soc: number;
  tempC: number;
  stepSeconds: number;
  /** Where the EMS will not go below under the policy in force. */
  reserveSoc: number;
  /** The hard floor and ceiling on state of charge. */
  socFloor: number;
  socCeiling: number;
  /** True while the grid is absent: nothing may be imported or exported. */
  islanded: boolean;
  idealised: boolean;
};

/**
 * Every ceiling that applies in one direction, in the order a reader would ask about them.
 *
 * Both directions are built by the same function because the limits are the same limits — a
 * current limit does not become a different kind of thing because the current reversed — and
 * because §18 F02 exists to catch exactly the bug where a discharge formula is reused blindly on
 * charge. The direction changes which figure each ceiling is read from, never the structure.
 */
export function limitsFor(input: LimitInput, direction: 'charge' | 'discharge'): Limit[] {
  const { plant, cell, shape, soc, tempC, stepSeconds, socFloor, socCeiling, idealised } = input;
  const c = plant.converter;
  const discharging = direction === 'discharge';
  const out: Limit[] = [];

  // 1. What the BMS permits, before anything else asks.
  out.push({
    by: 'BMS', name: discharging ? 'BMS discharge current limit' : 'BMS charge current limit',
    cellCurrentA: discharging ? cell.limits.dischargeCurrentMaxA : cell.limits.chargeCurrentMaxA,
    reason: `The battery management system permits ${discharging ? cell.limits.dischargeCurrentMaxA : cell.limits.chargeCurrentMaxA} A per cell in this direction.`,
  });

  // 2. The cell voltage cutoff, and the converter's DC window, which are the same kind of bound
  //    read from two different numbers: whichever is the tighter is the one that binds.
  const v0 = ocv(cell, soc), r = resistanceAt(cell, tempC);
  const windowCellV = discharging ? c.dcMinV / shape.seriesCells : c.dcMaxV / shape.seriesCells;
  const cellCutoffV = discharging ? cell.minV : cell.maxV;
  const bindingV = discharging ? Math.max(cellCutoffV, windowCellV) : Math.min(cellCutoffV, windowCellV);
  const windowBinds = discharging ? windowCellV > cellCutoffV : windowCellV < cellCutoffV;
  if (r > 0) {
    out.push({
      by: windowBinds ? 'PCS' : 'BMS',
      name: windowBinds ? (discharging ? 'Converter DC window, lower' : 'Converter DC window, upper') : (discharging ? 'Cell minimum voltage' : 'Cell maximum voltage'),
      cellCurrentA: Math.max(0, discharging ? (v0 - bindingV) / r : (bindingV - v0) / r),
      reason: windowBinds
        ? `The converter stops operating outside ${c.dcMinV}–${c.dcMaxV} V across the string, which is ${(windowCellV).toFixed(3)} V a cell.`
        : `A cell may not be taken ${discharging ? 'below' : 'above'} ${cellCutoffV} V; it is at ${v0.toFixed(3)} V before any current flows.`,
    });
  } else if ((discharging && v0 <= bindingV) || (!discharging && v0 >= bindingV)) {
    // With no resistance the voltage does not move with current, so the cutoff is all or nothing.
    out.push({ by: 'BMS', name: discharging ? 'Cell minimum voltage' : 'Cell maximum voltage', cellCurrentA: 0, reason: `The cell is already at its ${discharging ? 'lower' : 'upper'} voltage limit.` });
  }

  // 3. The converter's own DC current limit, shared across the strings feeding it.
  out.push({
    by: 'PCS', name: 'Converter DC current limit',
    cellCurrentA: c.dcMaxA / shape.parallelStrings,
    reason: `The converter accepts ${c.dcMaxA} A on its DC side, shared across ${shape.parallelStrings} parallel strings.`,
  });

  // 4. The converter's active power rating, after temperature derating.
  const ratingW = deratedRatingW(c, tempC);
  const dcForRating = discharging ? ratingW / c.dischargeEfficiency : ratingW * c.chargeEfficiency;
  const perCellW = dcForRating / shape.totalCells;
  const iForRating = cellCurrentForCellPower(cell, soc, tempC, discharging ? perCellW : -perCellW);
  out.push({
    by: 'PCS', name: ratingW < c.ratedW ? 'Converter rating, derated' : 'Converter rating',
    cellCurrentA: iForRating === null ? Number.POSITIVE_INFINITY : Math.abs(iForRating),
    reason: ratingW < c.ratedW
      ? `The converter is derated to ${Math.round(ratingW / 1e3)} kW at ${tempC.toFixed(1)} °C, from ${Math.round(c.ratedW / 1e3)} kW.`
      : `The converter is rated ${Math.round(c.ratedW / 1e3)} kW.`,
  });

  // 5. What the grid will take or give, unless there is no grid.
  const gridW = input.islanded ? 0 : (discharging ? plant.gridExportLimitW : plant.gridImportLimitW);
  const gridDcW = discharging ? gridW / c.dischargeEfficiency : gridW * c.chargeEfficiency;
  const iForGrid = cellCurrentForCellPower(cell, soc, tempC, (discharging ? 1 : -1) * gridDcW / shape.totalCells);
  out.push({
    by: 'grid', name: input.islanded ? 'Islanded — no grid connection' : (discharging ? 'Site export limit' : 'Site import limit'),
    cellCurrentA: input.islanded ? 0 : (iForGrid === null ? Number.POSITIVE_INFINITY : Math.abs(iForGrid)),
    reason: input.islanded
      ? 'The grid is absent, so nothing may be imported or exported.'
      : `The connection is limited to ${Math.round(gridW / 1e3)} kW in this direction.`,
  });

  // 6. Where the step would end, not where it starts. This is the overshoot guard.
  //
  // Two of them, because there are two floors and they belong to different owners. The battery
  // management system's is the hard one: empty is empty. The policy's reserve sits above it and is
  // the energy being kept back for something — §15 lesson 4 is built on the difference, and an
  // outage lowers the second without touching the first.
  //
  // Both are evaluated here rather than only where the policy decides, because a floor checked
  // once per reporting step is a floor a long step walks straight through, and the reporting step
  // is the learner's choice of chart resolution rather than a statement about the physics.
  const efficiency = discharging || idealised ? 1 : cell.coulombicEfficiency;
  const currentForRoom = (room: number) => Math.max(0, room) * cell.capacityAh * 3600 / (stepSeconds * efficiency);

  out.push({
    by: 'BMS', name: discharging ? 'State of charge floor' : 'State of charge ceiling',
    cellCurrentA: currentForRoom(discharging ? soc - socFloor : socCeiling - soc),
    reason: discharging
      ? `${(soc * 100).toFixed(1)}% charge remains above the ${(socFloor * 100).toFixed(0)}% floor.`
      : `${((socCeiling - soc) * 100).toFixed(1)}% of the window remains below the ${(socCeiling * 100).toFixed(0)}% ceiling.`,
  });

  if (discharging && input.reserveSoc > socFloor) {
    out.push({
      by: 'EMS', name: 'Reserve held back',
      cellCurrentA: currentForRoom(soc - input.reserveSoc),
      reason: `The policy keeps ${(input.reserveSoc * 100).toFixed(0)}% of the battery in hand; the charge is at ${(soc * 100).toFixed(1)}%.`,
    });
  }

  return out;
}

/** The ceiling that binds, and the rest, sorted so the reader sees the tightest first. */
export function binding(limits: Limit[]): { limit: Limit; ordered: Limit[] } {
  const ordered = [...limits].sort((a, b) => a.cellCurrentA - b.cellCurrentA);
  return { limit: ordered[0], ordered };
}
