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

const scaled = (mega: number, small: string, large: string): Scaled => {
  if (mega === 0) return { value: '0', unit: large };
  if (Math.abs(mega) < 1) {
    const kilo = mega * 1000;
    return { value: kilo.toLocaleString('en', { maximumFractionDigits: digits(kilo) }), unit: small };
  }
  return { value: mega.toLocaleString('en', { maximumFractionDigits: digits(mega) }), unit: large };
};

/** Power, given in megawatts. Shown in kilowatts below one megawatt. */
export const power = (mw: number): Scaled => scaled(mw, 'kW', 'MW');

/** Energy, given in megawatt-hours. Shown in kilowatt-hours below one megawatt-hour. */
export const energy = (mwh: number): Scaled => scaled(mwh, 'kWh', 'MWh');

/** The same, as one string, for places that cannot take a value and a unit separately. */
export const powerText = (mw: number) => { const s = power(mw); return `${s.value} ${s.unit}`; };
export const energyText = (mwh: number) => { const s = energy(mwh); return `${s.value} ${s.unit}`; };
