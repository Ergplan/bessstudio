import { describe, expect, it } from 'vitest';
import { accounting, defaultSolver, problemsWith, simulate } from '../sim/engine';
import { fixturePlant, fixturePolicy, fixtureScenario, flatCellParameters } from '../sim/fixtures';
import { lfpParameterSet, manualPolicy, teachingPlant } from '../sim/presets';
import { scenarioSchema, sealWith, type Scenario } from '../sim/records';
import { plantShape } from '../sim/limits';
import { emsPolicySchema } from '../sim/records';
import { ocv, socAtVoltage } from '../sim/battery';

/**
 * S3 — the engine, on the teaching plant rather than on a fixture.
 *
 * The fixtures prove the arithmetic; these prove the behaviour §12 describes: that a limit stops
 * the plant and says which one, that the books close on a real loss chain, that the same inputs
 * give the same answer, that the timestep may be refined without changing what the model says, and
 * that a failure is reported as a failure.
 */

const teaching = (over: Partial<Scenario> = {}): Scenario => sealWith(scenarioSchema, {
  id: 'sc-teaching', label: 'Teaching scenario', kind: 'Scenario',
  plantId: teachingPlant.id, policyId: manualPolicy.id,
  initialSoc: 0.5, initialCellTempC: 25, durationSeconds: 3600, stepSeconds: 60,
  siteLoad: null, generation: null, price: null, outage: null, controls: ['power'],
  ...over,
});

const run = (over: { scenario?: Scenario; manualRequestW: number; solver?: Partial<ReturnType<typeof defaultSolver>>; plant?: typeof teachingPlant; policy?: typeof manualPolicy }) =>
  simulate({
    scenario: over.scenario ?? teaching(), plant: over.plant ?? teachingPlant,
    policy: over.policy ?? manualPolicy, parameters: lfpParameterSet,
    solver: over.solver, manualRequestW: over.manualRequestW,
  });

describe('what the plant actually does when asked', () => {
  it('meets a modest request in full, and says nothing bound it', () => {
    const out = run({ manualRequestW: 500_000 });
    expect(out.run.status).toBe('complete');
    expect(out.series.achievedPowerW[0] / 1e3).toBeCloseTo(500, 1);
    expect(out.series.bindingConstraint[0]).toBe('Request met in full');
    expect(out.events).toBeTruthy();
  });

  it('holds a request above the converter rating to the rating, and names it', () => {
    const out = run({ manualRequestW: 4_000_000 });
    expect(out.series.achievedPowerW[0]).toBeLessThanOrEqual(teachingPlant.converter.ratedW * 1.001);
    expect(out.series.bindingConstraint[0]).toMatch(/Converter|BMS|current/i);
    expect(out.events.events.length, 'a limit that bound is an event').toBeGreaterThan(0);
    expect(out.events.events[0].owner === 'PCS' || out.events.events[0].owner === 'BMS').toBe(true);
    expect(out.events.events[0].message).toMatch(/the discharge is held below what was asked/);
  });

  it('never takes a cell past its own voltage limits, in either direction', () => {
    const down = run({ scenario: teaching({ initialSoc: 0.06, durationSeconds: 7200 }), manualRequestW: 2_500_000 });
    for (const [i, v] of down.series.cellVoltageV.entries()) {
      expect(v, `step ${i} cell voltage`).toBeGreaterThanOrEqual(lfpParameterSet.cell.minV - 1e-6);
    }
    const up = run({ scenario: teaching({ initialSoc: 0.97, durationSeconds: 7200 }), manualRequestW: -2_500_000 });
    for (const [i, v] of up.series.cellVoltageV.entries()) {
      expect(v, `step ${i} cell voltage`).toBeLessThanOrEqual(lfpParameterSet.cell.maxV + 1e-6);
    }
  });

  it('never exceeds the current the battery management system permits, or the converter accepts', () => {
    const shape = plantShape(teachingPlant);
    for (const request of [-4_000_000, -2_000_000, 2_000_000, 4_000_000]) {
      const out = run({ manualRequestW: request });
      for (const i of out.series.packCurrentA) {
        const perCell = Math.abs(i) / shape.parallelStrings;
        const permitted = i > 0 ? lfpParameterSet.cell.limits.dischargeCurrentMaxA : lfpParameterSet.cell.limits.chargeCurrentMaxA;
        expect(perCell, `${request} W request`).toBeLessThanOrEqual(permitted + 1e-6);
        expect(Math.abs(i), `${request} W request, converter DC limit`).toBeLessThanOrEqual(teachingPlant.converter.dcMaxA + 1e-6);
      }
    }
  });

  it('stops at empty and at full, without stepping past either', () => {
    const empty = run({ scenario: teaching({ initialSoc: 0.02, durationSeconds: 7200, stepSeconds: 300 }), manualRequestW: 2_500_000 });
    expect(Math.min(...empty.series.soc), 'charge never goes negative').toBeGreaterThanOrEqual(0);
    const full = run({ scenario: teaching({ initialSoc: 0.98, durationSeconds: 7200, stepSeconds: 300 }), manualRequestW: -2_500_000 });
    expect(Math.max(...full.series.soc), 'charge never goes above full').toBeLessThanOrEqual(1);
  });

  it('will not discharge below the reserve the policy holds, and says why', () => {
    const scenario = teaching({ initialSoc: 0.12, durationSeconds: 7200, stepSeconds: 60 });
    const out = run({ scenario, manualRequestW: 1_000_000 });
    const floor = manualPolicy.reserveSoc;
    expect(Math.min(...out.series.soc), `the reserve is ${floor}`).toBeGreaterThanOrEqual(floor - 0.02);
    const held = out.decisions.decisions.find(d => d.explanation.startsWith('Holding'));
    expect(held, 'the decision log says it is holding').toBeTruthy();
    expect(held!.explanation).toMatch(/reserve of 10%/);
    expect(held!.observed.floorSoc).toBe(floor);
  });

  it('shows the current rising as the voltage falls under a constant power request', () => {
    // §12.2 names this as one of the three things the discharge lesson has to make a user see.
    const out = run({ scenario: teaching({ initialSoc: 0.9, durationSeconds: 10_800, stepSeconds: 60 }), manualRequestW: 1_200_000 });
    // The last sample is the closing one, which carries no power; the last dispatching sample is
    // the one before it.
    const n = out.series.packCurrentA.length - 2;
    const first = out.series.packCurrentA[0], last = out.series.packCurrentA[n];
    const vFirst = out.series.packVoltageV[0], vLast = out.series.packVoltageV[n];
    expect(vLast, 'voltage fell').toBeLessThan(vFirst);
    expect(last, 'current rose to hold the power').toBeGreaterThan(first);
    expect(out.series.achievedPowerW[0]).toBeCloseTo(out.series.achievedPowerW[10], -3);
  });
});

describe('the books, on a real loss chain', () => {
  const out = run({ scenario: teaching({ durationSeconds: 3600, stepSeconds: 60 }), manualRequestW: 1_500_000 });
  const a = accounting(out.series);

  it('counts the converter loss exactly once, between the terminals it sits between', () => {
    expect(a.dischargedDcWh - a.converterLossWh).toBeCloseTo(a.deliveredAcWh, 3);
  });

  it('counts the auxiliaries exactly once, between the converter and the connection', () => {
    expect(a.deliveredAcWh - a.auxiliaryWh).toBeCloseTo(a.exportedWh, 3);
  });

  it('loses something to the battery itself, and it is a loss rather than a gain', () => {
    expect(a.batteryLossWh).toBeGreaterThan(0);
    expect(a.batteryLossWh).toBeLessThan(a.dischargedDcWh * 0.05);
  });

  it('delivers less than it took from the store, in every direction', () => {
    expect(a.deliveredAcWh).toBeLessThan(a.dischargedDcWh);
    const charging = run({ scenario: teaching({ initialSoc: 0.3, durationSeconds: 3600 }), manualRequestW: -1_500_000 });
    const c = accounting(charging.series);
    expect(c.chargedDcWh, 'less reaches the battery than was drawn').toBeLessThan(c.drawnAcWh);
  });
});

describe('reproducibility and the timestep', () => {
  it('gives exactly the same answer twice', () => {
    const a = run({ manualRequestW: 1_000_000 });
    const b = run({ manualRequestW: 1_000_000 });
    expect(b.series).toEqual(a.series);
    expect(b.run.configHash).toBe(a.run.configHash);
    expect(b.decisions).toEqual(a.decisions);
  });

  it('gives a different run for a different request, and the same one for the same request', () => {
    const a = run({ manualRequestW: 1_000_000 });
    const b = run({ manualRequestW: 1_100_000 });
    expect(b.series.achievedPowerW[0]).not.toBe(a.series.achievedPowerW[0]);
    // The configuration hash covers the scenario, not the learner's dial, which is why the run
    // records four separate hashes and the cache checks all of them.
    expect(b.run.scenarioHash).toBe(a.run.scenarioHash);
  });

  /**
   * Timestep convergence. The state is advanced explicitly, so halving the step must move the
   * answer by less each time rather than by the same amount — and past a point not at all.
   *
   * Tolerance: the ending state of charge at 15-second steps and at 60-second steps must agree to
   * within a tenth of a percentage point of charge. That is far below anything the interface
   * shows and far below the precision of any parameter feeding it.
   */
  it('converges as the timestep is refined', () => {
    const ends = [600, 300, 120, 60, 30, 15].map(stepSeconds => {
      const out = run({ scenario: teaching({ initialSoc: 0.8, durationSeconds: 7200, stepSeconds }), manualRequestW: 2_000_000 });
      return { stepSeconds, soc: out.series.soc[out.series.soc.length - 1], kWh: accounting(out.series).deliveredAcWh / 1000 };
    });
    const finest = ends[ends.length - 1];
    for (const e of ends) {
      expect(Math.abs(e.soc - finest.soc), `${e.stepSeconds} s against ${finest.stepSeconds} s`).toBeLessThan(0.001);
    }
    // And each refinement is at least as close as the one before it.
    const errors = ends.map(e => Math.abs(e.soc - finest.soc));
    for (let i = 1; i < errors.length; i++) expect(errors[i]).toBeLessThanOrEqual(errors[i - 1] + 1e-12);
  });

  it('does not move when the sub-step count is raised, because the step is already resolved', () => {
    const coarse = run({ manualRequestW: 2_000_000, solver: { subSteps: 4 } });
    const fine = run({ manualRequestW: 2_000_000, solver: { subSteps: 40 } });
    const end = (o: typeof coarse) => o.series.soc[o.series.soc.length - 1];
    expect(Math.abs(end(fine) - end(coarse))).toBeLessThan(0.001);
  });
});

describe('when it cannot do what was asked', () => {
  it('reports a failure as a failure, never as an empty success', () => {
    // A request beyond the maximum-power point of the battery at this state has no solution.
    const weak = { ...lfpParameterSet, cell: { ...lfpParameterSet.cell, resistanceOhm: 0.5 } };
    const out = simulate({
      scenario: teaching(), plant: teachingPlant, policy: manualPolicy,
      parameters: weak as never, manualRequestW: 2_500_000,
    });
    if (out.run.status === 'failed') {
      expect(out.run.failure).toBeTruthy();
      expect(out.run.finishedAt).toBeNull();
    } else {
      // If it did not fail it must have limited itself honestly instead, and said so.
      expect(out.series.bindingConstraint[0]).not.toBe('Request met in full');
    }
  });

  it('says a policy that is not built yet is not built, rather than dispatching nothing quietly', () => {
    const later = sealWith(emsPolicySchema, { ...manualPolicy, policy: 'peak-shaving', peakTargetW: 500_000 });
    const out = run({ policy: later, manualRequestW: 1_000_000 });
    expect(out.series.achievedPowerW.every(p => p === 0)).toBe(true);
    expect(out.decisions.decisions[0].explanation).toMatch(/not built yet.*lesson 2/is);
  });

  it('refuses an invalid configuration before it computes anything, and says what is wrong', () => {
    // `seal` stamps a record; it does not validate one. The engine checks its inputs itself, so
    // an invalid configuration arriving from storage or from an older version is refused rather
    // than run.
    const tooCoarse = { ...teaching(), stepSeconds: 100_000 } as Scenario;
    const out = simulate({ scenario: tooCoarse, plant: teachingPlant, policy: manualPolicy, parameters: lfpParameterSet, manualRequestW: 0 });
    expect(out.run.status).toBe('failed');
    expect(out.run.failure).toMatch(/timestep cannot be longer than the scenario/);
    expect(out.series.timeSeconds, 'nothing was computed').toHaveLength(0);

    const impossible = { ...teaching(), initialSoc: 1.5 } as Scenario;
    expect(problemsWith({ scenario: impossible, plant: teachingPlant, policy: manualPolicy, parameters: lfpParameterSet }).join(' '))
      .toMatch(/initialSoc/);
  });

  it('refuses a scenario, plant and parameter set that do not refer to each other', () => {
    const problems = problemsWith({
      scenario: teaching(), plant: fixturePlant(), policy: manualPolicy, parameters: lfpParameterSet,
    });
    expect(problems.join(' ')).toMatch(/names plant plant-5mwh-teaching but was handed fixture-plant/);
  });
});

describe('the model against its own parameters', () => {
  it('reads the open-circuit curve back the way it wrote it', () => {
    for (const point of lfpParameterSet.cell.ocvCurve) {
      expect(ocv(lfpParameterSet.cell, point.soc), `soc ${point.soc}`).toBeCloseTo(point.volts, 9);
      expect(socAtVoltage(lfpParameterSet.cell, point.volts), `${point.volts} V`).toBeCloseTo(point.soc, 6);
    }
  });

  it('is flat where an LFP cell is flat, which is why voltage is a poor state-of-charge gauge', () => {
    const spread = ocv(lfpParameterSet.cell, 0.8) - ocv(lfpParameterSet.cell, 0.2);
    expect(spread, 'less than 100 mV across three fifths of the range').toBeLessThan(0.1);
    expect(spread).toBeGreaterThan(0);
  });

  it('builds the string the catalogue describes', () => {
    const shape = plantShape(teachingPlant);
    expect(shape.seriesCells).toBe(416);
    expect(shape.parallelStrings).toBe(12);
    expect(shape.totalCells).toBe(4992);
    const nominalPackV = ocv(lfpParameterSet.cell, 0.5) * shape.seriesCells;
    expect(nominalPackV, 'inside the converter window').toBeGreaterThan(teachingPlant.converter.dcMinV);
    expect(nominalPackV).toBeLessThan(teachingPlant.converter.dcMaxV);
  });
});
