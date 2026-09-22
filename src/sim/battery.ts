import type { CellParameters } from './records';

/**
 * The battery, as a first-order Thevenin equivalent circuit.
 *
 * One open-circuit voltage curve against state of charge, one series resistance, and coulomb
 * counting for the state itself. §13 sanctions exactly this fidelity as the interactive default
 * and is explicit that anything beyond it — diffusion, hysteresis, a full electrochemical model —
 * is a `GAP` and is not manufactured. Every function here takes **one cell** and the caller
 * multiplies by the topology, because the other half of the §13.3 trap is a cell figure used where
 * a pack figure belongs.
 *
 * The sign convention is the application's: **positive current is discharge**, out of the
 * terminals. It follows that the terminal voltage falls below the open-circuit voltage on
 * discharge and rises above it on charge, which is the thing lesson 1 exists to show.
 */

/**
 * Open-circuit voltage at a state of charge, linearly interpolated between the curve's points.
 *
 * Linear rather than a spline on purpose: a spline through a curve as flat as LFP's introduces
 * wiggles that are not in the data, and a learner reading a voltage off the plot would be reading
 * an artefact of the interpolation.
 */
export function ocv(cell: CellParameters, soc: number): number {
  const curve = cell.ocvCurve;
  const s = Math.min(1, Math.max(0, soc));
  if (s <= curve[0].soc) return curve[0].volts;
  if (s >= curve[curve.length - 1].soc) return curve[curve.length - 1].volts;
  for (let i = 1; i < curve.length; i++) {
    if (s <= curve[i].soc) {
      const a = curve[i - 1], b = curve[i];
      return a.volts + (b.volts - a.volts) * (s - a.soc) / (b.soc - a.soc);
    }
  }
  return curve[curve.length - 1].volts;
}

/** Series resistance of one cell at a temperature: higher when cold, by the stated coefficient. */
export const resistanceAt = (cell: CellParameters, tempC: number): number =>
  cell.resistanceOhm * (1 + cell.resistanceTempCoeff * Math.max(0, cell.referenceTempC - tempC));

/** Terminal voltage of one cell at a current. Falls below the open-circuit voltage on discharge. */
export const terminalVoltage = (cell: CellParameters, soc: number, currentA: number, tempC: number): number =>
  ocv(cell, soc) - currentA * resistanceAt(cell, tempC);

/**
 * The current that delivers a given DC power at the terminals.
 *
 * `V·I = P` with `V = OCV − I·R` is a quadratic in `I`, and the root that matters is the smaller
 * one: the same power can in principle be had at a high current and a collapsed voltage, but that
 * is the wrong side of the maximum-power point and no converter operates there.
 *
 * Returns `null` when the power is simply not available — beyond `OCV²/4R` the quadratic has no
 * real root, and a model that quietly returned the closest thing it could find would be hiding the
 * one fact the step needed to report.
 */
export function currentForPower(cell: CellParameters, soc: number, powerW: number, tempC: number): number | null {
  const v0 = ocv(cell, soc), r = resistanceAt(cell, tempC);
  if (r <= 0) return powerW / v0;
  const discriminant = v0 * v0 - 4 * r * powerW;
  if (discriminant < 0) return null;
  return (v0 - Math.sqrt(discriminant)) / (2 * r);
}

/** The most DC power one cell can deliver at this state, at the maximum-power point. */
export const maxPowerW = (cell: CellParameters, soc: number, tempC: number): number => {
  const v0 = ocv(cell, soc), r = resistanceAt(cell, tempC);
  return r > 0 ? v0 * v0 / (4 * r) : Number.POSITIVE_INFINITY;
};

/**
 * The state of charge after a current has flowed for a time.
 *
 * Coulomb counting, which §12.4 asks for by name as the transparent starting point, with the
 * coulombic efficiency applied on charge only: not every amp-hour pushed in comes back out, and
 * the shortfall is a loss inside the cell rather than a converter loss.
 */
export function socAfter(cell: CellParameters, soc: number, currentA: number, seconds: number): number {
  const ampHours = currentA * seconds / 3600;
  const accepted = currentA < 0 ? ampHours * cell.coulombicEfficiency : ampHours;
  return Math.min(1, Math.max(0, soc - accepted / cell.capacityAh));
}

/** Heat one cell generates at a current: ohmic, plus the charge it accepted and did not keep. */
export function heatW(cell: CellParameters, soc: number, currentA: number, tempC: number): number {
  const ohmic = currentA * currentA * resistanceAt(cell, tempC);
  const coulombic = currentA < 0 ? Math.abs(currentA) * ocv(cell, soc) * (1 - cell.coulombicEfficiency) : 0;
  return ohmic + coulombic;
}

/**
 * Cell temperature after a step: what it generated, less what it shed to its surroundings.
 *
 * A single representative cell with a lumped thermal mass, as §12.5 requires to be stated
 * honestly. There is no spatial resolution here and no claim of any: the spread between the
 * hottest and coldest cell in a real enclosure is a separately injected scenario, not something
 * this model produces.
 */
export function tempAfter(cell: CellParameters, tempC: number, generatedW: number, coolantC: number, seconds: number): number {
  const shed = (tempC - coolantC) / cell.thermalResistanceKPerW;
  const capacity = cell.massKg * cell.specificHeatJPerKgK;
  return tempC + (generatedW - shed) * seconds / capacity;
}

/** The state of charge at which the open-circuit voltage reaches a given cell voltage. */
export function socAtVoltage(cell: CellParameters, volts: number): number {
  const curve = cell.ocvCurve;
  if (volts <= curve[0].volts) return curve[0].soc;
  if (volts >= curve[curve.length - 1].volts) return curve[curve.length - 1].soc;
  for (let i = 1; i < curve.length; i++) {
    if (volts <= curve[i].volts) {
      const a = curve[i - 1], b = curve[i];
      return b.volts === a.volts ? a.soc : a.soc + (b.soc - a.soc) * (volts - a.volts) / (b.volts - a.volts);
    }
  }
  return curve[curve.length - 1].soc;
}

/**
 * A cell with every loss removed, for the analytic fixtures §14.1 asks for.
 *
 * Constant voltage, no resistance, no coulombic loss, and a flat curve so the energy in the store
 * is exactly the state of charge times the nameplate. Nothing else in the engine special-cases
 * the fixture mode; it is all done here, by handing the same functions a different cell.
 */
export const idealise = (cell: CellParameters): CellParameters => ({
  ...cell,
  resistanceOhm: 0,
  resistanceTempCoeff: 0,
  coulombicEfficiency: 1,
  ocvCurve: [{ soc: 0, volts: cell.nominalV }, { soc: 1, volts: cell.nominalV }],
});
