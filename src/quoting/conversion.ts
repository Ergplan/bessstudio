import { defaultSizingInput, type SizingInput } from '../sizing/engine';
import { backupDurations, contractDemands, protectedShares, requirementFrom, defaultAssumptions, type UpsOption } from '../sim/ups';

/**
 * From a lesson to a design.
 *
 * §17.2 asks S11 for the learning-to-design conversion, and the interesting part of it is what must
 * **not** survive the journey. A lesson runs on a teaching plant with illustrative parameters and a
 * scenario chosen to make one thing visible. A design is a proposal about a site. So the conversion
 * carries the *duty* — the power, the duration, the protected load — and leaves the teaching plant
 * behind, and it records where each figure came from so nobody later mistakes a lesson's default
 * for a site's measurement.
 */

export type ConversionSource = {
  lessonId: string;
  lessonLabel: string;
  /** Exactly what the learner had set when they pressed it. */
  values: Record<string, number>;
};

export type Conversion = {
  input: SizingInput;
  /** What each figure in the design came from, so it can be checked rather than believed. */
  provenance: { field: string; value: string; from: string }[];
  /** What the learner still has to supply before this is a proposal about anywhere. */
  outstanding: string[];
};

/**
 * The duty a lesson was exploring, as a sizing input.
 *
 * Nothing about the teaching plant comes across: not its enclosure, not its converter, not its
 * cell. What comes across is what the learner decided — how much power, for how long — because
 * that is the only part of a lesson that is about their site rather than about the model.
 */
export function designFromLesson(source: ConversionSource): Conversion {
  const base = defaultSizingInput();
  const provenance: Conversion['provenance'] = [];
  const outstanding = [
    'The site: where it is, what it is connected at, and what the ambient conditions actually are.',
    'A measured load profile or an approved schedule of protected loads, which replaces anything estimated here.',
    'Equipment selection reviewed against data sheets rather than taken from a teaching preset.',
  ];

  if (source.lessonId === 'lesson-7') {
    // The UPS lesson carries a duty that is already expressed the way a design needs it.
    const contract = contractDemands[Math.round(source.values.contract ?? 2)] ?? 500;
    const share = protectedShares[Math.round(source.values.share ?? 1)] ?? 0.5;
    const minutes = backupDurations[Math.round(source.values.duration ?? 1)] ?? 15;
    const requirement = requirementFrom({
      contract: { value: contract, unit: 'kVA' }, protectedFraction: share,
      durationMinutes: minutes, assumptions: defaultAssumptions(),
    });
    const powerMW = requirement.requiredKW / 1000;
    const durationH = minutes / 60;
    provenance.push(
      { field: 'Power', value: `${powerMW.toFixed(3)} MW`, from: `${contract} kVA of contract demand at ${(share * 100).toFixed(0)}% protected, with 20% headroom. An estimate from contract demand, not a measurement.` },
      { field: 'Duration', value: `${durationH.toFixed(2)} h`, from: `The ${minutes}-minute backup duration chosen in the lesson.` },
      { field: 'Cycles per day', value: '1', from: 'A backup duty is not a cycling duty. One cycle a day is a placeholder until the site’s own outage pattern replaces it.' },
    );
    outstanding.push('The outage pattern this site actually sees, which decides the cycling and the readiness between events.');
    return {
      input: {
        ...base, applicationId: 'backup-power', mode: 'power-duration',
        powerMW, durationH, usableEnergyMWh: powerMW * durationH, chargeDurationH: Math.max(durationH, 2),
        cyclesPerDay: 1, daysPerYear: 250, dod: 0.9,
      },
      provenance, outstanding,
    };
  }

  // Every other lesson runs the teaching plant, so what converts is the power and the duration the
  // learner was asking of it, and nothing else.
  const powerW = Math.abs(source.values.power ?? 1_000_000);
  const powerMW = powerW / 1e6;
  const durationH = 2;
  provenance.push(
    { field: 'Power', value: `${powerMW.toFixed(3)} MW`, from: `The power asked of the plant in ${source.lessonLabel}.` },
    { field: 'Duration', value: `${durationH} h`, from: 'The teaching scenario’s own two hours. A duty the site can state replaces it.' },
  );
  return {
    input: { ...base, mode: 'power-duration', powerMW, durationH, usableEnergyMWh: powerMW * durationH },
    provenance, outstanding,
  };
}

/** What a converted design may be called, and what it may not. */
export const conversionCaveat =
  'This design was started from a lesson. Its duty came from what was explored there and its equipment from the catalogue defaults — neither is a proposal about a site until somebody has checked both against it.';

/** A UPS option, restated as the equipment note that travels with a converted design. */
export const equipmentNote = (option: UpsOption | null) =>
  option
    ? `Indicative configuration from the lesson: ${option.enclosureCount} × ${option.enclosure.model} with ${option.pcsCount} × ${option.pcs.model}. Illustrative, and not a reviewed selection.`
    : 'No configuration was selected in the lesson, so none travels with this design.';
