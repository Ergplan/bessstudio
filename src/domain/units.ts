/**
 * How a figure is written, at the scale it actually is.
 *
 * The studio was written for grid-scale plants and said so in every label: megawatts and
 * megawatt-hours, everywhere, whatever the number in front of them. A five-kilowatt backup supply
 * therefore read "0.01 MW" of rated power and "0.0 MWh" of contracted energy — the second of which
 * is not a rounding problem but a wrong answer, because the figure it is rounding is five
 * kilowatt-hours and the reader is told it is nothing.
 *
 * So the unit follows the number. Below a megawatt it is kilowatts; below a gigawatt-hour it stays
 * in megawatt-hours, because that is what the people reading a grid-scale design use. Nothing here
 * converts anything for the model: the engine works in MW and MWh throughout and always will. This
 * decides only what a person is shown.
 */

export type Scaled = { value: string; unit: string };

/** Enough figures to be useful at any size, without pretending to a precision the model has not got. */
const digits = (n: number) => (Math.abs(n) >= 100 ? 0 : Math.abs(n) >= 10 ? 1 : Math.abs(n) >= 1 ? 2 : 3);

const scaleOf = (mega: number, small: string, large: string) =>
  (mega !== 0 && Math.abs(mega) < 1 ? { factor: 1000, unit: small } : { factor: 1, unit: large });

const scaled = (mega: number, small: string, large: string): Scaled => {
  const { factor, unit } = scaleOf(mega, small, large), n = mega * factor;
  return { value: n.toLocaleString('en', { maximumFractionDigits: digits(n) }), unit };
};

/**
 * The multiplier and unit a figure should be written at.
 *
 * For the places that animate a number up to its value and cannot take it pre-formatted: they need
 * the scale before they have the number, and both have to be the same scale or the count runs to
 * five thousand and lands on "5 MWh".
 */
export const powerScale = (mw: number) => scaleOf(mw, 'kW', 'MW');
export const energyScale = (mwh: number) => scaleOf(mwh, 'kWh', 'MWh');
/** Figures worth showing for a number at this scale, matching what {@link power} would print. */
export const scaleDigits = digits;

/** Power, given in megawatts. Shown in kilowatts below one megawatt. */
export const power = (mw: number): Scaled => scaled(mw, 'kW', 'MW');

/** Energy, given in megawatt-hours. Shown in kilowatt-hours below one megawatt-hour. */
export const energy = (mwh: number): Scaled => scaled(mwh, 'kWh', 'MWh');

/** The same, as one string, for places that cannot take a value and a unit separately. */
export const powerText = (mw: number) => { const s = power(mw); return `${s.value} ${s.unit}`; };
export const energyText = (mwh: number) => { const s = energy(mwh); return `${s.value} ${s.unit}`; };
