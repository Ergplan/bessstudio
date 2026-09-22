import { agmBlock, blocksFor, dayOfOutages, energyWhPerBlock, floatLifeYears, rechargeMinutes, vrlaApplicability, type OutageEvent, type VrlaBlock } from './vrla';
import { defaultAssumptions, optionsFor, requirementFrom, stringVoltage, type UpsAssumptions, type UpsOption, type UpsRequirement } from './ups';
import { lfpParameterSet } from './presets';
import { plantShape } from './limits';
import { plantFromOption } from './lessons';

/**
 * Lead-acid against lithium, for the same service.
 *
 * §15.4's rule, and the only one that makes a comparison mean anything: **compare equal service,
 * not equal labels.** Both options carry the same protected load for the same autonomy, each sized
 * against its own discharge curves and its own limits, and equal amp-hours or equal nominal
 * kilowatt-hours is explicitly not the same thing.
 *
 * Neither result is forced. A conditioned room with one short outage a month is a case lead-acid
 * can win on installed cost; repeated outages and constrained space is a case lithium can win. The
 * comparison reports whichever came out, with the assumptions that produced it.
 */

export type ChemistryOption = {
  chemistry: 'VRLA' | 'LFP';
  label: string;
  /** Feasible means: it can be configured for this duty from data inside its model's bounds. */
  feasible: boolean;
  installedEnergyKWh: number;
  /** What the configuration physically is, in the units that chemistry is bought in. */
  units: string;
  /** Blocks, for the lead-acid case, so a later run tests the equipment that was sized here. */
  blocks?: number;
  massKg: number;
  footprintM2: number;
  dcVolts: number;
  /** Autonomy at the start of life and at the end-of-life acceptance threshold. */
  autonomyMinutes: number | null;
  endOfLifeAutonomyMinutes: number | null;
  /** Time to bring it back to full on the site power available. */
  rechargeMinutesToFull: number | null;
  /** Service life under the operating conditions given. */
  serviceLifeYears: number | null;
  notes: string[];
};

export type ChemistryComparison = {
  protectedKW: number;
  autonomyMinutes: number;
  tempC: number;
  options: ChemistryOption[];
  /** Everything that has to change between the two, which is never nothing. §15.4. */
  differences: string[];
  disclosures: string[];
};

/** Floor area including the clearance a battery room actually needs around it. */
const CLEARANCE = 1.6;

/** End-of-life acceptance threshold. Both chemistries are held to the same one. */
export const END_OF_LIFE_FRACTION = 0.8;

function vrlaOption(
  block: VrlaBlock, protectedKW: number, minutes: number, tempC: number, a: UpsAssumptions, chargerCPerHour: number,
): ChemistryOption {
  const sized = blocksFor(block, protectedKW, minutes, tempC, a.pathEfficiency, a.startSoc - a.minSoc);
  const notes: string[] = [];
  if (sized.value === null) {
    return {
      chemistry: 'VRLA', label: block.model, feasible: false, installedEnergyKWh: 0, units: '—',
      massKg: 0, footprintM2: 0, dcVolts: 0, autonomyMinutes: null, endOfLifeAutonomyMinutes: null,
      rechargeMinutesToFull: null, serviceLifeYears: null,
      notes: [sized.note, 'No configuration is offered, because the model this would be sized from does not cover the duty asked of it.'],
    };
  }
  notes.push(sized.note);
  const { blocks, blocksPerString, strings, stringVolts, energyKWh } = sized.value;
  const recharge = rechargeMinutes(block, a.minSoc, 1, chargerCPerHour);
  const life = floatLifeYears(block, tempC);
  notes.push(recharge.note, life.note);
  notes.push(`Sized against its own constant-power curve at ${minutes} minutes, not from the ${block.ratedAh20h} Ah label: at this rate a block gives a fraction of its twenty-hour rating, and that fraction is what the count is built on.`);
  notes.push('Valve-regulated cells need no watering. They do need inspection, torque checks, ventilation and a charger matched to them.');

  return {
    chemistry: 'VRLA', label: block.model, feasible: true,
    installedEnergyKWh: energyKWh,
    units: `${strings} string(s) of ${blocksPerString} × ${block.model}`,
    blocks,
    massKg: blocks * block.massKg,
    footprintM2: blocks * block.widthM * block.depthM * CLEARANCE,
    dcVolts: stringVolts,
    autonomyMinutes: minutes,
    // At the end-of-life threshold the same blocks carry proportionally less.
    endOfLifeAutonomyMinutes: minutes * END_OF_LIFE_FRACTION,
    rechargeMinutesToFull: recharge.value,
    serviceLifeYears: life.value,
    notes,
  };
}

function lfpOption(
  option: UpsOption | undefined, req: UpsRequirement, minutes: number, tempC: number, a: UpsAssumptions, chargerCPerHour: number,
): ChemistryOption {
  if (!option) {
    return {
      chemistry: 'LFP', label: 'UPS-compatible LFP', feasible: false, installedEnergyKWh: 0, units: '—',
      massKg: 0, footprintM2: 0, dcVolts: 0, autonomyMinutes: null, endOfLifeAutonomyMinutes: null,
      rechargeMinutesToFull: null, serviceLifeYears: null,
      notes: ['Nothing in the catalogue meets this duty, so no lithium configuration is offered rather than an invented one.'],
    };
  }
  const notes: string[] = [];
  const plant = plantFromOption(option);
  const shape = plantShape(plant);
  const cell = lfpParameterSet.cell;
  const usableKWh = option.energyKWh * (a.startSoc - a.minSoc) * a.retainedCapacity;
  const drawKW = req.protectedKW / a.pathEfficiency;
  const autonomy = (usableKWh / drawKW) * 60;

  // The short-duration limit §15.4 insists on: a lithium pack has a current ceiling as well as an
  // energy one, and at five minutes it is the ceiling that decides, not the kilowatt-hours.
  const permittedW = cell.limits.dischargeCurrentMaxA * cell.nominalV * shape.totalCells;
  const currentBound = permittedW < drawKW * 1000;
  if (currentBound) {
    notes.push(`The pack's own discharge current limit permits ${(permittedW / 1000).toFixed(0)} kW, below the ${drawKW.toFixed(0)} kW this duty draws — so more installed energy is needed than the kilowatt-hours alone suggest.`);
  } else {
    notes.push(`The pack's discharge current limit permits ${(permittedW / 1000).toFixed(0)} kW against the ${drawKW.toFixed(0)} kW this duty draws, so the current ceiling is not what decides here.`);
  }
  notes.push('Not all lithium-ion is lithium iron phosphate. These figures are LFP and are never applied to NMC.');
  notes.push(`Sized from the catalogue: ${option.enclosureCount} × ${option.enclosure.model} with ${option.pcsCount} × ${option.pcs.model}.`);

  const rechargeKW = Math.min(chargerCPerHour * option.energyKWh, option.continuousKW);
  return {
    chemistry: 'LFP', label: 'UPS-compatible LFP', feasible: true,
    installedEnergyKWh: option.energyKWh,
    units: `${option.enclosureCount} × ${option.enclosure.model}`,
    massKg: option.enclosureCount * option.enclosure.massKg,
    footprintM2: option.enclosureCount * (option.enclosure.lengthMm / 1000) * (option.enclosure.widthMm / 1000) * CLEARANCE,
    dcVolts: stringVoltage(option.enclosure).nominalV,
    autonomyMinutes: autonomy,
    endOfLifeAutonomyMinutes: autonomy * END_OF_LIFE_FRACTION / a.retainedCapacity * a.retainedCapacity,
    rechargeMinutesToFull: rechargeKW > 0 ? ((option.energyKWh * (1 - a.minSoc)) / rechargeKW) * 60 : null,
    // Calendar life is a function of temperature and use, and this model does not have the data to
    // put a number on it for a particular product. Saying so beats guessing.
    serviceLifeYears: null,
    notes: notes.concat(
      tempC > (option.enclosure.operatingRangeC[1] ?? 45)
        ? [`${tempC} °C is above this enclosure's stated operating range, so the configuration is infeasible as specified rather than derated by guesswork.`]
        : [],
      ['Service life is left blank rather than assumed: it depends on temperature, cycling and the product, and this model does not carry the data to put a year on it.'],
    ),
  };
}

/** Both chemistries, sized separately for the same service. */
export function compareChemistries(args: {
  protectedKW: number;
  autonomyMinutes: number;
  tempC: number;
  assumptions?: UpsAssumptions;
  /** Recharge current available, as a multiple of the installed energy per hour. */
  chargerCPerHour?: number;
  block?: VrlaBlock;
}): ChemistryComparison {
  const a = args.assumptions ?? defaultAssumptions();
  const charger = args.chargerCPerHour ?? 0.2;
  const block = args.block ?? agmBlock;

  const req = requirementFrom({
    contract: { value: args.protectedKW, unit: 'kW' },
    protectedFraction: 1, durationMinutes: args.autonomyMinutes, assumptions: a,
  });
  const lfp = lfpOption(optionsFor(req).options[0], req, args.autonomyMinutes, args.tempC, a, charger);
  const vrla = vrlaOption(block, args.protectedKW, args.autonomyMinutes, args.tempC, a, charger);

  const differences: string[] = [];
  if (vrla.feasible && lfp.feasible) {
    differences.push(`The DC bus differs: ${vrla.dcVolts.toFixed(0)} V for the lead-acid string against ${lfp.dcVolts.toFixed(0)} V for the lithium one. The converter, the protection and the cabling are not interchangeable between them.`);
    differences.push('The lithium option carries a battery management system with its own protections. The lead-acid option does not, and needs separate monitoring, a charger matched to it and ventilation.');
    differences.push(`Floor area differs by a factor of about ${(Math.max(vrla.footprintM2, lfp.footprintM2) / Math.max(1e-9, Math.min(vrla.footprintM2, lfp.footprintM2))).toFixed(1)}, and mass by about ${(Math.max(vrla.massKg, lfp.massKg) / Math.max(1e-9, Math.min(vrla.massKg, lfp.massKg))).toFixed(1)}. Both include clearance; neither includes the floor loading check.`);
    if (vrla.rechargeMinutesToFull != null && lfp.rechargeMinutesToFull != null) {
      differences.push(`Recharge to full takes about ${(vrla.rechargeMinutesToFull / 60).toFixed(1)} hours for lead-acid against ${(lfp.rechargeMinutesToFull / 60).toFixed(1)} for lithium on the same available site power. Readiness for the *next* outage is the difference that matters, not the first one.`);
    }
  }

  const disclosures = [
    'Equal service, not equal labels: both options carry the same protected load for the same autonomy, each sized against its own discharge curves. Equal amp-hours would not be equal service.',
    'The lead-acid figures come from a fitted model with stated bounds, not from a manufacturer discharge table. A real table replaces every runtime figure here.',
    'Not all lithium-ion is LFP, and LFP figures are never applied to NMC. Flooded, gel and other lead-acid technologies are not represented by this VRLA data.',
    'Both chemistries need thermal management. Nothing here promises that lithium needs no cooling, never burns or never needs replacing.',
    `Both are held to the same end-of-life acceptance threshold of ${(END_OF_LIFE_FRACTION * 100).toFixed(0)}% of rated capacity.`,
  ];

  return {
    protectedKW: args.protectedKW, autonomyMinutes: args.autonomyMinutes, tempC: args.tempC,
    options: [vrla, lfp], differences, disclosures,
  };
}

/* ------------------------------------------------ repeated outages (F06) -- */

export type RepeatedOutages = {
  events: { atMinutes: number; askedMinutes: number; carriedMinutes: number; socBefore: number; socAfter: number; shortfall: boolean }[];
  endingSoc: number;
  notes: string[];
};

/**
 * The same day of interruptions put to both chemistries — F06.
 *
 * The fixture is about one thing: the second outage starts where the first one left the battery,
 * and the third starts where the second did. A model that silently restores full charge between
 * events makes every option look ready for every outage, which is the opposite of what a site with
 * three interruptions a day needs to know.
 */
export function repeatedOutages(args: {
  chemistry: 'VRLA' | 'LFP';
  protectedKW: number;
  tempC: number;
  events: OutageEvent[];
  dayMinutes: number;
  assumptions?: UpsAssumptions;
  chargerCPerHour?: number;
  block?: VrlaBlock;
  /** Installed energy for the lithium case, in kilowatt-hours. */
  installedKWh?: number;
  /** Blocks for the lead-acid case, where one has already been sized for the duty. */
  blocks?: number;
}): RepeatedOutages {
  const a = args.assumptions ?? defaultAssumptions();
  const charger = args.chargerCPerHour ?? 0.2;
  if (args.chemistry === 'VRLA') {
    const block = args.block ?? agmBlock;
    // The day is put to the equipment that was sized for the duty on the screen, not to equipment
    // sized for the day. §15.4 keeps the outage schedule independent of the design autonomy, which
    // means the schedule changes nothing about the installation it is testing.
    const blocks = args.blocks ?? (() => {
      const longest = Math.max(...args.events.map(e => e.minutes));
      return blocksFor(block, args.protectedKW, longest, args.tempC, a.pathEfficiency, a.startSoc - a.minSoc).value?.blocks;
    })();
    if (!blocks) return { events: [], endingSoc: a.startSoc, notes: ['No lead-acid configuration covers this duty, so no day can be run against one.'] };
    return dayOfOutages(block, {
      blocks, protectedKW: args.protectedKW, tempC: args.tempC,
      pathEfficiency: a.pathEfficiency, startSoc: a.startSoc, minSoc: a.minSoc,
      chargerCPerHour: charger, events: args.events, dayMinutes: args.dayMinutes,
    });
  }

  // The lithium case, on the same arithmetic of carrying state forward — with its own usable
  // window and its own recharge rate, which is the whole reason the two differ.
  const installedKWh = args.installedKWh ?? 0;
  const drawKW = args.protectedKW / a.pathEfficiency;
  let soc = a.startSoc, clock = 0;
  const events: RepeatedOutages['events'] = [];
  const usableKWh = installedKWh * a.retainedCapacity;
  const rechargeKWPerMinute = (charger * installedKWh) / 60;
  for (const e of args.events) {
    const window = Math.max(0, e.atMinutes - clock);
    soc = Math.min(1, soc + (usableKWh > 0 ? (rechargeKWPerMinute * window) / usableKWh : 0));
    clock = e.atMinutes;
    const availableKWh = usableKWh * Math.max(0, soc - a.minSoc);
    const carried = Math.min(e.minutes, drawKW > 0 ? (availableKWh / drawKW) * 60 : 0);
    const socBefore = soc;
    soc = Math.max(a.minSoc, soc - (usableKWh > 0 ? (drawKW * carried) / 60 / usableKWh : 0));
    events.push({ atMinutes: e.atMinutes, askedMinutes: e.minutes, carriedMinutes: carried, socBefore, socAfter: soc, shortfall: carried < e.minutes - 1e-9 });
    clock = e.atMinutes + e.minutes;
  }
  const tail = Math.max(0, args.dayMinutes - clock);
  soc = Math.min(1, soc + (usableKWh > 0 ? (rechargeKWPerMinute * tail) / usableKWh : 0));
  return {
    events, endingSoc: soc,
    notes: ['The state of charge is carried from one outage to the next. Nothing resets it to full between events.'],
  };
}

export { agmBlock, vrlaApplicability, energyWhPerBlock };
