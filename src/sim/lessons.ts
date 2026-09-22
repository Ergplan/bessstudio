import {
  sealWith, learningTemplateSchema, scenarioSchema, emsPolicySchema,
  type LearningTemplate, type Scenario, type EmsPolicy, type PlantConfiguration, type Profile,
} from './records';
import {
  backupPlant, backupReservePolicy, dayScenario, fixedSchedulePolicy, hotCondition, manualPolicy,
  normalCondition, peakShavingPolicy, priceSchedulePolicy, selfConsumptionPolicy, siteLoadProfile,
  solarProfile, teachingPlant, weakCellCondition,
} from './presets';

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

export type LessonCard = {
  template: LearningTemplate;
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

export const chargeDischarge: LessonCard = {
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
      kind: 'choice', id: 'direction', label: 'Direction', start: 1,
      options: [{ value: 1, label: 'Discharge' }, { value: -1, label: 'Charge' }],
      hint: 'Discharging sends energy to the grid; charging takes it from the grid.',
    },
    {
      kind: 'slider', id: 'power', label: 'Power', unit: 'kW', scale: 1 / 1000,
      min: 100, max: 2500, step: 100, start: 1_000_000,
      hint: 'What is asked of the plant. The converter and the battery decide how much of it is possible.',
    },
    socControl(0.8),
  ],
  runWith: values => ({
    scenario: withSoc(chargeDischargeScenario, values),
    policy: manualPolicy, plant: teachingPlant,
    manualRequestW: (values.direction ?? 1) >= 0 ? (values.power ?? 0) : -(values.power ?? 0),
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

/* ------------------------------------------------------- the catalogue ---- */

/** A card for a lesson that has not been built, so the catalogue is honest about what exists. */
const planned = (n: number, title: string, question: string, arrivesIn: string): LessonCard => ({
  arrivesIn,
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
  planned(7, 'UPS support by contract demand', 'How much protected power and energy does my site need?', 'S7'),
];

export const lessonById = (id: string): LessonCard | undefined => lessons.find(l => l.template.id === id);

/** Where each control starts, in the engine's own units. */
export const defaultControls = (card: LessonCard): Record<string, number> =>
  Object.fromEntries(card.controls.map(c => [c.id, c.start]));
