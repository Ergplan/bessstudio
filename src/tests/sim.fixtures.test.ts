import { describe, expect, it } from 'vitest';
import { accounting, defaultSolver, roundTrip, simulate } from '../sim/engine';
import { fixturePlant, fixturePolicy, fixtureScenario, flatCellParameters } from '../sim/fixtures';

/**
 * The acceptance fixtures from §18.
 *
 * Each expected value below is derived from the equations and written into the test before the
 * engine is asked anything, as §17.1 requires — never by running the function and recording what
 * it said. Tolerances are stated per fixture rather than as one blanket figure, and each says why
 * it is what it is.
 *
 * F01 and F02 belong to S3. The rest arrive with the stages that own them.
 */

const run = (over: Parameters<typeof simulate>[0]) => simulate(over);

describe('F01 — ideal energy and state of charge', () => {
  /**
   * A hundred kilowatt-hours at a constant 3.2 volts, half full, with every loss switched off.
   * Twenty kilowatts for thirty minutes is ten kilowatt-hours, which is a tenth of the store, so
   * it must end at forty percent.
   *
   * Tolerance: exact arithmetic on both sides, so 1e-9 of the quantity. There is nothing
   * approximate in this fixture — no solver, no iteration, no interpolation — and a discrepancy
   * anywhere above floating-point dust would be a defect, not a numerical artefact.
   *
   * §18 notes what this is not: it is a sanity fixture, not a claim that electrochemical state of
   * charge always equals the fraction of energy remaining.
   */
  const solver = { ...defaultSolver(), idealised: true };

  it('delivers 10 kWh in half an hour at 20 kW, and ends at 40%', () => {
    const out = run({
      scenario: fixtureScenario({ initialSoc: 0.5, durationSeconds: 1800, stepSeconds: 60 }),
      plant: fixturePlant(), policy: fixturePolicy, parameters: flatCellParameters,
      solver, manualRequestW: 20_000,
    });
    expect(out.run.status).toBe('complete');
    const a = accounting(out.series);
    expect(a.deliveredAcWh / 1000, 'kWh delivered at the AC terminals').toBeCloseTo(10, 9);
    expect(a.dischargedDcWh / 1000, 'kWh at the battery terminals — the same, with no losses').toBeCloseTo(10, 9);
    expect(out.series.soc[out.series.soc.length - 1], 'ending state of charge').toBeCloseTo(0.4, 9);
    expect(a.converterLossWh, 'no converter loss').toBeCloseTo(0, 9);
    expect(a.auxiliaryWh, 'no auxiliaries').toBeCloseTo(0, 9);
  });

  it('absorbs 10 kWh in half an hour at 20 kW, and ends where it started', () => {
    // The sign-reversed case §18 asks for explicitly.
    const out = run({
      scenario: fixtureScenario({ initialSoc: 0.4, durationSeconds: 1800, stepSeconds: 60 }),
      plant: fixturePlant(), policy: fixturePolicy, parameters: flatCellParameters,
      solver, manualRequestW: -20_000,
    });
    const a = accounting(out.series);
    expect(a.drawnAcWh / 1000, 'kWh drawn at the AC terminals').toBeCloseTo(10, 9);
    expect(a.chargedDcWh / 1000, 'kWh into the battery').toBeCloseTo(10, 9);
    expect(out.series.soc[out.series.soc.length - 1]).toBeCloseTo(0.5, 9);
    expect(a.deliveredAcWh, 'nothing was delivered').toBeCloseTo(0, 9);
  });

  it('gives the same answer at every timestep, because nothing here depends on one', () => {
    const ends = [10, 30, 60, 300, 900].map(stepSeconds => {
      const out = run({
        scenario: fixtureScenario({ initialSoc: 0.5, durationSeconds: 1800, stepSeconds }),
        plant: fixturePlant(), policy: fixturePolicy, parameters: flatCellParameters,
        solver, manualRequestW: 20_000,
      });
      return { stepSeconds, soc: out.series.soc[out.series.soc.length - 1], kWh: accounting(out.series).deliveredAcWh / 1000 };
    });
    for (const e of ends) {
      expect(e.soc, `${e.stepSeconds} s steps`).toBeCloseTo(0.4, 9);
      expect(e.kWh, `${e.stepSeconds} s steps`).toBeCloseTo(10, 9);
    }
  });

  it('is signed the way the convention says, in both directions', () => {
    const out = run({
      scenario: fixtureScenario(), plant: fixturePlant(), policy: fixturePolicy,
      parameters: flatCellParameters, solver, manualRequestW: 20_000,
    });
    expect(out.series.achievedPowerW.every(p => p > 0), 'discharge is positive').toBe(true);
    expect(out.series.packCurrentA.every(i => i > 0), 'discharge current is positive').toBe(true);
    expect(out.series.soc.every((s, i) => i === 0 || s <= out.series.soc[i - 1] + 1e-12), 'charge only falls').toBe(true);
    expect(out.run.signConvention).toContain('discharging');

    const charging = run({
      scenario: fixtureScenario({ initialSoc: 0.4 }), plant: fixturePlant(), policy: fixturePolicy,
      parameters: flatCellParameters, solver, manualRequestW: -20_000,
    });
    expect(charging.series.achievedPowerW.every(p => p < 0), 'charge is negative').toBe(true);
    expect(charging.series.packCurrentA.every(i => i < 0), 'charge current is negative').toBe(true);
  });
});

describe('F02 — converter balance', () => {
  /**
   * A hundred kilowatts at the battery terminals through a converter that is ninety-five percent
   * efficient on discharge delivers ninety-five kilowatts of alternating current. The charging
   * case uses the **charging** efficiency, in the other direction: a hundred kilowatts drawn at
   * the terminals puts ninety into the battery at ninety percent.
   *
   * Tolerance: 1e-6 relative. The converter model is a single multiplication, but the battery
   * underneath it carries a nominal one-nanoohm resistance so the schema accepts it, which moves
   * the terminal voltage by about a part in ten million.
   */
  const plant = () => fixturePlant({ dischargeEfficiency: 0.95, chargeEfficiency: 0.90 });

  it('delivers 95 kW of AC from 100 kW of DC', () => {
    const out = run({
      scenario: fixtureScenario({ durationSeconds: 600, stepSeconds: 60 }),
      plant: plant(), policy: fixturePolicy, parameters: flatCellParameters,
      // Asking for 95 kW at the AC terminals is asking the battery for 100 kW.
      manualRequestW: 95_000,
    });
    expect(out.series.dcPowerW[0] / 1000, 'kW at the battery terminals').toBeCloseTo(100, 6);
    expect(out.series.achievedPowerW[0] / 1000, 'kW delivered as AC').toBeCloseTo(95, 6);
    const a = accounting(out.series);
    expect(a.converterLossWh / a.dischargedDcWh, 'the loss is exactly the 5% the converter states').toBeCloseTo(0.05, 6);
  });

  it('uses the charging efficiency on charge, not the discharge formula reversed', () => {
    const out = run({
      scenario: fixtureScenario({ initialSoc: 0.3, durationSeconds: 600, stepSeconds: 60 }),
      plant: plant(), policy: fixturePolicy, parameters: flatCellParameters,
      manualRequestW: -100_000,
    });
    // 100 kW drawn at 90% puts 90 kW into the battery. Reusing the discharge formula would have
    // given 100/0.95 = 105.3 kW, which is more energy than was bought.
    expect(out.series.achievedPowerW[0] / 1000, 'kW drawn as AC').toBeCloseTo(-100, 6);
    expect(out.series.dcPowerW[0] / 1000, 'kW into the battery').toBeCloseTo(-90, 6);
    expect(Math.abs(out.series.dcPowerW[0]), 'less arrives than was drawn').toBeLessThan(Math.abs(out.series.achievedPowerW[0]));
  });

  it('closes the energy books at every boundary it names', () => {
    const out = run({
      scenario: fixtureScenario({ durationSeconds: 600, stepSeconds: 60 }),
      plant: plant(), policy: fixturePolicy, parameters: flatCellParameters, manualRequestW: 95_000,
    });
    const a = accounting(out.series);
    // Battery terminals → converter loss → AC terminals. Counted once, and it adds up.
    expect(a.dischargedDcWh - a.converterLossWh).toBeCloseTo(a.deliveredAcWh, 6);
    // AC terminals → auxiliaries → connection point. This fixture has no auxiliaries.
    expect(a.deliveredAcWh - a.auxiliaryWh).toBeCloseTo(a.exportedWh, 6);
  });

  it('reports a round trip only from a cycle that ended where it started', () => {
    const partial = run({
      scenario: fixtureScenario({ durationSeconds: 600, stepSeconds: 60 }),
      plant: plant(), policy: fixturePolicy, parameters: flatCellParameters, manualRequestW: 95_000,
    });
    const rt = roundTrip(partial.series);
    expect(rt.value, 'a partial discharge has no round-trip efficiency to report').toBeNull();
    expect(rt.why).toMatch(/would not mean anything/);
  });
});
