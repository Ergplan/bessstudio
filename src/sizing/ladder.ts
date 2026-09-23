import type { SizingResult } from './engine';
import { energyCascade } from './cascade';
import { enclosureEnergyKWh } from '../catalog/products';
import { publishedContainerLadder } from '../catalog/sources';

/**
 * What a duty would cost in whole containers, rung by rung.
 *
 * Containers are not made to order. A 20 ft battery container is a standard product off a
 * manufacturer's catalogue: you pick a rung and buy whole units of it, and no amount of design
 * effort gets you a 5.4 MWh container because nobody builds one. So the honest answer to "why does
 * 5 MWh of duty buy two containers?" is not a sentence about rounding — it is this ladder, showing
 * what every rung on the market would do with the same duty. Sometimes the answer is that a larger
 * rung fixes it. More often, at the sizes this catalogue quotes, it does not: the gap between a
 * nameplate and what reaches the meter is about a fifth of the nameplate plus the auxiliaries, so a
 * duty that lands just over a rung stays just over the next one too.
 *
 * Everything here is derived from the same cascade the studio already shows. Nothing is priced:
 * these are nameplates published by manufacturers, recorded with their provenance in
 * `src/catalog/sources.ts`, and a rung that is not in the catalogue cannot be quoted — only used to
 * answer the question of whether a different container would have been a better buy.
 */
export type LadderRung = {
  nameplateKWh: number;
  label: string;
  publisher: string;
  /** How far this figure is from a data sheet in our hands. */
  evidence: 'catalogue' | 'published' | 'announced';
  /** What one unit of this rung delivers at the connection, on this duty, at the design year. */
  deliverableKWh: number;
  /** Whole units of it the duty needs. */
  units: number;
  installedKWh: number;
  /** Installed nameplate against what the duty strictly asks for. 0.38 is 38% more than needed. */
  sparePortion: number;
  /** True for the rung the design actually uses. */
  isCatalogue: boolean;
};

export type Ladder = {
  requiredKWh: number;
  atYear: number;
  rungs: LadderRung[];
  /** The smallest published nameplate that would do this duty in a single container, if any does. */
  singleUnitAtKWh: number | null;
  /**
   * The nameplate that would exactly meet the duty in one unit — the number a manufacturer would
   * have to build to. Reported because it is what makes "buy a bigger container" answerable: if it
   * sits above every rung on the market, the fleet is right and the container is not the problem.
   */
  singleUnitNeedsKWh: number;
};

/**
 * The deliverable-per-unit line, refitted to a different nameplate.
 *
 * The cascade's multiplicative steps — retention, window, depth of discharge, the discharge path —
 * are properties of the cells and the circuit, so they carry across a change of container size
 * unchanged. The auxiliaries do not: cooling, controls and fire detection scale with the size of
 * the box and the number of cells in it, so they are scaled with the nameplate rather than held
 * flat. That is an assumption, and it is the conservative one — holding auxiliary draw flat while
 * the box grows would make every larger rung look better than it is.
 */
const deliverableAt = (nameplateKWh: number, perKWhFactor: number, auxPerKWh: number) =>
  Math.max(0, nameplateKWh * (perKWhFactor - auxPerKWh));

/**
 * The year the fleet is sized against, which is not day one.
 *
 * A plant that augments periodically is built to meet the duty at the end of its first year, when
 * the cells have already lost a little; one that oversizes on day one is built to meet it in the
 * final year. Comparing rungs at day one instead would quietly buy a container less than the
 * engine does, and the ladder would be answering a different question from the quotation.
 */
export const designYear = (s: SizingResult) =>
  s.input.augmentation === 'oversize-day1' ? s.input.projectYears : 1;

export function containerLadder(s: SizingResult, year?: number): Ladder {
  const atYear = year ?? designYear(s);
  const c = energyCascade(s, atYear);
  const ours = enclosureEnergyKWh(s.enclosure);
  // Split the cascade into the part that scales with nameplate and the part that is the auxiliaries,
  // so both can be refitted to another nameplate. `aux` is the only subtractive step.
  const auxStep = c.steps.find(st => st.id === 'aux')!;
  const auxKWh = auxStep.fromKWh - auxStep.toKWh;
  const beforeAuxPerKWh = auxStep.fromKWh / ours;
  const auxPerKWh = auxKWh / ours;
  const perKWh = beforeAuxPerKWh - auxPerKWh;

  const requiredKWh = s.requiredUsableMWh * 1000;
  // The rung the design is standing on is the design's own enclosure, taken from the catalogue
  // rather than from the register's transcription of it: the register rounds 5.015 MWh to a label,
  // and a ladder that disagreed with the quotation by a kilowatt-hour would be a second opinion.
  const rungs: LadderRung[] = publishedContainerLadder.map(r => {
    const isCatalogue = r.evidence === 'catalogue';
    const nameplateKWh = isCatalogue ? ours : r.nameplateKWh;
    const deliverableKWh = deliverableAt(nameplateKWh, beforeAuxPerKWh, auxPerKWh);
    const units = deliverableKWh > 0 ? Math.ceil(requiredKWh / deliverableKWh - 1e-9) : Number.POSITIVE_INFINITY;
    return {
      nameplateKWh, publisher: isCatalogue ? `${s.enclosure.model} — this catalogue` : r.publisher,
      label: isCatalogue ? `${(nameplateKWh / 1000).toFixed(3).replace(/0+$/, '').replace(/\.$/, '')} MWh` : r.label,
      evidence: r.evidence, deliverableKWh, units, installedKWh: units * nameplateKWh,
      sparePortion: units * deliverableKWh / requiredKWh - 1,
      isCatalogue,
    };
  }).sort((a, b) => a.nameplateKWh - b.nameplateKWh);

  const single = rungs.find(r => r.units <= 1) ?? null;
  return {
    requiredKWh, atYear, rungs,
    singleUnitAtKWh: single ? single.nameplateKWh : null,
    // Invert the same line: the nameplate whose deliverable equals the requirement exactly.
    singleUnitNeedsKWh: perKWh > 0 ? requiredKWh / perKWh : Number.POSITIVE_INFINITY,
  };
}
