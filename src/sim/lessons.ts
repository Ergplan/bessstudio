import { sealWith, learningTemplateSchema, scenarioSchema, type LearningTemplate, type Scenario } from './records';
import { manualPolicy, teachingPlant } from './presets';

/**
 * The lesson catalogue.
 *
 * §15 defines seven cards, each stating one question, the outcome it teaches and a short estimated
 * duration. They are reached from a project or a quotation, never from the landing page, because
 * §3.0 puts the learner *after* the quote: somebody who has just been handed a design and wants to
 * understand it.
 *
 * A card that has not been built says so and cannot be opened. §17.1 requires unfinished features
 * to be absent or visibly unavailable, and a card that opens onto nothing is neither.
 */

export type LessonCard = {
  template: LearningTemplate;
  scenario: Scenario;
  /** The stage that brings it. Null once it is here. */
  arrivesIn: string | null;
  /** The controls the learner may move, at most three, with their bounds and units. */
  controls: LessonControl[];
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
  }
  | { kind: 'choice'; id: string; label: string; hint: string; options: { value: number; label: string }[] };

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
  scenario: chargeDischargeScenario,
  controls: [
    {
      kind: 'choice', id: 'direction', label: 'Direction',
      options: [{ value: 1, label: 'Discharge' }, { value: -1, label: 'Charge' }],
      hint: 'Discharging sends energy to the grid; charging takes it from the grid.',
    },
    {
      kind: 'slider', id: 'power', label: 'Power', unit: 'kW', scale: 1 / 1000,
      min: 100, max: 2500, step: 100,
      hint: 'What is asked of the plant. The converter and the battery decide how much of it is possible.',
    },
    {
      kind: 'slider', id: 'initialSoc', label: 'Starting charge level', unit: '%', scale: 100,
      min: 10, max: 100, step: 5,
      hint: 'Where the battery begins. A cell holds a different voltage at each level, which changes everything downstream.',
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
  scenario: chargeDischargeScenario,
  controls: [],
});

export const lessons: LessonCard[] = [
  chargeDischarge,
  planned(2, 'Reduce the evening peak', 'How does storage cut the demand a site draws from the grid?', 'S6'),
  planned(3, 'Use more solar', 'Why charge at noon and discharge later?', 'S6'),
  planned(4, 'Keep backup ready', 'Why stop selling energy while there is still charge left?', 'S6'),
  planned(5, 'Follow a price schedule', 'Why does the timing of charging matter?', 'S6'),
  planned(6, 'When the battery says slow down', 'Who wins when a request exceeds a limit?', 'S6'),
  planned(7, 'UPS support by contract demand', 'How much protected power and energy does my site need?', 'S7'),
];

export const lessonById = (id: string): LessonCard | undefined => lessons.find(l => l.template.id === id);

/** The scenario with the learner's controls applied, ready to run. Always from the same initial state. */
export function withControls(card: LessonCard, values: Record<string, number>): Scenario {
  const initialSoc = values.initialSoc ?? card.scenario.initialSoc;
  return sealWith(scenarioSchema, { ...card.scenario, initialSoc });
}

/** The request the learner's controls amount to, signed: positive is discharge. */
export const requestFrom = (values: Record<string, number>): number =>
  (values.direction ?? 1) >= 0 ? (values.power ?? 0) : -(values.power ?? 0);

/** Where each control starts. */
export const defaultControls = (card: LessonCard): Record<string, number> =>
  Object.fromEntries(card.controls.map(c => [c.id,
    c.id === 'initialSoc' ? card.scenario.initialSoc : c.id === 'direction' ? 1 : 1_000_000]));
