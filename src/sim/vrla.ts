import type { Provenance } from './provenance';

/**
 * Valve-regulated lead-acid, as its own model.
 *
 * §15.4 forbids the one shortcut that makes this easy: **the existing lithium model is not
 * relabelled to simulate lead-acid.** Lead-acid does not behave like lithium iron phosphate at the
 * durations a UPS cares about, and the difference is the entire point of the comparison — so this
 * is a separate model with its own basis, its own bounds and its own way of being wrong.
 *
 * What it is: a fitted Peukert-style constant-power model with a rate-dependent average discharge
 * voltage, plus a bulk-and-absorption recharge model. §15.4 permits exactly this and requires it to
 * be called what it is: **an explicitly limited approximation**, not manufacturer data. Every
 * function refuses to answer outside the range the fit was stated for, because a number produced
 * outside a model's applicability is worse than no number.
 *
 * What it is not: a datasheet. Runtime for a real installation comes from the manufacturer's
 * constant-power discharge table at the relevant duration, end voltage and temperature. This model
 * exists so a learner can see the shape of the difference, and so the shape of the interface is
 * right when real tables replace it.
 */

/** The bounds the fit was stated for. Outside these the model says so rather than extrapolating. */
export const vrlaApplicability = {
  minMinutes: 5,
  maxMinutes: 480,
  minTempC: 0,
  maxTempC: 45,
  /** The lowest volts per cell the runtime figures are taken to. */
  endVoltsPerCell: 1.75,
};

export type VrlaBlock = {
  id: string;
  model: string;
  /** Cells in the block. A twelve-volt block is six. */
  cells: number;
  nominalV: number;
  /** The twenty-hour rating, which is the one printed on the label — and the one that misleads. */
  ratedAh20h: number;
  massKg: number;
  /** Footprint and height in metres, for the space comparison §15.4 asks for. */
  widthM: number;
  depthM: number;
  heightM: number;
  /** The highest recharge current the manufacturer permits, as a multiple of the 20-hour rating. */
  maxRechargeC: number;
  /** Float service life at 25 °C, in years, before the capacity falls to the end-of-life threshold. */
  floatLifeYears25C: number;
  /** Cycles to end of life at 50% depth of discharge. */
  cycleLife50Dod: number;
  provenance: Provenance;
};

const illustrativeVrla = (source: string, assumptions: string[]): Provenance => ({
  badge: 'illustrative',
  source,
  reviewedOn: null,
  applicability: {
    temperatureC: [vrlaApplicability.minTempC, vrlaApplicability.maxTempC],
    socFraction: [0, 1],
    cRate: [0, 4],
    notes: `Fitted model, valid from ${vrlaApplicability.minMinutes} minutes to ${vrlaApplicability.maxMinutes / 60} hours of discharge to ${vrlaApplicability.endVoltsPerCell} V per cell. A manufacturer constant-power table replaces it.`,
  },
  assumptions,
});

/**
 * One illustrative UPS-grade AGM block.
 *
 * The numbers are typical of the class rather than taken from any one product, and the provenance
 * says so. Nothing here is a quotation, and no vendor's figures are represented by it.
 */
export const agmBlock: VrlaBlock = {
  id: 'vrla-agm-12v100',
  model: 'UPS-grade VRLA AGM, 12 V 100 Ah class',
  cells: 6,
  nominalV: 12,
  ratedAh20h: 100,
  massKg: 30,
  widthM: 0.33, depthM: 0.17, heightM: 0.22,
  maxRechargeC: 0.2,
  floatLifeYears25C: 5,
  cycleLife50Dod: 400,
  provenance: illustrativeVrla(
    'Typical of the UPS-grade AGM class. Not taken from any one product and not a quotation; a manufacturer constant-power discharge table at the relevant duration, end voltage and temperature replaces every runtime figure here.',
    [
      'A Peukert exponent of 1.25, which is typical for AGM and is a fit rather than a measurement.',
      'Average discharge voltage falls with rate, from 2.00 V per cell at the twenty-hour rate to 1.80 V at five minutes.',
      'Capacity varies with temperature at 0.6% per kelvin around 25 °C, inside the stated envelope only.',
      'Float life halves for every 10 K above 25 °C — a rule of thumb, stated as one, not a warranty.',
      'Valve-regulated cells need no routine watering. They still need inspection, torque checks and ventilation.',
    ],
  ),
};

/* ------------------------------------------------------------- the model -- */

/** The Peukert exponent the fit uses. Stated here rather than buried, because everything turns on it. */
export const PEUKERT_N = 1.25;

const outside = (what: string, value: number, low: number, high: number) =>
  `${what} of ${value} is outside the range this model was fitted for (${low} to ${high}). No number is produced rather than one that cannot be supported.`;

/**
 * The capacity available at a given discharge duration, as a fraction of the twenty-hour rating.
 *
 * This is the whole difference between lead-acid and lithium at UPS durations, in one line: a
 * hundred amp-hour block does not hold a hundred amp-hours for fifteen minutes. §15.4 forbids
 * calculating runtime from a 10- or 20-hour rating without rate correction, and this is that
 * correction — fitted, and labelled.
 */
export const availableFraction = (hours: number) => (hours / 20) ** (1 - 1 / PEUKERT_N);

/** Average volts per cell across a discharge at that duration. Falls as the rate rises. */
export const averageVoltsPerCell = (hours: number) => {
  const atTwenty = 2.0, atFiveMinutes = 1.8;
  const t = Math.min(1, Math.max(0, Math.log(hours / (5 / 60)) / Math.log(20 / (5 / 60))));
  return atFiveMinutes + (atTwenty - atFiveMinutes) * t;
};

/** Capacity correction for temperature, inside the envelope only. */
export const temperatureFactor = (tempC: number) => 1 + 0.006 * (tempC - 25);

export type VrlaResult<T> = { value: T; note: string } | { value: null; note: string };

/**
 * The energy one block delivers at a given discharge duration and temperature.
 *
 * Refuses outside its bounds. §15.4: a condition outside the equipment's operating envelope yields
 * an infeasible result, and precision is never fabricated.
 */
export function energyWhPerBlock(block: VrlaBlock, minutes: number, tempC: number): VrlaResult<number> {
  if (minutes < vrlaApplicability.minMinutes || minutes > vrlaApplicability.maxMinutes) {
    return { value: null, note: outside('A discharge duration', minutes, vrlaApplicability.minMinutes, vrlaApplicability.maxMinutes) };
  }
  if (tempC < vrlaApplicability.minTempC || tempC > vrlaApplicability.maxTempC) {
    return { value: null, note: outside('A battery temperature', tempC, vrlaApplicability.minTempC, vrlaApplicability.maxTempC) };
  }
  const hours = minutes / 60;
  const ah = block.ratedAh20h * availableFraction(hours) * temperatureFactor(tempC);
  const volts = averageVoltsPerCell(hours) * block.cells;
  return {
    value: ah * volts,
    note: `At ${minutes} minutes a ${block.ratedAh20h} Ah block delivers about ${(availableFraction(hours) * 100).toFixed(0)}% of its twenty-hour rating, at ${averageVoltsPerCell(hours).toFixed(2)} V per cell average. Fitted, not from a datasheet.`,
  };
}

/** The constant power one block sustains for that long. The figure a UPS is actually sized on. */
export function powerWPerBlock(block: VrlaBlock, minutes: number, tempC: number): VrlaResult<number> {
  const energy = energyWhPerBlock(block, minutes, tempC);
  return energy.value === null ? energy : { value: energy.value / (minutes / 60), note: energy.note };
}

/**
 * The nominal energy of a set of blocks: the twenty-hour rating, which is what a state of charge is
 * measured against and what a charger's C-rate is quoted against.
 *
 * Everything else here is *available* energy at a rate, which is a smaller number and a different
 * quantity. Keeping the two apart is not pedantry: mixing them makes a battery that is recharged in
 * one currency and discharged in another, and the arithmetic stops meaning anything.
 */
export const nominalWh = (block: VrlaBlock, blocks: number) => blocks * block.ratedAh20h * block.nominalV;

/**
 * How many blocks a duty needs, sized against the block's own discharge curve.
 *
 * §15.4: each battery is sized separately against its own curves, current limits and usable
 * capacity, and equal amp-hours does not mean equal service. `usableFraction` is the part of the
 * pack the duty may actually use — readiness less the floor — because sizing against the whole
 * pack and then refusing to discharge the bottom tenth of it produces a system that misses its
 * autonomy by exactly that tenth.
 */
export function blocksFor(
  block: VrlaBlock, protectedKW: number, minutes: number, tempC: number, pathEfficiency: number,
  usableFraction = 1, targetStringV = 768,
): VrlaResult<{ blocks: number; blocksPerString: number; strings: number; stringVolts: number; energyKWh: number; nominalKWh: number }> {
  const per = energyWhPerBlock(block, minutes, tempC);
  if (per.value === null) return { value: null, note: per.note };
  if (!(usableFraction > 0)) return { value: null, note: 'The usable state-of-charge window is nothing, so no number of blocks would carry the duty.' };
  const neededWh = ((protectedKW * 1000) / pathEfficiency) * (minutes / 60);
  const needed = Math.max(1, Math.ceil(neededWh / (per.value * usableFraction)));
  // Blocks make a string at the DC voltage the converter wants, and strings go in parallel. Putting
  // every block in one series stack — which is what counting blocks alone implies — would give a
  // thousand-volt battery out of a hundred blocks and eight thousand out of seven hundred, which is
  // not a thing anybody installs.
  const blocksPerString = Math.max(1, Math.round(targetStringV / block.nominalV));
  const strings = Math.max(1, Math.ceil(needed / blocksPerString));
  const blocks = strings * blocksPerString;
  return {
    value: {
      blocks, blocksPerString, strings,
      stringVolts: blocksPerString * block.nominalV,
      energyKWh: (blocks * per.value) / 1000,
      nominalKWh: nominalWh(block, blocks) / 1000,
    },
    note: `${per.note} Sized for ${(usableFraction * 100).toFixed(0)}% of the pack being usable between readiness and the floor, as ${strings} string(s) of ${blocksPerString} blocks at ${(blocksPerString * block.nominalV).toFixed(0)} V.`,
  };
}

/* ---------------------------------------------------------------- charge -- */

/**
 * Recharging, which is where lead-acid loses the argument it won on price.
 *
 * Bulk to eighty per cent at whatever current the charger and the cells allow, then an absorption
 * phase whose current decays — so the last fifth takes as long as the first four. Modelled with one
 * time constant, which is an approximation and is stated as one.
 */
export function rechargeMinutes(block: VrlaBlock, fromSoc: number, toSoc: number, chargerCPerHour: number): VrlaResult<number> {
  if (toSoc <= fromSoc) return { value: 0, note: 'Nothing to recharge.' };
  const rate = Math.min(chargerCPerHour, block.maxRechargeC);
  if (rate <= 0) return { value: null, note: 'No recharge current is available, so no recharge time can be given.' };
  const bulkTo = Math.min(toSoc, 0.8);
  const bulkHours = Math.max(0, bulkTo - fromSoc) / rate;
  // Absorption: the accepted current decays with a time constant of about an hour for this class,
  // so closing the last twenty per cent takes far longer than the bulk phase suggests.
  //
  // "Full" is taken as 99%. On a decaying current the last per cent takes indefinitely long, so a
  // model that asks for exactly 100% returns an arbitrarily large number and calls it a recharge
  // time. Ninety-nine per cent is where the charger's own logic stops caring, and it is stated.
  const target = Math.min(toSoc, 0.99);
  const absorptionHours = target > 0.8
    ? -1.0 * Math.log(Math.max(0.01, (1 - target) / (1 - Math.max(fromSoc, 0.8))))
    : 0;
  return {
    value: (bulkHours + absorptionHours) * 60,
    note: `Bulk at ${(rate * 100).toFixed(0)}% of the twenty-hour rating to 80%, then an absorption phase with about a one-hour time constant, taken to 99% because the last per cent takes indefinitely long on a decaying current. An approximation, stated as one.`,
  };
}

/** Float service life at a temperature. The rule of thumb, as a rule of thumb. */
export function floatLifeYears(block: VrlaBlock, tempC: number): VrlaResult<number> {
  if (tempC < vrlaApplicability.minTempC || tempC > vrlaApplicability.maxTempC) {
    return { value: null, note: outside('A battery temperature', tempC, vrlaApplicability.minTempC, vrlaApplicability.maxTempC) };
  }
  return {
    value: block.floatLifeYears25C * 2 ** (-(tempC - 25) / 10),
    note: `Float life halves for every 10 K above 25 °C. A rule of thumb about the class, not a warranty about a product: at ${tempC} °C it gives about ${(block.floatLifeYears25C * 2 ** (-(tempC - 25) / 10)).toFixed(1)} years against ${block.floatLifeYears25C} at 25 °C.`,
  };
}

/* ------------------------------------------------- a day of interruptions -- */

export type OutageEvent = { atMinutes: number; minutes: number };

export type VrlaDayResult = {
  /** One entry per outage, in order. */
  events: {
    atMinutes: number;
    askedMinutes: number;
    /** How long it actually carried the load before reaching the end voltage. */
    carriedMinutes: number;
    socBefore: number;
    socAfter: number;
    /** True where the reserve ran out before the outage did. */
    shortfall: boolean;
  }[];
  /** Charge left at the end of the day. */
  endingSoc: number;
  notes: string[];
};

/**
 * A day of outages with limited recharge between them — F06.
 *
 * The fixture exists because of one specific failure: a model that quietly restores the battery to
 * full between events, so every outage is the first outage and the third one is carried by energy
 * nobody put back. Here the state of charge is carried forward, the recharge between events is
 * bounded by the charger and by the time available, and the next event starts wherever the last one
 * left it.
 */
export function dayOfOutages(
  block: VrlaBlock,
  args: {
    blocks: number; protectedKW: number; tempC: number; pathEfficiency: number;
    startSoc: number; minSoc: number; chargerCPerHour: number; events: OutageEvent[];
    /** Minutes in the day, so the last recharge window is bounded too. */
    dayMinutes: number;
  },
): VrlaDayResult {
  const notes: string[] = [];
  let soc = args.startSoc;
  let clock = 0;
  const out: VrlaDayResult['events'] = [];

  for (const event of args.events) {
    // Recharge in whatever time there is before this outage, at whatever the charger allows.
    const window = Math.max(0, event.atMinutes - clock);
    if (window > 0 && soc < 1) {
      const full = rechargeMinutes(block, soc, 1, args.chargerCPerHour);
      if (full.value !== null && full.value > 0) {
        const gained = Math.min(1 - soc, (1 - soc) * Math.min(1, window / full.value));
        soc = Math.min(1, soc + gained);
      }
    }
    clock = event.atMinutes;

    // What the pack can deliver at this rate, from where it actually is.
    //
    // Two quantities, kept apart. The state of charge is a fraction of the *nominal* energy — the
    // twenty-hour rating, which is what a charger's C-rate is also quoted against. What the pack
    // can deliver at this rate is a fraction of that again, and delivering a watt-hour at a high
    // rate therefore costs more than a watt-hour of nominal charge. That difference is the Peukert
    // effect, and it is the reason a lead-acid pack that looks adequate on a label is not.
    const perBlock = energyWhPerBlock(block, event.minutes, args.tempC);
    if (perBlock.value === null) {
      notes.push(perBlock.note);
      out.push({ atMinutes: event.atMinutes, askedMinutes: event.minutes, carriedMinutes: 0, socBefore: soc, socAfter: soc, shortfall: true });
      continue;
    }
    const total = nominalWh(block, args.blocks);
    const rateFraction = total > 0 ? (perBlock.value * args.blocks) / total : 0;
    const availableWh = perBlock.value * args.blocks * Math.max(0, soc - args.minSoc);
    const drawW = (args.protectedKW * 1000) / args.pathEfficiency;
    const carriedMinutes = drawW > 0 ? Math.min(event.minutes, (availableWh / drawW) * 60) : 0;
    const usedWh = (drawW * carriedMinutes) / 60;
    const socBefore = soc;
    soc = Math.max(args.minSoc, soc - (rateFraction > 0 && total > 0 ? usedWh / (rateFraction * total) : 0));
    out.push({
      atMinutes: event.atMinutes, askedMinutes: event.minutes,
      carriedMinutes, socBefore, socAfter: soc,
      shortfall: carriedMinutes < event.minutes - 1e-9,
    });
    clock = event.atMinutes + event.minutes;
  }

  // And the rest of the day, so the ending state is the real one.
  const tail = Math.max(0, args.dayMinutes - clock);
  if (tail > 0 && soc < 1) {
    const full = rechargeMinutes(block, soc, 1, args.chargerCPerHour);
    if (full.value !== null && full.value > 0) soc = Math.min(1, soc + (1 - soc) * Math.min(1, tail / full.value));
  }
  notes.push('The state of charge is carried from one outage to the next. Nothing resets it to full between events.');
  return { events: out, endingSoc: soc, notes };
}
