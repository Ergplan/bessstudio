import { agmBlock, floatLifeYears, type VrlaBlock } from './vrla';
import { compareChemistries, repeatedOutages, type ChemistryComparison } from './chemistry';
import { defaultAssumptions, type UpsAssumptions } from './ups';
import {
  crossoverYear, defaultDiscounting, ledgerFor, totals, unstatedTax,
  type CostAssumptions, type Discounting, type Horizon, type LedgerTotals, type ReplacementEvidence,
} from './lifecycle';

/**
 * Three Indian sites, as operating conditions rather than as places.
 *
 * §15.4 is emphatic about what these are and are not: *illustrative Indian site scenarios, not
 * measured national averages or claims about any city or state*. There is no city name anywhere in
 * this file, and there is no such thing here as an average Indian tariff or a nationwide outage
 * assumption. What there is: three combinations of room temperature, outage pattern and available
 * recharge that teach three different things.
 *
 * **Outdoor temperature, battery-room air and battery temperature are three different things.** The
 * preset states the room; the battery sits above it by whatever its own losses and its cooling
 * arrangement give it, and that rise is declared rather than inferred from anywhere.
 */

export type IndiaPreset = {
  id: string;
  label: string;
  /** What the room is held at, or reaches. Not an outdoor temperature and not a city's climate. */
  roomC: number;
  /**
   * How much above the room the cells sit, in kelvin, and why.
   *
   * §15.4: battery temperature is never inferred from an Indian city name. It is inferred from the
   * room the battery is in and the heat it makes there, and where the model cannot support that,
   * the simplified assumption is exposed — which is what this field is.
   */
  batteryRiseK: number;
  batteryRiseBasis: string;
  /** Outages in one illustrative day, and how often such a day is assumed to repeat in a year. */
  outages: { atMinutes: number; minutes: number }[];
  daysPerYear: number;
  /** Recharge current available between events, as a multiple of installed energy per hour. */
  chargerCPerHour: number;
  /** What this preset is for. */
  teaches: string;
  notes: string[];
};

export const indiaPresets: IndiaPreset[] = [
  {
    id: 'conditioned-office',
    label: 'Conditioned office or IT room',
    roomC: 25,
    batteryRiseK: 1,
    batteryRiseBasis: 'A conditioned room holds the air at its setpoint and the cells sit about a kelvin above it on float. A simplified assumption, exposed rather than modelled.',
    outages: [{ atMinutes: 600, minutes: 15 }],
    daysPerYear: 12,
    chargerCPerHour: 0.2,
    teaches: 'Float and calendar ageing, the cost up front, and when the replacement falls.',
    notes: [
      'One fifteen-minute outage a month, and plenty of grid time between events to recharge.',
      'Twelve such days a year is an explicit assumption about this example, not a lifetime extrapolation.',
    ],
  },
  {
    id: 'warm-industrial',
    label: 'Warm industrial electrical room',
    roomC: 35,
    batteryRiseK: 3,
    batteryRiseBasis: 'An electrical room at 35 °C with ventilation rather than conditioning; the cells sit about three kelvin above the air under this duty. A simplified assumption, exposed.',
    outages: [{ atMinutes: 600, minutes: 15 }],
    daysPerYear: 300,
    chargerCPerHour: 0.2,
    teaches: 'What temperature does to service life, and what daily cycling does on top of it.',
    notes: [
      'One fifteen-minute outage a day, three hundred days a year — an explicit assumption about this example.',
      'A 40 °C stress case is available by raising the room temperature; the envelope check then decides whether the answer is a number or an infeasible.',
    ],
  },
  {
    id: 'repeated-interruptions',
    label: 'Repeated interruptions, limited recharge',
    roomC: 30,
    batteryRiseK: 2,
    batteryRiseBasis: 'A ventilated room at 30 °C with the cells about two kelvin above the air. A simplified assumption, exposed.',
    outages: [{ atMinutes: 600, minutes: 15 }, { atMinutes: 660, minutes: 15 }, { atMinutes: 720, minutes: 15 }],
    daysPerYear: 150,
    chargerCPerHour: 0.05,
    teaches: 'Partial recharge, the reserve that is left, and readiness for the outage after this one.',
    notes: [
      'Three fifteen-minute outages at ten, eleven and twelve, with the recharge between them limited by the site headroom.',
      'The schedule is independent of the backup duration chosen: asking for an hour of autonomy does not make every outage an hour long.',
    ],
  },
];

export const presetById = (id: string) => indiaPresets.find(p => p.id === id) ?? indiaPresets[0];

/** The battery's own temperature under a preset. Never a city, always a room plus a stated rise. */
export const batteryTempC = (preset: IndiaPreset) => preset.roomC + preset.batteryRiseK;

/**
 * Teaching tariffs.
 *
 * §15.4 names ₹6, ₹9 and ₹12 per kilowatt-hour and requires them to be labelled as teaching values
 * rather than as anybody's tariff. A sourced state, DISCOM or category tariff — or a bill — replaces
 * them, with the date it was effective.
 */
export const teachingTariffs = [6, 9, 12] as const;
export const TARIFF_LABEL = 'Teaching values, not current DISCOM tariffs. A sourced state, DISCOM or category tariff, or the site’s own bill, replaces them with its effective date.';

/** Costs with no market claim attached to any of them. */
export const illustrativeCosts = (tariffInrPerKWh: number): CostAssumptions => ({
  // Deliberately null: nothing here claims to know what anything costs in the market today.
  batteryInrPerKWh: null,
  conversionInrPerKW: null,
  amcFractionPerYear: 0.02,
  replacementLabourFraction: 0.1,
  disposalInrPerKg: null,
  residualFraction: null,
  tariffInrPerKWh,
  tax: unstatedTax(),
});

/** The same shape with figures entered, for a site that has quotations. */
export const quotedCosts = (over: Partial<CostAssumptions> & { tariffInrPerKWh: number }): CostAssumptions =>
  ({ ...illustrativeCosts(over.tariffInrPerKWh), ...over });

/* --------------------------------------------------- the whole comparison -- */

export type IndiaComparison = {
  preset: IndiaPreset;
  roomC: number;
  batteryC: number;
  chemistry: ChemistryComparison;
  /** One ledger per chemistry, and the totals over the chosen horizon. */
  costs: { chemistry: 'VRLA' | 'LFP'; totals: LedgerTotals; replacement: ReplacementEvidence }[];
  crossoverYear: number | null;
  /** How many of the day's outages each option carried, on the preset's own schedule. */
  readiness: { chemistry: 'VRLA' | 'LFP'; carried: number; asked: number; endingSoc: number }[];
  horizonYears: Horizon;
  tariffInrPerKWh: number;
  disclosures: string[];
};

/**
 * Both chemistries, in one Indian operating scenario, over a lifecycle.
 *
 * Neither result is forced. A conditioned room with one short outage a month gives lead-acid its
 * best case; repeated interruptions with limited recharge give lithium its. The function reports
 * whichever came out, with the assumptions that produced it and everything it could not price.
 */
export function compareInIndia(args: {
  protectedKW: number;
  autonomyMinutes: number;
  preset: IndiaPreset;
  horizonYears?: Horizon;
  tariffInrPerKWh?: number;
  costs?: CostAssumptions;
  discounting?: Discounting;
  assumptions?: UpsAssumptions;
  block?: VrlaBlock;
  /** Declared sensitivity lives for lithium, where no service-life evidence exists. */
  lfpLifeCases?: number[];
}): IndiaComparison {
  const horizonYears = args.horizonYears ?? 10;
  const tariff = args.tariffInrPerKWh ?? teachingTariffs[1];
  const costs = args.costs ?? illustrativeCosts(tariff);
  const d = args.discounting ?? defaultDiscounting();
  const a = args.assumptions ?? defaultAssumptions();
  const block = args.block ?? agmBlock;
  const cellsC = batteryTempC(args.preset);

  const chemistry = compareChemistries({
    protectedKW: args.protectedKW, autonomyMinutes: args.autonomyMinutes, tempC: cellsC,
    assumptions: a, chargerCPerHour: args.preset.chargerCPerHour, block,
  });

  const vrla = chemistry.options.find(o => o.chemistry === 'VRLA')!;
  const lfp = chemistry.options.find(o => o.chemistry === 'LFP')!;

  // Energy through the store in a year, from the preset's own schedule. The same figure for both,
  // because it is a property of the site's outages rather than of the chemistry in the room.
  const outageMinutesPerDay = args.preset.outages.reduce((n, o) => n + o.minutes, 0);
  const throughputKWhPerYear = (args.protectedKW * (outageMinutesPerDay / 60)) * args.preset.daysPerYear;

  const life = floatLifeYears(block, cellsC);
  const vrlaReplacement: ReplacementEvidence = life.value !== null
    ? { kind: 'modelled', years: life.value, basis: life.note }
    : { kind: 'sensitivity', cases: [2, 3, 5], basis: 'The float-life model does not cover this temperature, so declared sensitivity cases are compared instead of a number being chosen.' };
  const lfpReplacement: ReplacementEvidence = {
    kind: 'sensitivity',
    cases: args.lfpLifeCases ?? [8, 10, 12],
    basis: 'No service-life evidence for this product at this temperature and duty, so declared sensitivity cases are compared rather than a conventional figure being assumed.',
  };

  const costOf = (
    chem: 'VRLA' | 'LFP', energyKWh: number, massKg: number, efficiency: number,
    cooling: number, replacement: ReplacementEvidence,
  ) => ({
    chemistry: chem,
    replacement,
    totals: totals(ledgerFor({
      chemistry: chem, installedEnergyKWh: energyKWh, continuousKW: args.protectedKW, massKg,
      batteryEfficiency: efficiency, throughputKWhPerYear, incrementalCoolingKWhPerYear: cooling,
      replacement,
    }, costs, horizonYears), horizonYears, d),
  });

  const day = (chem: 'VRLA' | 'LFP') => repeatedOutages({
    chemistry: chem, protectedKW: args.protectedKW, tempC: cellsC,
    events: args.preset.outages, dayMinutes: 1440, assumptions: a,
    chargerCPerHour: args.preset.chargerCPerHour,
    installedKWh: lfp.installedEnergyKWh, blocks: vrla.blocks, block,
  });

  const readiness = (['VRLA', 'LFP'] as const).map(chem => {
    const out = day(chem);
    return {
      chemistry: chem,
      carried: out.events.filter(e => !e.shortfall).length,
      asked: args.preset.outages.length,
      endingSoc: out.endingSoc,
    };
  });

  const costsOut = [
    // Lead-acid is about 80% efficient on the round trip and needs ventilation rather than cooling;
    // lithium is about 95% and carries its cooling in the auxiliaries already counted.
    costOf('VRLA', vrla.installedEnergyKWh, vrla.massKg, 0.8, 0, vrlaReplacement),
    costOf('LFP', lfp.installedEnergyKWh, lfp.massKg, 0.95, 0, lfpReplacement),
  ];

  // Where the catalogue's smallest unit is far larger than the duty, the comparison is partly a
  // comparison of product granularity rather than of chemistry — and saying so is the difference
  // between a result and a misleading one.
  const needed = Math.max(1e-9, (args.protectedKW / a.pathEfficiency) * (args.autonomyMinutes / 60) / (a.startSoc - a.minSoc));
  const oversized = chemistry.options
    .filter(o => o.feasible && o.installedEnergyKWh > needed * 2)
    .map(o => `The ${o.chemistry} configuration carries ${o.installedEnergyKWh.toFixed(0)} kWh against the ${needed.toFixed(0)} kWh this duty needs, because the smallest unit available for it is that size. Part of the cost difference below is product granularity rather than chemistry, and a unit sized for this duty would change it.`);

  const incomplete = costsOut.some(c => !c.totals.complete);

  return {
    preset: args.preset, roomC: args.preset.roomC, batteryC: cellsC, chemistry,
    costs: costsOut,
    crossoverYear: crossoverYear(costsOut[0].totals, costsOut[1].totals),
    readiness, horizonYears, tariffInrPerKWh: tariff,
    disclosures: [
      ...oversized,
      ...(incomplete ? ['These totals are missing prices, so no crossover year is stated: a crossover between two partial sums would be the most confident figure on the screen and the least supported.'] : []),
      `${args.preset.label}: an illustrative Indian site scenario, not a measured national average and not a claim about any city or state.`,
      `The room is held at ${args.preset.roomC} °C and the cells sit at ${cellsC} °C. ${args.preset.batteryRiseBasis}`,
      ...args.preset.notes,
      TARIFF_LABEL,
      costs.tax.note,
      'Replacement timing is taken from evidence or from declared sensitivity cases. There is no rule here that lead-acid is replaced every three years and lithium every ten.',
      'Avoided-outage losses are outside this total. They belong to a separate scenario the site values for itself.',
      'End-of-life handling needs the current Battery Waste Management Rules and a registered recycler or take-back arrangement checked against official sources. Informal scrap sale is not compliant recycling.',
    ],
  };
}
