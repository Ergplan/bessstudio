import {
  sealWith, learningTemplateSchema, scenarioSchema, emsPolicySchema, plantConfigurationSchema,
  type LearningTemplate, type Scenario, type EmsPolicy, type PlantConfiguration, type Profile,
} from './records';
import {
  backupPlant, backupReservePolicy, dayScenario, fixedSchedulePolicy, hotCondition, lfpParameterSet,
  manualPolicy, normalCondition, peakShavingPolicy, priceSchedulePolicy, selfConsumptionPolicy,
  siteLoadProfile, solarProfile, teachingPlant, weakCellCondition, illustrative,
} from './presets';
import {
  backupDurations, contractDemands, defaultAssumptions, heldOption, hold, optionsFor, protectedShares,
  readiness, requirementFrom, shortfalls, stringVoltage,
  type HeldSystem, type UpsAssumptions, type UpsOption, type UpsRequirement,
} from './ups';
import { byId, enclosures, packSpecs, pcsUnits } from '../catalog/products';
import { repeatedOutages, type ChemistryComparison, type RepeatedOutages } from './chemistry';
import {
  compareInIndia, illustrativeCosts, indiaPresets, quotedCosts, teachingTariffs, type IndiaComparison,
} from './india';

/**
 * The lesson catalogue.
 *
 * §15 defines seven cards, each stating one question, the outcome it teaches and a short estimated
 * duration. They are reached from a project or a quotation, never from the landing page, because
 * §3.0 puts the learner *after* the quote: somebody who has just been handed a design and wants to
 * understand it.
 *
 * Every card is the same shape, and the player knows nothing about any particular one. A card says
 * what it runs, what the learner may move, which four figures to put at the top and which two
 * charts to draw; anything a card cannot say in those terms does not belong in a beginner lesson.
 * That constraint is §15.1's, and holding to it is what keeps the seventh card as approachable as
 * the first.
 *
 * A card that has not been built says so and cannot be opened. §17.1 requires unfinished features
 * to be absent or visibly unavailable, and a card that opens onto nothing is neither.
 */

/** What the player needs to draw a lesson, read from one completed run. */
export type Readout = {
  series: {
    timeSeconds: number[]; requestedPowerW: number[]; achievedPowerW: number[]; gridPowerW: number[];
    soc: number[]; cellTempC: number[]; cellTempMaxC: number[]; cellVoltageMinV: number[];
    cellVoltageV: number[]; siteLoadW: number[]; generationW: number[]; gridImportW: number[];
    gridExportW: number[]; curtailedW: number[]; unservedLoadW: number[]; bindingConstraint: string[];
    /**
     * What the battery and the converter are actually doing, rather than what the plant delivered.
     *
     * The card's four figures and two charts are a beginner's view and stay that way. These are the
     * signals an engineer reads — the direct-current side, the pack terminals, the current through
     * them and where the losses went — and the first card's dashboard draws the battery management
     * and converter panels from them. Present in every run the engine produces; they were simply
     * not carried through to the player.
     */
    dcPowerW: number[]; packVoltageV: number[]; packCurrentA: number[]; cellVoltageMaxV: number[];
    converterLossW: number[]; batteryLossW: number[]; auxiliaryW: number[];
  };
  totals: {
    deliveredAcWh: number; drawnAcWh: number; converterLossWh: number; batteryLossWh: number;
    auxiliaryWh: number;
  };
  /** The learner's settings, in the units the controls are written in. */
  values: Record<string, number>;
  /** Index of the last interval in which the plant was doing something. */
  act: number;
};

export type Metric = { label: string; value: string; unit?: string; foot?: string };
export type Plot = {
  title: string;
  subtitle: string;
  format: (n: number) => string;
  rule?: { y: number; label: string };
  yMin?: number;
  lines: { name: string; colour: number; dashed?: boolean; values: number[] }[];
};

export type LessonRun = {
  scenario: Scenario;
  policy: EmsPolicy;
  plant: PlantConfiguration;
  manualRequestW: number;
};

/**
 * A chapter of the catalogue.
 *
 * Seven cards in a row is a list, not a course: nothing said why lesson 1 came before lesson 2, or
 * what a reader would be able to do at the end that they could not do at the start. The acts carry
 * the argument — what the machine is, then what it is for, then what stops it — and each card says
 * where it sits in that and what it leaves the reader holding.
 */
export type Act = { id: string; title: string; premise: string };

export const acts: Act[] = [
  {
    id: 'machine', title: 'What the machine does',
    premise: 'Before a battery is an asset it is a box that moves energy one way or the other and keeps a little of it each time. Everything after this is that, with a reason attached.',
  },
  {
    id: 'job', title: 'What it is for',
    premise: 'Four reasons somebody buys one: a bill charged on peaks, an array making power nobody is using, a grid that goes away, and a price that moves through the day. The same plant, four jobs, four different definitions of a good day.',
  },
  {
    id: 'limits', title: 'What stops it',
    premise: 'Every job above assumed the plant does what it is asked. It does not always. Here is who refuses, what they refuse with — and what the refusal costs when the thing being protected is a working site.',
  },
];

/**
 * Where a card sits in the argument, and what the reader is left holding.
 *
 * Kept off {@link LearningTemplate} deliberately: that record is sealed and hashed, and a run is
 * reproducible because its hash covers the model and nothing else. How the card is narrated is not
 * part of the model and must not be able to invalidate a stored run by being reworded.
 */
export type LessonStory = {
  actId: Act['id'];
  /** The scene, in plain words, before anything is played. */
  situation: string;
  /** What the reader can do afterwards that they could not before. Shown on the card. */
  takeaway: string;
  /**
   * The words this card is the first to use, by glossary id.
   *
   * §15.1: "jargon is taught on first use". The prose honoured that and the screen did not — the
   * first card shows a converter, auxiliaries, a battery management system and a reserve floor
   * inside its first minute with nothing on the page saying what any of them is. Declaring them
   * here lets the player teach them before the run rather than interrupting it, and lets a test
   * refuse a card that introduces a word whose own definition depends on a later one.
   */
  teaches: string[];
  /**
   * The closing beat, drawn from the run that actually happened.
   *
   * Not a caption. A learner who moves a control gets a different sentence because they produced a
   * different result, which is the whole difference between a lesson and a slide.
   */
  soWhat: (r: Readout) => string;
};

export type LessonCard = {
  template: LearningTemplate;
  /** Where the card sits in the argument the catalogue is making. */
  story: LessonStory;
  /** The stage that brings it. Null once it is here. */
  arrivesIn: string | null;
  /** The controls the learner may move, at most three, with their bounds and units. */
  controls: LessonControl[];
  /** Everything the run needs, with the learner's settings applied. */
  runWith: (values: Record<string, number>) => LessonRun;
  /** At most four headline figures. §15.1. */
  readout: (r: Readout) => Metric[];
  /** At most two charts. §15.1. */
  plots: (r: Readout) => Plot[];
  /**
   * The honest baseline this lesson compares against, where it has one.
   *
   * §11.4: both sides keep every converter limit and every battery protection, and a comparison
   * that ends with the two batteries in different states discloses that before it claims anything.
   */
  baseline?: { policy: EmsPolicy; label: string };
  /** What the learner should take away, restated for the comparison card. */
  compareOn?: 'peak' | 'cost' | 'self-consumption';
  /**
   * The sizing panels §15.3 puts beside the run: the requirement, the configurations the catalogue
   * offers for it, whether the readiness assumed can meet the duration, and the assumptions strip
   * every figure came from. Data only — the player decides how to draw it.
   */
  sizing?: (values: Record<string, number>) => {
    requirement: UpsRequirement;
    options: UpsOption[];
    problems: string[];
    assumptions: UpsAssumptions;
    readiness: ReturnType<typeof readiness>;
    /** Set while a system is being tested rather than resized, with whatever it fails to meet. */
    held: { option: UpsOption; shortfalls: string[] } | null;
    continuity: string;
    /**
     * The second step of this lesson, per §15.4: the same service from lead-acid and from lithium,
     * each sized against its own curves, with a day of repeated outages put to both.
     */
    chemistry: ChemistryComparison;
    repeated: { chemistry: 'VRLA' | 'LFP'; events: RepeatedOutages['events'] }[];
    /** The same two options in one Indian operating scenario, over a lifecycle. §15.4 and §15.5. */
    india: IndiaComparison;
  };
};

/**
 * A control the learner may move.
 *
 * Bounds and step are given in the unit the learner reads, not in the unit the engine carries, and
 * `scale` is what converts between them — the same arrangement the sizing sliders use. A control
 * that is a choice between two things is a choice, not a slider from minus one to one.
 */
export type LessonControl =
  | {
    kind: 'slider'; id: string; label: string; hint: string;
    /** In the learner's unit: kilowatts, per cent. */
    min: number; max: number; step: number; unit: string; decimals?: number;
    /** Learner's unit per engine unit. Watts to kilowatts is 1/1000. */
    scale: number;
    /** Where it starts. */
    start: number;
  }
  | { kind: 'choice'; id: string; label: string; hint: string; start: number; options: { value: number; label: string }[] };

/* ------------------------------------------------------------- helpers ---- */

const kWh = (wh: number) => (wh / 1000).toLocaleString('en', { maximumFractionDigits: 1 });
const kW = (w: number) => (w / 1000).toLocaleString('en', { maximumFractionDigits: 0 });
const pct = (x: number) => (x * 100).toFixed(1);
const hours = (s: number) => (s / 3600).toFixed(1);

/** Energy under a power channel, in watt-hours, counting the closing sample once. */
const energyWh = (values: number[], stepSeconds: number, sign: 1 | -1 = 1) =>
  values.reduce((a, w) => a + Math.max(0, sign * w), 0) * stepSeconds / 3600;

const scaleProfile = (p: Profile, factor: number): Profile =>
  ({ ...p, samples: p.samples.map(v => Math.round(v * factor)) });

const withSoc = (scenario: Scenario, values: Record<string, number>, key = 'initialSoc') =>
  sealWith(scenarioSchema, { ...scenario, initialSoc: values[key] ?? scenario.initialSoc });

const socControl = (start: number): LessonControl => ({
  kind: 'slider', id: 'initialSoc', label: 'Starting charge level', unit: '%', scale: 100,
  min: 10, max: 100, step: 5, start,
  hint: 'Where the battery begins. A cell holds a different voltage at each level, which changes everything downstream.',
});

const chargeLevelPlot = (r: Readout, reserve: number, label = 'Reserve'): Plot => ({
  title: 'Charge level', subtitle: 'And the line the policy will not cross',
  format: n => `${n.toFixed(0)}%`, yMin: 0, rule: { y: reserve * 100, label },
  lines: [{ name: 'Charge level', colour: 0, values: r.series.soc.map(v => v * 100) }],
});

/* --------------------------------------------- 1. charge and discharge ---- */

export const chargeDischargeScenario: Scenario = sealWith(scenarioSchema, {
  id: 'lesson-1-charge-discharge',
  label: 'Charge and discharge',
  kind: 'Scenario',
  plantId: teachingPlant.id,
  policyId: manualPolicy.id,
  // Eighty percent, so an hour at a megawatt moves the charge level a long way without reaching
  // the reserve. A learner who then raises the power to the converter's rating does reach it, and
  // finding that out is the point of having the control.
  initialSoc: 0.8,
  initialCellTempC: 25,
  // Two hours at one-minute samples: long enough to see the state of charge move a long way at a
  // megawatt, short enough that the whole thing draws in a frame.
  durationSeconds: 7200,
  stepSeconds: 60,
  siteLoad: null, generation: null, price: null, outage: null,
  controls: ['direction', 'power', 'initialSoc'],
});

/**
 * The four occasions, as four scenarios rather than four captions.
 *
 * A caption that changes nothing the model does is decoration, and the suite catches it: two
 * options that produce an identical run are, to the machine, one option. So the two that claim a
 * source and an occasion actually bring one.
 *
 * *Charging from solar* puts an array on the scenario, making exactly what the dial asks the
 * battery to take. Nothing else changes, which is the point — the cells cannot tell a rooftop from
 * a feeder, and seeing the identical charge curve under a different supply is the lesson, not a
 * disappointment.
 *
 * *Carrying an outage* takes the grid away for the whole window and puts a site on the other side
 * of the converter. Now the discharge has somewhere it has to go, and if the plant cannot hold it
 * the unserved load says so. That is a different run, not a different word for the same one.
 */
const STEPS = chargeDischargeScenario.durationSeconds / chargeDischargeScenario.stepSeconds;
const flat = (name: string, watts: number): Profile =>
  ({ name, unit: 'W', samples: Array.from({ length: STEPS }, () => Math.round(watts)) });

export const chargeDischargeFor = (values: Record<string, number>): Scenario => {
  const occasion = values.direction ?? 1;
  const asked = values.power ?? 0;
  if (occasion === -2) {
    return sealWith(scenarioSchema, {
      ...withSoc(chargeDischargeScenario, values),
      id: 'lesson-1-from-solar', label: 'Charging from solar',
      generation: flat('Rooftop array', asked),
    });
  }
  if (occasion === 2) {
    return sealWith(scenarioSchema, {
      ...withSoc(chargeDischargeScenario, values),
      id: 'lesson-1-outage', label: 'Carrying an outage',
      siteLoad: flat('The site that cannot go dark', asked),
      outage: { fromSeconds: 0, toSeconds: chargeDischargeScenario.durationSeconds },
    });
  }
  return withSoc(chargeDischargeScenario, values);
};

export const chargeDischarge: LessonCard = {
  story: {
    actId: 'machine',
    situation: 'A battery, a converter and a wire to the grid. You choose what is happening — an evening discharge, an outage to carry, a charge off the grid or off the roof — and how hard, and watch what it does to the cells. The last two bring a site and an array with them; the first two are the machine on its own.',
    takeaway: 'Say where the energy went, and why less came out than went in.',
    teaches: ['charge-level', 'converter', 'losses', 'auxiliaries', 'bms', 'ems'],
    soWhat: r => {
      const moved = (r.values.direction ?? 1) >= 0 ? r.totals.deliveredAcWh : r.totals.drawnAcWh;
      const lost = r.totals.converterLossWh + r.totals.batteryLossWh + r.totals.auxiliaryWh;
      if (moved < 1) return 'Nothing was asked of the plant, so nothing moved — and the auxiliaries still ran. Ask for some power and watch where it goes.';
      return `${kWh(moved)} kWh crossed the converter and ${kWh(lost)} kWh never arrived — ${((lost / (moved + lost)) * 100).toFixed(1)}% of it, on one pass in one direction. Nothing was faulty: ${kWh(r.totals.converterLossWh)} kWh went as heat in the converter, ${kWh(r.totals.batteryLossWh)} kWh in the battery's own resistance, ${kWh(r.totals.auxiliaryWh)} kWh in keeping the enclosure cool. A round trip pays it twice. Every figure in every lesson after this one sits on the far side of that.`;
    },
  },
  arrivesIn: null,
  template: sealWith(learningTemplateSchema, {
    id: 'lesson-1',
    label: 'Charge and discharge',
    kind: 'LearningTemplate',
    question: 'Where does the energy go, and why does the charge level change?',
    objective:
      'Follow one megawatt from the grid to the cells and back, and see what is lost at each boundary it crosses on the way.',
    expectedOutcomes: [
      'Discharging lowers the state of charge; charging raises it.',
      'Less alternating current is delivered than direct current left the battery, and the difference is the converter.',
      'Under a constant power request the current rises as the cell voltage falls.',
      'The plant consumes its own auxiliaries in both directions, whether or not it is dispatching.',
    ],
    scenarioId: chargeDischargeScenario.id,
    estimatedMinutes: 4,
    metrics: ['Charge level', 'Power at the connection', 'Energy moved', 'Lost on the way'],
    charts: ['Power at each boundary', 'Charge level'],
  }),
  controls: [
    {
      /**
       * Four occasions, two directions.
       *
       * The sign is what the machine sees: positive is energy leaving the battery, negative is
       * energy going in, and the cells cannot tell whether the electrons came off a roof or a
       * feeder. The occasion is what a reader sees, and it is not decoration — it is the difference
       * between a plant that is earning and a plant that is the only thing keeping a site alive.
       * Both are true at once, and saying so is the honest version of "charge from solar".
       */
      kind: 'choice', id: 'direction', label: 'What is happening', start: 1,
      options: [
        { value: 1, label: 'Evening discharge' },
        { value: 2, label: 'Carrying an outage' },
        { value: -1, label: 'Charging from the grid' },
        { value: -2, label: 'Charging from solar' },
      ],
      hint: 'Discharging sends energy out of the battery; charging takes it in. The cells cannot tell a rooftop from a feeder — the occasion changes what it is worth, not what the machine does.',
    },
    {
      kind: 'slider', id: 'power', label: 'Power', unit: 'kW', scale: 1 / 1000,
      min: 100, max: 2500, step: 100, start: 1_000_000,
      hint: 'What is asked of the plant. The converter and the battery decide how much of it is possible.',
    },
    socControl(0.8),
  ],
  runWith: values => ({
    scenario: chargeDischargeFor(values),
    policy: manualPolicy, plant: teachingPlant,
    manualRequestW: Math.sign(values.direction ?? 1) * (values.power ?? 0),
  }),
  readout: r => {
    const moved = (r.values.direction ?? 1) >= 0 ? r.totals.deliveredAcWh : r.totals.drawnAcWh;
    const lost = r.totals.converterLossWh + r.totals.batteryLossWh + r.totals.auxiliaryWh;
    return [
      { label: 'Charge level', value: pct(r.series.soc[r.act]), unit: '%', foot: `Started at ${(r.series.soc[0] * 100).toFixed(0)}%` },
      {
        label: 'At the connection', value: kW(r.series.gridPowerW[r.act]), unit: 'kW',
        foot: Math.abs(r.series.gridPowerW[r.act]) < 1 ? 'Neither in nor out'
          : r.series.gridPowerW[r.act] > 0 ? 'Exporting to the grid' : 'Drawing from the grid',
      },
      { label: 'Energy moved', value: kWh(moved), unit: 'kWh', foot: 'Measured at the converter’s AC terminals' },
      {
        label: 'Lost on the way', value: kWh(lost), unit: 'kWh',
        foot: `${kWh(r.totals.converterLossWh)} converter · ${kWh(r.totals.batteryLossWh)} battery · ${kWh(r.totals.auxiliaryWh)} auxiliaries`,
      },
    ];
  },
  plots: r => [
    {
      title: 'Power at each boundary', subtitle: 'What was asked, what the converter did, and what reached the connection',
      format: n => `${n.toFixed(0)} kW`, rule: { y: 0, label: 'Neither in nor out' },
      lines: [
        { name: 'Asked for', colour: 4, dashed: true, values: r.series.requestedPowerW.map(p => p / 1000) },
        { name: 'At the converter', colour: 0, values: r.series.achievedPowerW.map(p => p / 1000) },
        { name: 'At the connection', colour: 1, values: r.series.gridPowerW.map(p => p / 1000) },
      ],
    },
    chargeLevelPlot(r, manualPolicy.reserveSoc),
  ],
};

/* ------------------------------------------------- 2. reduce the peak ---- */

const peakScenario = (values: Record<string, number>): Scenario =>
  sealWith(scenarioSchema, { ...dayScenario, id: 'lesson-2-peak', label: 'Reduce the evening peak', policyId: peakShavingPolicy.id, initialSoc: values.initialSoc ?? 0.5 });

const peakPolicy = (values: Record<string, number>): EmsPolicy =>
  sealWith(emsPolicySchema, { ...peakShavingPolicy, peakTargetW: values.target ?? peakShavingPolicy.peakTargetW });

export const reducePeak: LessonCard = {
  story: {
    actId: 'job',
    situation: 'A factory on a demand tariff. Part of the bill is set by the single highest half-hour of the month, and the evening shift puts it there. The plant is not selling anything today — its whole job is to stop the meter ever seeing that peak.',
    takeaway: 'Set an import limit, and say what happens when the battery runs out of the energy to hold it.',
    teaches: ['demand-charge', 'reserve'],
    soWhat: r => {
      const step = r.series.timeSeconds[1] - r.series.timeSeconds[0];
      const target = r.values.target ?? 1_500_000;
      const over = r.series.gridImportW.filter(w => w > target * 1.02).length;
      const held = 100 * (1 - over / Math.max(r.series.gridImportW.length - 1, 1));
      const peak = Math.max(...r.series.gridImportW);
      return over === 0
        ? `The connection never went above ${kW(target)} kW, and it cost ${kWh(r.totals.deliveredAcWh)} kWh through the battery to do it. The bill is set by the worst half-hour, so a limit held all day and a limit held all day but one are not nearly the same thing.`
        : `The limit held for ${held.toFixed(0)}% of the day and then broke: the connection reached ${kW(peak)} kW against a target of ${kW(target)} kW, for ${hours(over * step)} h. The converter was never the problem — it had the power throughout. It ran out of energy. That is the difference between the kilowatts you buy and the kilowatt-hours you buy, and a demand tariff charges you for the moment you got it wrong.`;
    },
  },
  arrivesIn: null,
  template: sealWith(learningTemplateSchema, {
    id: 'lesson-2', label: 'Reduce the evening peak', kind: 'LearningTemplate',
    question: 'How does storage cut the demand a site draws from the grid?',
    objective: 'Set a target the site should not draw above, and watch ergOS hold it there — until the battery runs out of the energy to do it with.',
    expectedOutcomes: [
      'Grid import is held at the target while there is charge to hold it with.',
      'A target set too low is not met all evening: the battery empties before the peak does.',
      'The battery refills only in the room left under the target, so refilling never sets a new peak.',
      'The highest import of the day is what a demand charge is set by, not the average.',
    ],
    scenarioId: 'lesson-2-peak', estimatedMinutes: 5,
    metrics: ['Highest import', 'Held at the target', 'Energy through the battery', 'Charge left'],
    charts: ['Site demand against the connection', 'Charge level'],
  }),
  controls: [
    {
      kind: 'slider', id: 'target', label: 'Import target', unit: 'kW', scale: 1 / 1000,
      min: 600, max: 2400, step: 100, start: 1_500_000,
      hint: 'What the site should not draw above. Lower is worth more and is harder to hold.',
    },
    socControl(0.5),
  ],
  runWith: values => ({ scenario: peakScenario(values), policy: peakPolicy(values), plant: teachingPlant, manualRequestW: 0 }),
  readout: r => {
    const target = r.values.target ?? 1_500_000;
    const step = r.series.timeSeconds[1] - r.series.timeSeconds[0];
    // Within two per cent counts as held. The policy decides on the load at the start of an
    // interval and the site climbs through it, so a plant holding a target perfectly still reports
    // a hair above it at every sample — and calling that a failure would teach the wrong lesson
    // about a real one.
    const band = target * 1.02;
    const over = r.series.gridImportW.filter(w => w > band).length;
    const samples = r.series.gridImportW.length - 1;
    return [
      { label: 'Highest import', value: kW(Math.max(...r.series.gridImportW)), unit: 'kW', foot: `Target ${kW(target)} kW` },
      { label: 'Held at the target', value: (100 * (1 - over / samples)).toFixed(0), unit: '% of the day', foot: over ? `${hours(over * step)} h more than 2% above it` : 'Never more than 2% above it' },
      { label: 'Through the battery', value: kWh(r.totals.deliveredAcWh), unit: 'kWh', foot: `${kWh(r.totals.drawnAcWh)} kWh put back in` },
      { label: 'Charge left', value: pct(r.series.soc[r.series.soc.length - 1]), unit: '%', foot: `Started at ${(r.series.soc[0] * 100).toFixed(0)}%` },
    ];
  },
  plots: r => [
    {
      title: 'Site demand against the connection', subtitle: 'What the site asked for, and what the grid was actually asked for',
      format: n => `${n.toFixed(0)} kW`, rule: { y: (r.values.target ?? 1_500_000) / 1000, label: 'Target' },
      lines: [
        { name: 'Site demand', colour: 4, dashed: true, values: r.series.siteLoadW.map(w => w / 1000) },
        { name: 'From the grid', colour: 1, values: r.series.gridImportW.map(w => w / 1000) },
      ],
    },
    chargeLevelPlot(r, peakShavingPolicy.reserveSoc),
  ],
  baseline: { policy: sealWith(emsPolicySchema, { ...manualPolicy, id: 'policy-no-storage', label: 'The site without storage' }), label: 'The site without storage' },
  compareOn: 'peak',
};

/* --------------------------------------------------- 3. use more solar ---- */

const solarScenario = (values: Record<string, number>): Scenario =>
  sealWith(scenarioSchema, {
    ...dayScenario, id: 'lesson-3-solar', label: 'Use more solar', policyId: selfConsumptionPolicy.id,
    initialSoc: values.initialSoc ?? 0.3,
    generation: scaleProfile(solarProfile, (values.array ?? 2_000_000) / 2_000_000),
  });

export const useSolar: LessonCard = {
  story: {
    actId: 'job',
    situation: 'An array on the roof making more at noon than the site can use, and a site still working at seven in the evening. Without somewhere to put it, the surplus leaves through the gate for whatever the meter pays — and the evening is bought back at retail.',
    takeaway: 'Account for every kilowatt-hour an array makes: used as it was made, stored, exported, or thrown away.',
    teaches: ['self-consumption', 'curtailment'],
    soWhat: r => {
      const step = r.series.timeSeconds[1] - r.series.timeSeconds[0], h = step / 3600;
      const generated = energyWh(r.series.generationW, step);
      const exported = energyWh(r.series.gridExportW, step);
      const curtailed = energyWh(r.series.curtailedW, step);
      let direct = 0, stored = 0;
      for (let i = 0; i < r.series.generationW.length; i++) {
        const gen = r.series.generationW[i];
        direct += Math.min(gen, r.series.siteLoadW[i]) * h;
        stored += Math.min(Math.max(0, -r.series.achievedPowerW[i]), Math.max(0, gen - r.series.siteLoadW[i])) * h;
      }
      if (generated < 1) return 'The array made nothing, so there was nothing to shift. Give it some size and watch where the midday surplus goes.';
      const kept = ((direct + stored) / generated) * 100;
      return `The array made ${kWh(generated)} kWh and the site kept ${kept.toFixed(0)}% of it — ${kWh(direct)} kWh used as it was made, ${kWh(stored)} kWh put away for the evening. ${kWh(exported)} kWh went out of the gate${curtailed > 1 ? ` and ${kWh(curtailed)} kWh was thrown away because there was nowhere for it to go` : ''}. The battery did not make any energy. It moved the time of day at which the site had it, and that is the whole product.`;
    },
  },
  arrivesIn: null,
  template: sealWith(learningTemplateSchema, {
    id: 'lesson-3', label: 'Use more solar', kind: 'LearningTemplate',
    question: 'Why charge at noon and discharge later?',
    objective: 'Store what the array makes while the site cannot use it, and spend it in the evening when the site can.',
    expectedOutcomes: [
      'Generation beyond the site’s own load charges the battery instead of being exported.',
      'The battery never imports from the grid to charge under this policy.',
      'A larger array fills the battery earlier, and what it makes after that is exported or thrown away.',
      'Curtailment is generation nobody could use, and it is reported rather than hidden.',
    ],
    scenarioId: 'lesson-3-solar', estimatedMinutes: 5,
    metrics: ['Generated', 'Used as it was made', 'Stored for later', 'Exported'],
    charts: ['The array against the site', 'Charge level'],
  }),
  controls: [
    {
      kind: 'slider', id: 'array', label: 'Array size', unit: 'kW', scale: 1 / 1000,
      min: 500, max: 4000, step: 250, start: 2_000_000,
      hint: 'How much the roof can make at noon on a clear day.',
    },
    socControl(0.3),
  ],
  runWith: values => ({ scenario: solarScenario(values), policy: selfConsumptionPolicy, plant: teachingPlant, manualRequestW: 0 }),
  readout: r => {
    const step = r.series.timeSeconds[1] - r.series.timeSeconds[0];
    const h = step / 3600;
    const generated = energyWh(r.series.generationW, step);
    const exported = energyWh(r.series.gridExportW, step);
    const curtailed = energyWh(r.series.curtailedW, step);
    // Where each kilowatt-hour the array made actually went: straight into the site's own load,
    // into the battery for later, or out of the gate. Four figures that sum to what was generated
    // teach more than one that says "self-consumption" and leaves the reader to trust it.
    let direct = 0, stored = 0;
    for (let i = 0; i < r.series.generationW.length; i++) {
      const gen = r.series.generationW[i];
      direct += Math.min(gen, r.series.siteLoadW[i]) * h;
      stored += Math.min(Math.max(0, -r.series.achievedPowerW[i]), Math.max(0, gen - r.series.siteLoadW[i])) * h;
    }
    return [
      { label: 'Generated', value: kWh(generated), unit: 'kWh', foot: 'Over the whole day' },
      { label: 'Used as it was made', value: kWh(direct), unit: 'kWh', foot: generated > 0 ? `${((direct / generated) * 100).toFixed(0)}% of it went straight into the site` : '—' },
      { label: 'Stored for later', value: kWh(stored), unit: 'kWh', foot: 'Charged from the surplus, never from the grid' },
      { label: 'Exported', value: kWh(exported), unit: 'kWh', foot: curtailed > 1 ? `And ${kWh(curtailed)} kWh thrown away` : 'Nothing was thrown away' },
    ];
  },
  plots: r => [
    {
      title: 'The array against the site', subtitle: 'What was generated, what the site needed, and what the battery took',
      format: n => `${n.toFixed(0)} kW`, rule: { y: 0, label: 'Neither in nor out' },
      lines: [
        { name: 'Generation', colour: 4, values: r.series.generationW.map(w => w / 1000) },
        { name: 'Site load', colour: 2, dashed: true, values: r.series.siteLoadW.map(w => w / 1000) },
        { name: 'Battery', colour: 0, values: r.series.achievedPowerW.map(w => w / 1000) },
      ],
    },
    chargeLevelPlot(r, selfConsumptionPolicy.reserveSoc),
  ],
  compareOn: 'self-consumption',
};

/* ---------------------------------------------- 4. keep backup ready ---- */

const backupScenario = (values: Record<string, number>): Scenario => {
  const lengthHours = values.outageHours ?? 1;
  return sealWith(scenarioSchema, {
    ...dayScenario, id: 'lesson-4-backup', label: 'Keep backup ready',
    plantId: backupPlant.id, policyId: backupReservePolicy.id,
    initialSoc: values.initialSoc ?? 0.5,
    outage: { fromSeconds: 18 * 3600, toSeconds: Math.min(24, 18 + lengthHours) * 3600 },
  });
};

const backupPolicy = (values: Record<string, number>): EmsPolicy =>
  sealWith(emsPolicySchema, { ...backupReservePolicy, reserveSoc: values.reserve ?? backupReservePolicy.reserveSoc });

export const keepBackupReady: LessonCard = {
  story: {
    actId: 'job',
    situation: 'The same plant, on a site that cannot go dark. The grid will fail at six this evening; nothing in the model knows that yet. Every kilowatt-hour sold before then is a kilowatt-hour that will not be there.',
    takeaway: 'Decide what share of the battery is not for sale, and see exactly what that reserve buys.',
    teaches: [],
    soWhat: r => {
      const step = r.series.timeSeconds[1] - r.series.timeSeconds[0];
      const lengthH = r.values.outageHours ?? 1;
      const during = r.series.timeSeconds.map((t, i) => ({ t, i })).filter(({ t }) => t >= 18 * 3600 && t < (18 + lengthH) * 3600);
      const carried = during.filter(({ i }) => r.series.unservedLoadW[i] < 1).length * step / 3600;
      const unserved = energyWh(r.series.unservedLoadW, step);
      const reserve = ((r.values.reserve ?? 0.5) * 100).toFixed(0);
      return unserved < 1
        ? `Holding ${reserve}% back carried the site through all ${lengthH.toFixed(0)} h. That reserve earned nothing all day — it was not idle capital, it was the product. A reserve policy is a decision about which hours you are being paid for, and it has to be made before the outage, because afterwards it is not a decision.`
        : `Holding ${reserve}% back carried ${hours(carried * 3600)} h of a ${lengthH.toFixed(0)} h outage, and ${kWh(unserved)} kWh of load went unserved: the site went dark with a battery still on site. Raise the reserve and the plant earns less on every ordinary day. That trade is the whole of backup sizing, and nobody can make it for you from a datasheet.`;
    },
  },
  arrivesIn: null,
  template: sealWith(learningTemplateSchema, {
    id: 'lesson-4', label: 'Keep backup ready', kind: 'LearningTemplate',
    question: 'Why stop selling energy while there is still charge left?',
    objective: 'Hold a reserve back for an outage that has not happened yet, then watch the grid go and the plant carry the site on exactly that energy.',
    expectedOutcomes: [
      'Under normal economics nothing is discharged below the reserve.',
      'When the grid goes, the same plant is allowed down to the emergency floor — which is what the reserve was being kept for.',
      'The island is run locally: the supervisory layer is not in the path between the load and the battery.',
      'A reserve set too low does not carry the outage, and the run says the site went dark rather than pretending otherwise.',
    ],
    scenarioId: 'lesson-4-backup', estimatedMinutes: 5,
    metrics: ['Held for backup', 'Outage carried', 'Left unserved', 'Charge at the end'],
    charts: ['The site, and who was supplying it', 'Charge level'],
  }),
  controls: [
    {
      kind: 'slider', id: 'reserve', label: 'Reserve held back', unit: '%', scale: 100,
      min: 10, max: 90, step: 5, start: 0.5,
      hint: 'How much of the battery is kept for an outage instead of being spent.',
    },
    {
      kind: 'slider', id: 'outageHours', label: 'How long the grid is gone', unit: 'h', scale: 1,
      min: 1, max: 5, step: 1, start: 1,
      hint: 'The outage begins at six in the evening, in the middle of the site’s own peak.',
    },
    socControl(0.5),
  ],
  runWith: values => ({ scenario: backupScenario(values), policy: backupPolicy(values), plant: backupPlant, manualRequestW: 0 }),
  readout: r => {
    const step = r.series.timeSeconds[1] - r.series.timeSeconds[0];
    const unserved = energyWh(r.series.unservedLoadW, step);
    const lengthH = r.values.outageHours ?? 1;
    const during = r.series.timeSeconds.map((t, i) => ({ t, i })).filter(({ t }) => t >= 18 * 3600 && t < (18 + lengthH) * 3600);
    const carried = during.filter(({ i }) => r.series.unservedLoadW[i] < 1).length * step;
    return [
      { label: 'Held for backup', value: ((r.values.reserve ?? 0.5) * 100).toFixed(0), unit: '%', foot: `Emergency floor ${(backupReservePolicy.emergencyReserveSoc * 100).toFixed(0)}%` },
      { label: 'Outage carried', value: hours(carried), unit: 'h', foot: `of ${lengthH.toFixed(0)} h without a grid` },
      { label: 'Left unserved', value: kWh(unserved), unit: 'kWh', foot: unserved > 1 ? 'The site went dark for part of it' : 'The site stayed up throughout' },
      { label: 'Charge at the end', value: pct(r.series.soc[r.series.soc.length - 1]), unit: '%', foot: `Started at ${(r.series.soc[0] * 100).toFixed(0)}%` },
    ];
  },
  plots: r => [
    {
      title: 'The site, and who was supplying it', subtitle: 'What the site needed, what the grid gave, and what the battery carried',
      format: n => `${n.toFixed(0)} kW`,
      lines: [
        { name: 'Site load', colour: 4, dashed: true, values: r.series.siteLoadW.map(w => w / 1000) },
        { name: 'From the grid', colour: 1, values: r.series.gridImportW.map(w => w / 1000) },
        { name: 'From the battery', colour: 0, values: r.series.achievedPowerW.map(w => w / 1000) },
        { name: 'Unserved', colour: 2, values: r.series.unservedLoadW.map(w => w / 1000) },
      ],
    },
    {
      title: 'Charge level', subtitle: 'The reserve, and the emergency floor an outage may use',
      format: n => `${n.toFixed(0)}%`, yMin: 0,
      rule: { y: (r.values.reserve ?? 0.5) * 100, label: 'Reserve' },
      lines: [
        { name: 'Charge level', colour: 0, values: r.series.soc.map(v => v * 100) },
        { name: 'Emergency floor', colour: 2, dashed: true, values: r.series.soc.map(() => backupReservePolicy.emergencyReserveSoc * 100) },
      ],
    },
  ],
};

/* ------------------------------------------------- 5. follow the price ---- */

const priceScenario = (values: Record<string, number>): Scenario =>
  sealWith(scenarioSchema, {
    ...dayScenario, id: 'lesson-5-price', label: 'Follow a price schedule',
    policyId: priceSchedulePolicy.id, initialSoc: values.initialSoc ?? 0.3,
  });

const schedulePolicy = (values: Record<string, number>): EmsPolicy => {
  const cheapUntil = values.cheapUntil ?? 6;
  const fraction = values.buyFraction ?? 0.4;
  return sealWith(emsPolicySchema, {
    ...priceSchedulePolicy,
    priceWindows: [
      { fromHour: 0, toHour: cheapUntil, pricePerMWh: 3_000, action: 'charge', powerFraction: fraction },
      { fromHour: cheapUntil, toHour: 18, pricePerMWh: 7_000, action: 'hold', powerFraction: 1 },
      { fromHour: 18, toHour: 22, pricePerMWh: 12_000, action: 'discharge', powerFraction: 1 },
    ],
  });
};

export const followPrice: LessonCard = {
  story: {
    actId: 'job',
    situation: 'A price that moves through the day, and a plant allowed to buy and sell. It looks like the easiest money in the building. It is arithmetic: the trade only works if the gap between the two prices is wider than what the round trip costs you.',
    takeaway: 'Work out whether a price spread actually covers the round trip, before anything is called a saving.',
    teaches: ['round-trip'],
    soWhat: r => {
      // The battery's own trade, not the site's meter: grid import carries the site load too, and
      // subtracting one from the other would attribute the factory's consumption to the arbitrage.
      const inAc = r.totals.drawnAcWh, outAc = r.totals.deliveredAcWh;
      if (inAc < 1 && outAc < 1) return 'The plant neither bought nor sold, so there was nothing to arbitrage. Move the cheap window and watch it decide when to fill up.';
      const lost = r.totals.converterLossWh + r.totals.batteryLossWh + r.totals.auxiliaryWh;
      // Stated from the losses rather than from in minus out, because a single day that starts and
      // ends at different charge levels does not close: a plant that began half full can deliver
      // more than it drew and appear to have made energy. The losses are the physical figure; the
      // open position is disclosed rather than netted away, per §11.4.
      const drift = r.series.soc[r.series.soc.length - 1] - r.series.soc[0];
      const overhead = (lost / Math.max(outAc, 1e-6)) * 100;
      return `The plant took in ${kWh(inAc)} kWh, gave back ${kWh(outAc)} kWh and lost ${kWh(lost)} kWh doing it — ${overhead.toFixed(0)}% on top of everything it delivered. The dear price has to beat the cheap one by more than that before a single rupee is made, and that is before anything is paid for the plant itself.${Math.abs(drift) > 0.02
        ? ` Note that the day did not close: it ended ${(Math.abs(drift) * 100).toFixed(0)} points ${drift > 0 ? 'fuller' : 'emptier'} than it started, so the two figures above are not a round trip on their own — the loss is.`
        : ''} The cost beside this run is a scenario outcome on an illustrative tariff, not an offer.`;
    },
  },
  arrivesIn: null,
  template: sealWith(learningTemplateSchema, {
    id: 'lesson-5', label: 'Follow a price schedule', kind: 'LearningTemplate',
    question: 'Why does the timing of charging matter?',
    objective: 'Buy energy in the cheap window and sell it in the dear one, and see what the round trip costs before anything is called a saving.',
    expectedOutcomes: [
      'Charging in the cheap window and discharging in the dear one is worth more than the energy alone.',
      'A shorter cheap window leaves the battery with less to sell in the evening.',
      'The round trip loses energy, so the price difference has to cover the losses before anything is gained.',
      'Prices here are illustrative, and a comparison that ends with different charge levels is reconciled before it claims anything.',
    ],
    scenarioId: 'lesson-5-price', estimatedMinutes: 5,
    metrics: ['Bought', 'Sold', 'Illustrative cost', 'Charge at the end'],
    charts: ['The price, and what the plant did about it', 'Charge level'],
  }),
  controls: [
    {
      kind: 'slider', id: 'cheapUntil', label: 'Cheap window ends at', unit: ':00', scale: 1,
      min: 2, max: 10, step: 1, start: 6,
      hint: 'How long the overnight price lasts. The dear window is six until ten in the evening.',
    },
    {
      kind: 'slider', id: 'buyFraction', label: 'How hard it buys', unit: '% of the plant', scale: 100,
      min: 10, max: 100, step: 10, start: 0.4,
      hint: 'Filling quickly finishes before the cheap window does; filling gently may not finish at all.',
    },
    socControl(0.3),
  ],
  runWith: values => ({ scenario: priceScenario(values), policy: schedulePolicy(values), plant: teachingPlant, manualRequestW: 0 }),
  readout: r => {
    const step = r.series.timeSeconds[1] - r.series.timeSeconds[0];
    const price = dayScenario.price!.samples;
    let cost = 0;
    for (let i = 0; i < r.series.gridImportW.length; i++) {
      const p = price[Math.min(i, price.length - 1)] ?? 0;
      cost += ((r.series.gridImportW[i] - r.series.gridExportW[i]) * (step / 3600) / 1e6) * p;
    }
    return [
      { label: 'Bought', value: kWh(energyWh(r.series.gridImportW, step)), unit: 'kWh', foot: 'Drawn from the grid over the day' },
      { label: 'Sold', value: kWh(energyWh(r.series.gridExportW, step)), unit: 'kWh', foot: 'Sent back to the grid' },
      { label: 'Illustrative cost', value: `₹${Math.round(cost).toLocaleString('en-IN')}`, foot: 'At the illustrative tariff, for the day' },
      { label: 'Charge at the end', value: pct(r.series.soc[r.series.soc.length - 1]), unit: '%', foot: `Started at ${(r.series.soc[0] * 100).toFixed(0)}%` },
    ];
  },
  plots: r => [
    {
      title: 'The price, and what the plant did about it', subtitle: 'Illustrative prices, in rupees per megawatt-hour, against the plant’s own power',
      format: n => `${n.toFixed(0)}`,
      lines: [
        { name: 'Price ₹/MWh ÷ 10', colour: 4, dashed: true, values: (dayScenario.price?.samples ?? []).concat(0).map(p => p / 10) },
        { name: 'Battery kW', colour: 0, values: r.series.achievedPowerW.map(w => w / 1000) },
      ],
    },
    chargeLevelPlot(r, priceSchedulePolicy.reserveSoc),
  ],
  baseline: { policy: fixedSchedulePolicy, label: 'A fixed schedule' },
  compareOn: 'cost',
};

/* ------------------------------------------- 6. when the battery says no -- */

const limitConditions = [normalCondition, hotCondition, weakCellCondition];

const limitScenario = (values: Record<string, number>): Scenario => {
  const base = limitConditions[Math.round(values.condition ?? 0)] ?? normalCondition;
  return sealWith(scenarioSchema, {
    ...base, id: 'lesson-6-limits', label: 'When the battery says slow down',
    plantId: teachingPlant.id, policyId: manualPolicy.id,
    initialSoc: values.initialSoc ?? 0.8,
  });
};

export const batteryLimits: LessonCard = {
  story: {
    actId: 'limits',
    situation: 'The same request, put to the plant three times: at rest, hot, and with one weak cell. The request does not change. What comes back does — and something has to decide, by name, how much of it you get.',
    takeaway: 'Name the subsystem that refused a request, and read the number it refused with.',
    teaches: [],
    soWhat: r => {
      const held = r.series.bindingConstraint.filter(c => c && c !== 'Request met in full');
      const asked = kWh((r.values.power ?? 0) * 2);
      if (!held.length) return `The plant met the request throughout and delivered ${kWh(r.totals.deliveredAcWh)} kWh. Ask for more, or make it hot, and something will start saying no — the point is that it says so by name rather than simply underperforming.`;
      const commonest = [...held.reduce((m, c) => m.set(c, (m.get(c) ?? 0) + 1), new Map<string, number>())].sort((a, b) => b[1] - a[1])[0][0];
      return `${kWh(r.totals.deliveredAcWh)} kWh came out against ${asked} kWh had nothing held it back, and what held it back, for ${((held.length / Math.max(r.series.bindingConstraint.length - 1, 1)) * 100).toFixed(0)}% of the run, was “${commonest}”. A plant that quietly underperforms is a warranty argument two years from now. A plant that names the subsystem that refused, and the number it refused at, is an engineering record.`;
    },
  },
  arrivesIn: null,
  template: sealWith(learningTemplateSchema, {
    id: 'lesson-6', label: 'When the battery says slow down', kind: 'LearningTemplate',
    question: 'Who wins when a request exceeds a limit?',
    objective: 'Ask the same thing of the same plant in three different conditions, and watch a different subsystem refuse each time.',
    expectedOutcomes: [
      'The same request gets different answers from the same plant in different conditions.',
      'A hot plant is held back by the cell temperature protection before the converter’s own derating reaches it.',
      'One weak cell limits the whole pack, however healthy the average is.',
      'Whatever holds it back is named, and the plant never steps past a protection limit to get there.',
    ],
    scenarioId: 'lesson-6-limits', estimatedMinutes: 5,
    metrics: ['Delivered', 'What held it back', 'Hottest cell', 'Lowest cell voltage'],
    charts: ['Asked against achieved', 'Cell temperature'],
  }),
  controls: [
    {
      kind: 'choice', id: 'condition', label: 'The condition it is in', start: 0,
      options: [{ value: 0, label: 'Nothing wrong' }, { value: 1, label: 'A hot day' }, { value: 2, label: 'One weak cell' }],
      hint: 'The same plant and the same request, in three conditions. Each is an injected condition, not a claim about how often it happens.',
    },
    {
      kind: 'slider', id: 'power', label: 'Power asked for', unit: 'kW', scale: 1 / 1000,
      min: 500, max: 2500, step: 100, start: 2_000_000,
      hint: 'What is asked of the plant. Whether it is possible is somebody else’s decision.',
    },
    socControl(0.8),
  ],
  runWith: values => ({ scenario: limitScenario(values), policy: manualPolicy, plant: teachingPlant, manualRequestW: values.power ?? 2_000_000 }),
  readout: r => {
    const held = r.series.bindingConstraint.filter(c => c && c !== 'Request met in full');
    const commonest = held.length
      ? [...held.reduce((m, c) => m.set(c, (m.get(c) ?? 0) + 1), new Map<string, number>())]
        .sort((a, b) => b[1] - a[1])[0][0]
      : 'Nothing';
    return [
      { label: 'Delivered', value: kWh(r.totals.deliveredAcWh), unit: 'kWh', foot: `Of ${kWh((r.values.power ?? 0) * 2)} kWh if nothing had held it back` },
      { label: 'What held it back', value: commonest, foot: held.length ? `For ${((held.length / (r.series.bindingConstraint.length - 1)) * 100).toFixed(0)}% of the run` : 'The request was met throughout' },
      { label: 'Hottest cell', value: Math.max(...r.series.cellTempMaxC).toFixed(1), unit: '°C', foot: `Started at ${r.series.cellTempC[0].toFixed(0)} °C` },
      { label: 'Lowest cell voltage', value: Math.min(...r.series.cellVoltageMinV).toFixed(3), unit: 'V', foot: 'Across every cell, not the average' },
    ];
  },
  plots: r => [
    {
      title: 'Asked against achieved', subtitle: 'The gap between the two is somebody’s decision, and it has a name',
      format: n => `${n.toFixed(0)} kW`,
      lines: [
        { name: 'Asked for', colour: 4, dashed: true, values: r.series.requestedPowerW.map(w => w / 1000) },
        { name: 'Achieved', colour: 0, values: r.series.achievedPowerW.map(w => w / 1000) },
      ],
    },
    {
      title: 'Cell temperature', subtitle: 'The hottest cell, which is the one the protections read',
      format: n => `${n.toFixed(0)} °C`, yMin: 0,
      lines: [{ name: 'Hottest cell', colour: 2, values: r.series.cellTempMaxC }],
    },
  ],
};

/* ------------------------------------------ 7. UPS from contract demand ---- */

/**
 * The plant a selected configuration actually is, built from the catalogue entry rather than
 * described by it: the cells in series that make its string voltage, the strings in parallel that
 * make its energy, and the converters that were chosen for it.
 *
 * §15.3 forbids invented ratings, so every number here is multiplied out of a real catalogue row.
 */
export function plantFromOption(option: UpsOption): PlantConfiguration {
  const pack = byId(packSpecs, option.enclosure.packSpecId);
  const seriesCells = pack.series * option.enclosure.packsInSeries;
  const stringsPerUnit = Math.max(1, Math.round((option.enclosure.racks * option.enclosure.packsPerRack) / option.enclosure.packsInSeries));
  const parallelStrings = stringsPerUnit * option.enclosureCount;
  const dc = stringVoltage(option.enclosure);
  const ratedW = option.pcsCount * option.pcs.ratedKW * 1000;
  return sealWith(plantConfigurationSchema, {
    id: `plant-ups-${option.enclosure.id}-${option.enclosureCount}-${option.pcs.id}-${option.pcsCount}`,
    label: `${option.enclosureCount} × ${option.enclosure.model} with ${option.pcsCount} × ${option.pcs.model}`,
    kind: 'PlantConfiguration',
    cellTopology: { series: pack.series, parallel: 1 },
    packTopology: { series: option.enclosure.packsInSeries, parallel: parallelStrings },
    parameterSetId: lfpParameterSet.id,
    converter: {
      model: `${option.pcsCount} × ${option.pcs.model}`,
      ratedW,
      // The catalogue states active power only. Nothing is invented here: the apparent rating is
      // taken as equal to it, which is the conservative reading, and the caveat says so.
      ratedVA: ratedW,
      dcMinV: Math.max(option.pcs.dcMinV, Math.floor(dc.minV)),
      dcMaxV: Math.min(option.pcs.dcMaxV, Math.ceil(dc.maxV)),
      dcMaxA: option.pcs.dcMaxA * option.pcsCount,
      chargeEfficiency: option.pcs.efficiency,
      dischargeEfficiency: option.pcs.efficiency,
      standbyW: 200 * option.pcsCount,
      rampWPerSecond: ratedW,
      deratingStartC: 45,
      deratingPerC: 0.02,
      provenance: illustrative(
        `Ratings, DC window and current limit from the catalogue entry for ${option.pcs.model}; standby, ramp and derating are illustrative teaching values.`,
        [
          'The catalogue states active power only, so the apparent-power rating is taken as equal to it.',
          'No catalogue entry here is qualified for UPS duty, and none is assumed to be.',
        ],
      ),
    },
    gridImportLimitW: ratedW * 2,
    gridExportLimitW: ratedW,
    auxiliaryW: 500 * option.enclosureCount,
    coolingCapacityW: 5_000 * option.enclosureCount,
    coolingInputW: 2_000 * option.enclosureCount,
    ambientC: 30,
    // The transfer equipment is part of this illustrative configuration. Whether the transfer is
    // fast enough for the load is a separate question, and one arithmetic cannot answer: the
    // continuity status beside it says so in every panel.
    islandCapable: true,
  });
}

const upsAssumptions = (values: Record<string, number>): UpsAssumptions => ({
  ...defaultAssumptions(),
  startSoc: values.readiness ?? defaultAssumptions().startSoc,
});

const upsInput = (values: Record<string, number>) => ({
  contract: { value: contractDemands[Math.round(values.contract ?? 2)] ?? 500, unit: 'kVA' as const },
  protectedFraction: protectedShares[Math.round(values.share ?? 1)] ?? 0.5,
  durationMinutes: backupDurations[Math.round(values.duration ?? 1)] ?? 15,
  assumptions: upsAssumptions(values),
});

/** The system being held still, where the learner chose to test one rather than resize it. */
const heldFrom = (values: Record<string, number>): HeldSystem | null =>
  values.held === 1 && enclosures[Math.round(values.heldEnclosure ?? -1)] && pcsUnits[Math.round(values.heldPcs ?? -1)]
    ? {
      enclosureId: enclosures[Math.round(values.heldEnclosure)].id,
      enclosureCount: Math.max(1, Math.round(values.heldEnclosureCount ?? 1)),
      pcsId: pcsUnits[Math.round(values.heldPcs)].id,
      pcsCount: Math.max(1, Math.round(values.heldPcsCount ?? 1)),
    }
    : null;

/** The configuration a given setting actually runs on: the one held, or the one sized for it. */
export function upsConfiguration(values: Record<string, number>) {
  const input = upsInput(values);
  const requirement = requirementFrom(input);
  const { options, problems } = optionsFor(requirement);
  const held = heldFrom(values);
  const option = held ? heldOption(held, requirement) : options[0];
  return { input, requirement, options, problems, held, option };
}

const upsScenario = (values: Record<string, number>, protectedKW: number, plantId: string): Scenario => {
  const minutes = backupDurations[Math.round(values.duration ?? 1)] ?? 15;
  // Grid healthy, grid fails, protected load carried, grid returns: the sequence §15.3 animates.
  // A quarter of the run before the outage and a quarter after it, so both transitions are visible.
  const outageSeconds = minutes * 60;
  const durationSeconds = Math.round(outageSeconds * 2);
  const stepSeconds = Math.max(5, Math.round(durationSeconds / 120 / 5) * 5);
  const steps = Math.round(durationSeconds / stepSeconds);
  const from = Math.round(durationSeconds * 0.25 / stepSeconds) * stepSeconds;
  return sealWith(scenarioSchema, {
    id: 'lesson-7-ups', label: 'UPS support from contract demand', kind: 'Scenario',
    plantId, policyId: 'policy-ups-reserve',
    initialSoc: values.readiness ?? 1, initialCellTempC: 25, ambientC: null,
    durationSeconds, stepSeconds,
    siteLoad: { name: 'Protected load', unit: 'W', samples: Array.from({ length: steps }, () => Math.round(protectedKW * 1000)) },
    generation: null, price: null,
    outage: { fromSeconds: from, toSeconds: Math.min(durationSeconds, from + outageSeconds) },
    injected: { weakCell: null, coolingFailsAtSeconds: null, communicationLostAtSeconds: null, telemetryLostAtSeconds: null },
    reactiveVar: 0, controls: [],
  });
};

const upsPolicy = (values: Record<string, number>): EmsPolicy => sealWith(emsPolicySchema, {
  ...backupReservePolicy,
  id: 'policy-ups-reserve', label: 'Hold the whole battery for the outage',
  // A UPS reserve is the whole usable window: an economic policy may spend none of it, which is
  // §15.3's "prevents economic dispatch from eating the required reserve".
  reserveSoc: Math.min(1, values.readiness ?? 1),
  emergencyReserveSoc: defaultAssumptions().minSoc,
});

export const upsSizing: LessonCard = {
  story: {
    actId: 'limits',
    situation: 'Your own electricity bill, and one figure on it: the contract demand. Every UPS conversation in India starts there, and it is not the answer — it estimates what the whole site draws, not what has to stay up.',
    takeaway: 'Turn a contract demand into a protected load and a duration, and say what the estimate still does not tell you.',
    teaches: ['contract-demand', 'power-factor'],
    soWhat: r => {
      const step = r.series.timeSeconds[1] - r.series.timeSeconds[0];
      const carried = r.series.unservedLoadW.filter(w => w < 1).length * step / 60;
      const unserved = energyWh(r.series.unservedLoadW, step);
      const minutes = backupDurations[Math.round(r.values.duration ?? 1)] ?? 15;
      const tail = ' Every figure here is indicative sizing from contract demand. It becomes a specification when a measured load profile or an approved schedule of critical loads replaces the estimate — not before.';
      return (unserved < 1
        ? `The configuration carried the protected load for the whole ${minutes} min.`
        : `The configuration ran out: ${carried.toFixed(0)} min of the ${minutes} min asked for, with ${kWh(unserved)} kWh unserved.`)
        + ' Notice which control changed which answer: the share of load to protect set the inverter, and the duration set the battery. Doubling the minutes did not need a bigger converter.' + tail;
    },
  },
  arrivesIn: null,
  template: sealWith(learningTemplateSchema, {
    id: 'lesson-7', label: 'UPS support by contract demand', kind: 'LearningTemplate',
    question: 'How much protected power and energy does my site need?',
    objective: 'Start from the contract demand on your electricity bill, decide how much of the site to protect and for how long, and see what that asks of the equipment — and what it does not tell you.',
    expectedOutcomes: [
      'Contract demand estimates site demand. It does not measure critical load, and it is not the UPS rating.',
      'Protecting more of the site raises the power requirement; a longer outage raises the energy without raising the inverter.',
      'The energy the load takes is not the battery to buy: the path losses and the usable window come first.',
      'A short outage at high power is limited by discharge rate, not by energy.',
      'No arithmetic here verifies continuity. A no-break claim needs equipment evidence.',
    ],
    scenarioId: 'lesson-7-ups', estimatedMinutes: 5,
    metrics: ['Protected load', 'Required UPS rating', 'Battery nameplate estimate', 'Runtime achieved'],
    charts: ['Charge level through the outage', 'Protected demand against served power'],
  }),
  controls: [
    {
      kind: 'choice', id: 'contract', label: 'Contract demand', start: 2,
      options: contractDemands.map((v, i) => ({ value: i, label: `${v.toLocaleString()} kVA` })),
      hint: 'The figure on the electricity bill. It estimates what the site draws, not what must be protected.',
    },
    {
      kind: 'choice', id: 'share', label: 'Load to protect', start: 1,
      options: protectedShares.map((v, i) => ({ value: i, label: `${v * 100}%` })),
      hint: 'How much of the estimated site load has to stay up. A measured schedule of critical loads replaces this.',
    },
    {
      kind: 'choice', id: 'duration', label: 'Backup duration', start: 1,
      options: backupDurations.map((v, i) => ({ value: i, label: `${v} min` })),
      hint: 'How long it has to stay up for. Longer needs more energy; it does not need a bigger inverter.',
    },
  ],
  runWith: values => {
    const { requirement, option } = upsConfiguration(values);
    const plant = option ? plantFromOption(option) : teachingPlant;
    return {
      scenario: upsScenario(values, requirement.protectedKW, plant.id),
      policy: upsPolicy(values), plant, manualRequestW: 0,
    };
  },
  sizing: values => {
    const { requirement, options, problems, held, option } = upsConfiguration(values);
    const a = upsAssumptions(values);
    const minutes = backupDurations[Math.round(values.duration ?? 1)] ?? 15;
    // While a system is held, the first card is that system — not a configuration sized for this
    // duty, which is equipment nobody has. What the duty *would* need is shown beside it, which is
    // the comparison the learner asked for by pressing Test rather than Resize.
    const shown: UpsOption[] = held && option
      ? [{ ...option, role: 'under-test' }, ...(options[0] ? [{ ...options[0], role: 'would-need' as const }] : [])]
      : options;
    // The operating scenario the comparison runs in, and with it the schedule of outages. §15.4
    // keeps that schedule independent of the backup duration the learner chose: selecting two hours
    // of design autonomy must not turn every outage into a two-hour event.
    const preset = indiaPresets[Math.round(values.conditions ?? 0)] ?? indiaPresets[0];
    const tariff = teachingTariffs[Math.round(values.tariff ?? 1)] ?? teachingTariffs[1];
    const horizonYears = ([5, 10, 15] as const)[Math.round(values.horizon ?? 1)] ?? 10;
    // Prices are entered or they are not. With nothing entered the ledger carries the gaps rather
    // than filling them, which is the honest default; the quoted set is what a site with
    // quotations would see.
    const costs = values.priced === 1
      ? quotedCosts({ tariffInrPerKWh: tariff, batteryInrPerKWh: 12_000, conversionInrPerKW: 9_000, disposalInrPerKg: 5, residualFraction: 0.05 })
      : illustrativeCosts(tariff);
    const india = compareInIndia({
      protectedKW: requirement.protectedKW, autonomyMinutes: minutes, preset,
      horizonYears, tariffInrPerKWh: tariff, costs,
    });
    const events = preset.outages;
    const chemistry = india.chemistry;
    const lfpEnergy = chemistry.options.find(o => o.chemistry === 'LFP')?.installedEnergyKWh ?? 0;
    const vrlaBlocks = chemistry.options.find(o => o.chemistry === 'VRLA')?.blocks;
    return {
      requirement, options: shown, problems, assumptions: a,
      readiness: readiness(option, requirement, a, minutes),
      held: held && option ? { option, shortfalls: shortfalls(option, requirement, a, minutes) } : null,
      continuity: 'Continuity not verified — an energy model cannot establish zero-break transfer, voltage quality or protection coordination.',
      chemistry, india,
      repeated: (['VRLA', 'LFP'] as const).map(c => ({
        chemistry: c,
        events: repeatedOutages({
          chemistry: c, protectedKW: requirement.protectedKW, tempC: india.batteryC, events, dayMinutes: 1440,
          assumptions: a, chargerCPerHour: preset.chargerCPerHour, installedKWh: lfpEnergy, blocks: vrlaBlocks,
        }).events,
      })),
    };
  },
  readout: r => {
    const { requirement, option } = upsConfiguration(r.values);
    const minutes = backupDurations[Math.round(r.values.duration ?? 1)] ?? 15;
    const step = r.series.timeSeconds[1] - r.series.timeSeconds[0];
    const carried = r.series.unservedLoadW.filter((w, i) => w < 1 && r.series.achievedPowerW[i] > 1).length * step;
    return [
      {
        label: 'Protected load', value: requirement.protectedKW.toFixed(0), unit: 'kW',
        foot: `${requirement.protectedKVA.toFixed(0)} kVA at ${requirement.fromMeasuredLoad ? 'the measured' : 'an assumed 0.90'} power factor`,
      },
      {
        label: 'Required UPS rating', value: requirement.requiredKW.toFixed(0), unit: 'kW',
        foot: `${requirement.requiredKVA.toFixed(0)} kVA, after 20% headroom and before derating`,
      },
      {
        label: 'Battery nameplate estimate', value: requirement.nominalBatteryKWh.toFixed(0), unit: 'kWh',
        foot: `The load itself takes ${requirement.loadEnergyKWhAc.toFixed(1)} kWh — that is not the battery`,
      },
      {
        label: 'Runtime achieved', value: (carried / 60).toFixed(0), unit: 'min',
        foot: option ? `Of ${minutes} min asked for, on ${option.enclosureCount} × ${option.enclosure.model}` : 'No configuration selected',
      },
    ];
  },
  plots: r => [
    {
      title: 'Charge level through the outage', subtitle: 'From readiness down to the floor the outage may use',
      format: n => `${n.toFixed(0)}%`, yMin: 0,
      rule: { y: defaultAssumptions().minSoc * 100, label: 'Floor' },
      lines: [{ name: 'Charge level', colour: 0, values: r.series.soc.map(v => v * 100) }],
    },
    {
      title: 'Protected demand against served power', subtitle: 'What the load asked for, what the plant supplied, and anything it did not',
      format: n => `${n.toFixed(0)} kW`,
      lines: [
        { name: 'Protected demand', colour: 4, dashed: true, values: r.series.siteLoadW.map(w => w / 1000) },
        { name: 'Served by the plant', colour: 0, values: r.series.achievedPowerW.map(w => w / 1000) },
        { name: 'Unserved', colour: 2, values: r.series.unservedLoadW.map(w => w / 1000) },
      ],
    },
  ],
};

/* ------------------------------------------------------- the catalogue ---- */

/** A card for a lesson that has not been built, so the catalogue is honest about what exists. */
const planned = (n: number, title: string, question: string, arrivesIn: string): LessonCard => ({
  arrivesIn,
  story: { actId: 'limits', situation: 'Not built yet.', takeaway: 'Not built yet.', teaches: [], soWhat: () => 'Not built yet.' },
  template: sealWith(learningTemplateSchema, {
    id: `lesson-${n}`, label: title, kind: 'LearningTemplate', question,
    objective: 'Not built yet.', expectedOutcomes: ['Not built yet.'],
    scenarioId: chargeDischargeScenario.id, estimatedMinutes: 4, metrics: [], charts: [],
  }),
  controls: [],
  runWith: () => ({ scenario: chargeDischargeScenario, policy: manualPolicy, plant: teachingPlant, manualRequestW: 0 }),
  readout: () => [],
  plots: () => [],
});

export const lessons: LessonCard[] = [
  chargeDischarge,
  reducePeak,
  useSolar,
  keepBackupReady,
  followPrice,
  batteryLimits,
  upsSizing,
];

/** Hold the configuration a lesson has just sized, so the next duty tests it rather than resizing it. */
export const holdSystem = (values: Record<string, number>): Record<string, number> => {
  const { option } = upsConfiguration(values);
  if (!option) return values;
  const h = hold(option);
  return {
    ...values, held: 1,
    heldEnclosure: enclosures.findIndex(e => e.id === h.enclosureId),
    heldEnclosureCount: h.enclosureCount,
    heldPcs: pcsUnits.findIndex(p => p.id === h.pcsId),
    heldPcsCount: h.pcsCount,
  };
};

/** Let it size itself again for whatever is being asked of it now. */
export const resizeSystem = (values: Record<string, number>): Record<string, number> => ({ ...values, held: 0 });

export const lessonById = (id: string): LessonCard | undefined => lessons.find(l => l.template.id === id);

/** The act a card belongs to. */
export const actOf = (card: LessonCard): Act => acts.find(a => a.id === card.story.actId) ?? acts[0];

/**
 * The card after this one, and the one before.
 *
 * §15.1 ends the loop with "Reset, Next lesson, or take it back to the design", and there was no
 * next lesson: every card ended by sending the reader back to a grid of seven to guess which one
 * followed. A sequence nobody can follow is not a sequence.
 */
export const nextLesson = (id: string): LessonCard | null => {
  const i = lessons.findIndex(l => l.template.id === id);
  return i >= 0 && i + 1 < lessons.length ? lessons[i + 1] : null;
};

/** Where each control starts, in the engine's own units. */
export const defaultControls = (card: LessonCard): Record<string, number> =>
  Object.fromEntries(card.controls.map(c => [c.id, c.start]));
