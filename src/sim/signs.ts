import type { Watts, Vars } from './units';

/**
 * One sign convention, and an adapter for every library that disagrees with it.
 *
 * §13.3 names the specific hazard: pandapower's storage element takes **positive power for
 * charging**, which is the opposite of what most people assume. A model that mixes the two
 * conventions charges when it meant to discharge and still balances its own books.
 *
 * **The application convention, everywhere inside this engine:**
 *
 * | Quantity | Positive means | Negative means |
 * | --- | --- | --- |
 * | Active power `P` | the battery is **discharging** — energy leaves it | the battery is charging |
 * | Reactive power `Q` | the plant **supplies** vars to the grid (leading at the point of connection) | the plant absorbs vars |
 * | Battery current `I` | discharge current, out of the terminals | charge current, into them |
 *
 * Energy figures are unsigned and name their direction and their boundary instead, because
 * "150 MWh" with a sign and no boundary is exactly the ambiguity §12.2 is written against.
 *
 * Every crossing into a library goes through an adapter here, and every adapter is tested in both
 * directions. Nothing multiplies by −1 anywhere else.
 */
export const signConvention = Object.freeze({
  activePower: 'positive = discharging (energy leaving the battery)',
  reactivePower: 'positive = supplying vars to the grid',
  batteryCurrent: 'positive = discharge current out of the terminals',
  energy: 'unsigned; direction and boundary are named alongside',
});

export type Direction = 'charge' | 'discharge' | 'idle';

/** Which way a signed power is going, with a dead band so numerical dust does not read as dispatch. */
export const directionOf = (p: Watts, deadBandW = 1e-9): Direction =>
  (p > deadBandW ? 'discharge' : p < -deadBandW ? 'charge' : 'idle');

/** A signed power from an unsigned magnitude and a direction. */
export const signed = (magnitudeW: number, direction: Direction): Watts =>
  (direction === 'discharge' ? Math.abs(magnitudeW) : direction === 'charge' ? -Math.abs(magnitudeW) : 0) as Watts;

/** The magnitude, with the sign discarded — for anywhere that reports a rate rather than a flow. */
export const magnitude = (p: Watts): number => Math.abs(p);

/* ------------------------------------------------------------- adapters ---- */

/**
 * pandapower's storage element: **positive is charging**, the opposite of ours.
 *
 * Both directions are exported and both are tested, because an adapter that is only ever exercised
 * one way is an adapter that is only right one way.
 */
export const toPandapowerStorageP = (p: Watts): number => -(p as number);
export const fromPandapowerStorageP = (p: number): Watts => -p as Watts;

/**
 * PyBaMM's current convention agrees with ours — positive current is discharge — so the adapter is
 * the identity. It exists anyway: an identity adapter that is named and tested is a decision on
 * the record, and a bare absence is not.
 */
export const toPyBammCurrent = (i: number): number => i;
export const fromPyBammCurrent = (i: number): number => i;

/**
 * PySAM's battery power is positive on discharge, as ours is. Same reasoning as above.
 */
export const toPySamPower = (p: Watts): number => p as number;
export const fromPySamPower = (p: number): Watts => p as Watts;

/** Reactive power: pandapower's storage q_mvar is positive for absorption, the reverse of ours. */
export const toPandapowerStorageQ = (q: Vars): number => -(q as number);
export const fromPandapowerStorageQ = (q: number): Vars => -q as Vars;

/** Every adapter, named, so a test can walk them rather than trusting a list written by hand. */
export const adapters = [
  { library: 'pandapower', quantity: 'storage active power', flips: true, to: toPandapowerStorageP, from: fromPandapowerStorageP },
  { library: 'pandapower', quantity: 'storage reactive power', flips: true, to: toPandapowerStorageQ, from: fromPandapowerStorageQ },
  { library: 'PyBaMM', quantity: 'cell current', flips: false, to: toPyBammCurrent, from: fromPyBammCurrent },
  { library: 'PySAM', quantity: 'battery power', flips: false, to: toPySamPower, from: fromPySamPower },
] as const;
