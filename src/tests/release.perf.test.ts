import { describe, expect, it } from 'vitest';
import { simulate } from '../sim/engine';
import { comparePolicies } from '../sim/compare';
import { defaultControls, lessons } from '../sim/lessons';
import { dayScenario, fixedSchedulePolicy, lfpParameterSet, peakShavingPolicy, teachingPlant } from '../sim/presets';
import { sizeSystem, defaultSizingInput } from '../sizing/engine';
import { evaluateFinance } from '../sizing/finance';
import { defaultPriceBook } from '../catalog/pricing';
import { compareInIndia, indiaPresets } from '../sim/india';

/**
 * Performance, against budgets declared before the measurement.
 *
 * §17.2 asks S12 for performance against **predeclared** budgets, and the word is doing work: a
 * budget written after the measurement is a description of the current behaviour rather than a
 * decision about what is acceptable. So the numbers below come first, with the reasoning for each,
 * and the test is whether the code fits inside them.
 *
 * They are wall-clock budgets on one core of whatever runs the suite, which is a weaker machine
 * than most of the browsers this will run in. Generous multiples are deliberate: this is a guard
 * against something becoming a hundred times slower, not a benchmark.
 */

/** A lesson has to feel like it answered immediately when a control moves. §15.1. */
const LESSON_RUN_MS = 400;
/** A whole day at five-minute steps, which is what the supervisory lessons run. */
const DAY_RUN_MS = 800;
/** Two policies over the same day, which is two of the above plus the accounting. */
const COMPARISON_MS = 2000;
/** A sizing and its financial model, which the studio recomputes on every slider move. */
const SIZING_MS = 150;
/** The whole India comparison: two chemistries, a lifecycle ledger and a day of outages. */
const INDIA_MS = 2500;

const took = (work: () => void) => {
  const started = performance.now();
  work();
  return performance.now() - started;
};

describe('the budgets declared above', () => {
  it(`runs every lesson's default inside ${LESSON_RUN_MS} ms`, () => {
    for (const card of lessons.filter(l => !l.arrivesIn)) {
      const setup = card.runWith(defaultControls(card));
      const ms = took(() => simulate({ ...setup, parameters: lfpParameterSet }));
      expect(ms, `${card.template.label} took ${ms.toFixed(0)} ms`).toBeLessThan(
        setup.scenario.durationSeconds > 4 * 3600 ? DAY_RUN_MS : LESSON_RUN_MS,
      );
    }
  });

  it(`compares two policies over a day inside ${COMPARISON_MS} ms`, () => {
    const ms = took(() => comparePolicies(
      { scenario: dayScenario, plant: teachingPlant, parameters: lfpParameterSet, manualRequestW: 0 },
      fixedSchedulePolicy, peakShavingPolicy,
    ));
    expect(ms, `took ${ms.toFixed(0)} ms`).toBeLessThan(COMPARISON_MS);
  });

  it(`sizes and prices a plant inside ${SIZING_MS} ms`, () => {
    const ms = took(() => {
      const sizing = sizeSystem(defaultSizingInput());
      evaluateFinance(sizing, defaultPriceBook);
    });
    expect(ms, `took ${ms.toFixed(0)} ms`).toBeLessThan(SIZING_MS);
  });

  it(`compares both chemistries over a lifecycle inside ${INDIA_MS} ms`, () => {
    for (const preset of indiaPresets) {
      const ms = took(() => compareInIndia({ protectedKW: 225, autonomyMinutes: 15, preset }));
      expect(ms, `${preset.label} took ${ms.toFixed(0)} ms`).toBeLessThan(INDIA_MS);
    }
  });

  /**
   * The quota that actually exists.
   *
   * There is no server to place a quota on — the engine runs in the browser, per the departure
   * recorded in the S2 packet — so the protection against a careless scenario is a cap on how many
   * pieces one run may be advanced in. This checks the cap is real rather than aspirational.
   */
  it('refuses to advance a run in more pieces than the cap allows', () => {
    const wild = simulate({
      scenario: dayScenario, plant: teachingPlant, policy: peakShavingPolicy, parameters: lfpParameterSet,
      manualRequestW: 0, solver: { maxSubStepSeconds: 0.001 },
    });
    // Either it refuses, or it completes by coarsening its own sub-steps. What it may not do is
    // attempt three hundred million pieces and hang the tab it is running in.
    const ms = took(() => simulate({
      scenario: dayScenario, plant: teachingPlant, policy: peakShavingPolicy, parameters: lfpParameterSet,
      manualRequestW: 0, solver: { maxSubStepSeconds: 0.001 },
    }));
    expect(ms, `took ${ms.toFixed(0)} ms`).toBeLessThan(DAY_RUN_MS * 4);
    expect(wild.run.status === 'complete' || wild.run.failure !== null).toBe(true);
  });
});

describe('the cap is real, not a comment', () => {
  it('refuses a run that would advance in more pieces than the cap allows', () => {
    const out = simulate({
      scenario: dayScenario, plant: teachingPlant, policy: peakShavingPolicy, parameters: lfpParameterSet,
      manualRequestW: 0, solver: { maxSubStepSeconds: 0.001 },
    });
    expect(out.run.status).toBe('failed');
    expect(out.run.failure).toMatch(/past the 2,000,000 a single run may take/);
    expect(out.run.failure, 'and says what to do about it').toMatch(/lengthen the integration interval/i);
    expect(out.run.finishedAt).toBeNull();
  });

  it('allows everything the interface can actually ask for', () => {
    // The finest the controls reach: a whole day at five-minute samples, integrated every second.
    const out = simulate({
      scenario: dayScenario, plant: teachingPlant, policy: peakShavingPolicy, parameters: lfpParameterSet,
      manualRequestW: 0, solver: { maxSubStepSeconds: 1 },
    });
    expect(out.run.status, out.run.failure ?? '').toBe('complete');
  });
});
