import { describe, expect, it } from 'vitest';
import { simulate } from '../sim/engine';
import { decide, hourOfDay, localIslandControl, policyGoals, type EmsObservation } from '../sim/ems';
import { comparePolicies, dayHash, outcomeOf } from '../sim/compare';
import {
  backupPlant, backupReservePolicy, dayScenario, fixedSchedulePolicy, lfpParameterSet, manualPolicy,
  outageScenario, peakShavingPolicy, priceSchedulePolicy, selfConsumptionPolicy, siteLoadProfile,
  solarProfile, supervisoryPolicies, teachingPlant, telemetryLossScenario,
} from '../sim/presets';
import { emsPolicySchema, scenarioSchema, sealWith, type EmsPolicy, type Scenario } from '../sim/records';

/**
 * S5 — jouleWise ergOS EMS.
 *
 * §11 puts three things beyond argument, and each of them is a test here rather than a sentence in
 * a document: every explanation resolves to values that were recorded, the battery management
 * system stays authoritative over whatever the policy asked for, and no-break control does not
 * depend on the supervisory layer or on anything across a network.
 */

const observe = (over: Partial<EmsObservation> = {}): EmsObservation => ({
  atSeconds: 0, soc: 0.5, siteLoadW: null, generationW: null, pricePerMWh: null, islanded: false,
  manualRequestW: 0, plantRatedW: 2_500_000, telemetryAgeSeconds: 0, lastSetpointW: 0, ...over,
});

/** A scenario points at the plant and the policy it was written for, so a test that swaps one repoints it. */
const run = (over: { scenario?: Scenario; policy?: EmsPolicy; plant?: typeof teachingPlant; manualRequestW?: number }) => {
  const plant = over.plant ?? teachingPlant, policy = over.policy ?? peakShavingPolicy;
  const scenario = sealWith(scenarioSchema, { ...(over.scenario ?? dayScenario), plantId: plant.id, policyId: policy.id });
  return simulate({ scenario, plant, policy, parameters: lfpParameterSet, manualRequestW: over.manualRequestW ?? 0 });
};

describe('every explanation resolves to values that were recorded', () => {
  it('states a goal, an action, a rule and a reason for every decision, on every policy', () => {
    for (const policy of [manualPolicy, ...supervisoryPolicies]) {
      const out = run({ policy, scenario: dayScenario, manualRequestW: 500_000 });
      expect(out.run.status, policy.label).toBe('complete');
      for (const d of out.decisions.decisions) {
        expect(d.goal, `${policy.label} goal`).toBe(policyGoals[policy.policy]);
        expect(d.rule, `${policy.label} rule`).toMatch(/^[a-z-]+\/[a-z-]+/);
        expect(d.explanation.length, `${policy.label} reason`).toBeGreaterThan(20);
        expect(d.policyVersion).toBe(policy.policyVersion);
        expect(['charge', 'discharge', 'hold', 'reduce']).toContain(d.action);
      }
    }
  });

  it('puts every number the reason quotes into the observed values beside it', () => {
    const out = run({ policy: peakShavingPolicy });
    const shaving = out.decisions.decisions.find(d => d.rule === 'peak-shaving/above-target')!;
    expect(shaving).toBeTruthy();
    expect(shaving.observed.siteLoadW).toBeGreaterThan(0);
    expect(shaving.observed.soc).toBeGreaterThan(0);
    // The sentence quotes the site load in kilowatts; the recorded value is the same figure.
    expect(shaving.explanation).toContain(`${Math.abs(shaving.observed.siteLoadW / 1e3).toFixed(0)} kW`);
    expect(shaving.observed.floorSoc).toBe(peakShavingPolicy.reserveSoc);
  });

  it('never quotes a figure nobody measured', () => {
    // No site load reported: the policy holds and names the absence rather than shaving against
    // an assumed zero, which would have it discharging at the target all day.
    const noLoad = sealWith(scenarioSchema, { ...dayScenario, siteLoad: null });
    const out = run({ scenario: noLoad, policy: peakShavingPolicy });
    expect(out.decisions.decisions.every(d => d.rule === 'peak-shaving/no-load-telemetry')).toBe(true);
    expect(out.series.achievedPowerW.every(p => p === 0)).toBe(true);
  });
});

describe('the reserve, and what an outage is allowed to spend', () => {
  /**
   * F04 — backup reserve.
   *
   * Expected, stated before the run: a discharge request at the reserve boundary consumes none of
   * the protected energy under the normal policy; a declared outage may take the same plant to the
   * emergency floor and no further; and the transition between the two is logged and explained.
   * Tolerance: the charge may not fall below the floor by more than 1e-9 of full charge, which is
   * arithmetic noise rather than a modelling allowance.
   */
  const atReserve = (over: Partial<Scenario> = {}) => sealWith(scenarioSchema, {
    ...dayScenario, initialSoc: backupReservePolicy.reserveSoc, ...over,
  });

  it('F04 — will not spend protected energy under the normal policy', () => {
    const out = run({ scenario: atReserve(), policy: backupReservePolicy, manualRequestW: 2_000_000 });
    expect(out.run.status).toBe('complete');
    for (const [i, soc] of out.series.soc.entries()) {
      expect(soc, `sample ${i}`).toBeGreaterThanOrEqual(backupReservePolicy.reserveSoc - 1e-9);
    }
    expect(out.series.achievedPowerW.some(p => p > 1), 'nothing was discharged').toBe(false);
    expect(out.decisions.decisions[0].explanation).toMatch(/reserve/i);
  });

  it('F04 — an outage may take it to the emergency floor, and no further', () => {
    const out = run({ scenario: sealWith(scenarioSchema, { ...outageScenario, initialSoc: 0.55 }), plant: backupPlant, policy: backupReservePolicy });
    expect(out.run.status).toBe('complete');
    const floor = backupReservePolicy.emergencyReserveSoc;
    for (const [i, soc] of out.series.soc.entries()) {
      expect(soc, `sample ${i}`).toBeGreaterThanOrEqual(floor - 1e-9);
    }
    // And it did go below the normal reserve: that is what the protected energy was being kept for.
    const lowest = Math.min(...out.series.soc);
    expect(lowest).toBeLessThan(backupReservePolicy.reserveSoc);
  });

  it('F04 — the transition is announced, both ways', () => {
    const out = run({ scenario: outageScenario, plant: backupPlant, policy: backupReservePolicy });
    const lost = out.events.events.find(e => e.code === 'grid-lost');
    const back = out.events.events.find(e => e.code === 'grid-restored');
    expect(lost, 'the grid going is an event').toBeTruthy();
    expect(lost!.owner).toBe('grid');
    expect(lost!.message).toMatch(/emergency floor/i);
    expect(lost!.atSeconds).toBe(outageScenario.outage!.fromSeconds);
    expect(back, 'and so is it coming back').toBeTruthy();
    expect(back!.message).toMatch(/protected again/i);
  });

  it('will not island a plant that has nothing to island with', () => {
    const out = run({ scenario: outageScenario, plant: teachingPlant, policy: backupReservePolicy });
    const lost = out.events.events.find(e => e.code === 'grid-lost')!;
    expect(lost.message).toMatch(/not island capable/i);
    expect(out.series.unservedLoadW.some(w => w > 0), 'the site goes dark, and the run says so').toBe(true);
  });
});

describe('no-break control does not depend on this layer', () => {
  it('serves the load during an outage with the supervisory telemetry gone', () => {
    // Everything the policy decides on is taken away at noon, and the grid goes at six. An hour of
    // island is inside what half a battery can carry, so nothing but the telemetry is in question.
    const blind = sealWith(scenarioSchema, {
      ...outageScenario,
      outage: { fromSeconds: 18 * 3600, toSeconds: 19 * 3600 },
      injected: { weakCell: null, coolingFailsAtSeconds: null, communicationLostAtSeconds: null, telemetryLostAtSeconds: 12 * 3600 },
    });
    const out = run({ scenario: blind, plant: backupPlant, policy: backupReservePolicy });
    const during = out.series.timeSeconds
      .map((t, i) => ({ t, i }))
      .filter(({ t }) => t >= 18 * 3600 && t < 19 * 3600);
    expect(during.length).toBeGreaterThan(10);
    for (const { i } of during) {
      expect(out.series.achievedPowerW[i], `sample ${i} during the outage`).toBeGreaterThan(0);
      expect(out.series.unservedLoadW[i], `sample ${i} unserved`).toBeLessThan(1);
      expect(out.decisions.decisions[i].localControl).toBe(true);
      expect(out.decisions.decisions[i].rule).toBe('local/island');
    }
    // And the telemetry really was gone the whole time: the policy would have been on its fallback.
    expect(out.decisions.decisions[during[0].i].telemetryAgeSeconds).toBeGreaterThan(5 * 3600);
  });

  it('says the site went dark rather than pretending an empty battery carried it', () => {
    // Three hours of island on half a battery is more than it has. What matters is that the run
    // says so: the charge stops at the emergency floor and the rest of the load is unserved.
    const out = run({ scenario: outageScenario, plant: backupPlant, policy: backupReservePolicy });
    const tail = out.series.timeSeconds
      .map((t, i) => ({ t, i }))
      .filter(({ t }) => t >= 20 * 3600 && t < 21 * 3600);
    expect(tail.some(({ i }) => out.series.unservedLoadW[i] > 0), 'the shortfall is reported').toBe(true);
    for (const { i } of tail) {
      expect(out.series.soc[i]).toBeGreaterThanOrEqual(backupReservePolicy.emergencyReserveSoc - 1e-9);
    }
  });

  it('is not the policy deciding, and says so in as many words', () => {
    const local = localIslandControl({ siteLoadW: 900_000, generationW: 0, auxiliaryW: 22_000, plantRatedW: 2_500_000 });
    expect(local.requestedW, 'the site load and the plant’s own auxiliaries').toBe(922_000);
    expect(local.explanation).toMatch(/no supervisory decision and no network round trip/i);
    expect(local.rule).toBe('local/island');
  });

  it('holds the island to the plant’s rating rather than promising what it cannot do', () => {
    expect(localIslandControl({ siteLoadW: 9_000_000, generationW: 0, auxiliaryW: 22_000, plantRatedW: 2_500_000 }).requestedW).toBe(2_500_000);
  });
});

describe('the battery management system stays authoritative', () => {
  it('overrules every policy, not only the manual one', () => {
    for (const policy of supervisoryPolicies) {
      const hot = sealWith(scenarioSchema, { ...dayScenario, ambientC: 60, initialCellTempC: 60 });
      const out = run({ scenario: hot, policy });
      expect(out.run.status, policy.label).toBe('complete');
      const cell = lfpParameterSet.cell;
      for (const [i, v] of out.series.cellVoltageV.entries()) {
        expect(v, `${policy.label} sample ${i}`).toBeGreaterThanOrEqual(cell.minV - 1e-6);
        expect(v, `${policy.label} sample ${i}`).toBeLessThanOrEqual(cell.maxV + 1e-6);
      }
      for (const [i, soc] of out.series.soc.entries()) {
        expect(soc, `${policy.label} sample ${i}`).toBeGreaterThanOrEqual(0);
        expect(soc, `${policy.label} sample ${i}`).toBeLessThanOrEqual(1);
      }
    }
  });

  it('reduces an infeasible request before issuing it, rather than asking for the impossible', () => {
    const d = decide(manualPolicy, observe({ manualRequestW: 9_000_000 }));
    expect(d.requestedW).toBe(2_500_000);
    expect(d.action).toBe('reduce');
    expect(d.reducedFromW).toBe(9_000_000);
    expect(d.explanation).toMatch(/9,?000 kW was asked for/);
  });
});

describe('telemetry that stops arriving', () => {
  it('follows the configured fallback, and records that it did', () => {
    const out = run({ scenario: telemetryLossScenario, policy: peakShavingPolicy });
    const after = out.decisions.decisions.filter(d => d.atSeconds > 12 * 3600 + peakShavingPolicy.telemetryTimeoutSeconds);
    expect(after.length).toBeGreaterThan(10);
    for (const d of after) {
      expect(d.usedFallback).toBe(true);
      expect(d.rule).toBe('fallback/stop');
      expect(d.requestedPowerW).toBe(0);
      expect(d.telemetryAgeSeconds).toBeGreaterThan(peakShavingPolicy.telemetryTimeoutSeconds);
    }
  });

  it('holds the last setpoint where that is what the configuration says', () => {
    const holding = sealWith(emsPolicySchema, { ...peakShavingPolicy, id: 'policy-hold-last', staleFallback: 'hold-last-setpoint' });
    const d = decide(holding, observe({ telemetryAgeSeconds: 1000, lastSetpointW: 400_000, siteLoadW: 2_000_000 }));
    expect(d.requestedW).toBe(400_000);
    expect(d.rule).toBe('fallback/hold-last-setpoint');
    expect(d.explanation).toMatch(/holds the last setpoint/i);
  });

  it('decides normally while the telemetry is inside its timeout', () => {
    const d = decide(peakShavingPolicy, observe({ telemetryAgeSeconds: 10, siteLoadW: 2_000_000 }));
    expect(d.usedFallback).toBe(false);
    expect(d.rule).toBe('peak-shaving/above-target');
  });
});

describe('the setpoint cadence is not the integration step', () => {
  it('holds the previous setpoint between decisions, and says which steps were held', () => {
    const slow = sealWith(emsPolicySchema, { ...priceSchedulePolicy, id: 'policy-slow', setpointCadenceSeconds: 3600 });
    const out = run({ policy: slow });
    const held = out.decisions.decisions.filter(d => d.heldSetpoint);
    const fresh = out.decisions.decisions.filter(d => !d.heldSetpoint);
    expect(fresh.length, 'one decision an hour across a day').toBe(24);
    expect(held.length).toBe(out.decisions.decisions.length - 24);
    // A held step asks for exactly what the last decision asked for.
    for (let i = 1; i < out.decisions.decisions.length; i++) {
      if (out.decisions.decisions[i].heldSetpoint) {
        expect(out.decisions.decisions[i].requestedPowerW).toBe(out.decisions.decisions[i - 1].requestedPowerW);
      }
    }
  });

  it('decides every step when the cadence matches the step', () => {
    const out = run({ policy: peakShavingPolicy });
    expect(out.decisions.decisions.every(d => !d.heldSetpoint)).toBe(true);
  });
});

describe('what each policy actually does with a day', () => {
  it('shaves the peak it was given a target for', () => {
    const shaved = run({ policy: peakShavingPolicy });
    const peakOf = (o: ReturnType<typeof run>) => Math.max(...o.series.gridImportW);
    const unmanaged = run({ policy: sealWith(emsPolicySchema, { ...manualPolicy, id: 'policy-idle' }) });
    expect(peakOf(shaved)).toBeLessThan(peakOf(unmanaged));
    expect(Math.max(...siteLoadProfile.samples), 'the day does have a peak to shave').toBeGreaterThan(peakShavingPolicy.peakTargetW!);
  });

  it('stores surplus generation rather than exporting it, and never imports to charge', () => {
    const out = run({ policy: selfConsumptionPolicy });
    const noon = out.series.timeSeconds.findIndex(t => t >= 13 * 3600);
    expect(out.series.generationW[noon]).toBeGreaterThan(out.series.siteLoadW[noon]);
    expect(out.series.achievedPowerW[noon], 'charging at noon').toBeLessThan(0);
    // Charging only ever with surplus: the decision never asks for more than the surplus there was.
    for (const d of out.decisions.decisions) {
      if (d.rule === 'self-consumption/store-surplus') {
        expect(-d.requestedPowerW).toBeLessThanOrEqual(d.observed.generationW - d.observed.siteLoadW + 1e-6);
      }
    }
  });

  it('follows a schedule by the clock, and says which window it is in', () => {
    const out = run({ policy: priceSchedulePolicy });
    const at = (hour: number) => out.decisions.decisions.find(d => d.atSeconds >= hour * 3600)!;
    expect(at(2).rule).toBe('price-schedule/charge@0');
    expect(at(12).rule).toBe('price-schedule/hold@6');
    expect(at(19).rule).toBe('price-schedule/discharge@18');
    expect(at(19).explanation).toMatch(/illustrative/i);
  });

  it('keeps the backup ready before it considers anything else', () => {
    const empty = sealWith(scenarioSchema, { ...dayScenario, initialSoc: 0.2 });
    const out = run({ scenario: empty, policy: backupReservePolicy, manualRequestW: 2_000_000 });
    expect(out.decisions.decisions[0].rule).toBe('backup-reserve/restore');
    expect(out.decisions.decisions[0].action).toBe('charge');
    expect(out.series.soc[out.series.soc.length - 1]).toBeGreaterThan(0.2);
  });

  it('reads the hour of the day the way a schedule means it', () => {
    expect(hourOfDay(0)).toBe(0);
    expect(hourOfDay(3600 * 5.5)).toBeCloseTo(5.5, 9);
    expect(hourOfDay(3600 * 25)).toBeCloseTo(1, 9);
  });
});

describe('comparing two policies without flattering either', () => {
  const compare = () => comparePolicies(
    { scenario: dayScenario, plant: teachingPlant, parameters: lfpParameterSet, manualRequestW: 0 },
    fixedSchedulePolicy, peakShavingPolicy,
  );

  it('runs both on identical inputs, and proves it by hash', () => {
    const c = compare();
    expect(c.scenarioHash).toBe(dayHash(dayScenario));
    expect(c.scenarioHash, 'the policy pointer is normalised away, nothing else is')
      .toBe(dayHash(sealWith(scenarioSchema, { ...dayScenario, policyId: fixedSchedulePolicy.id })));
    expect(c.plantHash).toBe(teachingPlant.configHash);
    expect(c.parameterSetHash).toBe(lfpParameterSet.configHash);
  });

  it('discloses the ending charge whether or not anybody asked', () => {
    const c = compare();
    expect(c.disclosures.join(' ')).toMatch(/finish|ended at/i);
    expect(c.disclosures.join(' ')).toMatch(/illustrative/i);
    expect(c.disclosures.join(' ')).toMatch(/not the production ergOS algorithm/i);
  });

  it('reconciles the stored energy before any benefit is attributed', () => {
    const c = compare();
    expect(c.reconciledCostDelta).toBeCloseTo(c.costDelta - c.storedEnergyValue, 6);
    if (Math.abs(c.endingSocDelta) > 0.001) {
      expect(c.reconciledCostDelta).not.toBe(c.costDelta);
      expect(c.disclosures[0]).toMatch(/reconciled figure is the one to read/i);
    }
  });

  it('reports a worse outcome as a worse outcome', () => {
    // A schedule that discharges into the cheap window and charges in the dear one is a bad
    // policy, and the comparison has to be willing to say so about the candidate.
    const perverse = sealWith(emsPolicySchema, {
      ...priceSchedulePolicy, id: 'policy-perverse', label: 'Backwards schedule',
      priceWindows: [
        { fromHour: 0, toHour: 6, pricePerMWh: 3_000, action: 'discharge' },
        { fromHour: 18, toHour: 22, pricePerMWh: 12_000, action: 'charge' },
      ],
    });
    const c = comparePolicies(
      { scenario: dayScenario, plant: teachingPlant, parameters: lfpParameterSet, manualRequestW: 0 },
      priceSchedulePolicy, perverse,
    );
    expect(c.reconciledCostDelta).toBeGreaterThan(0);
    expect(c.disclosures.join(' ')).toMatch(/cost more, not less/i);
  });

  it('keeps every protection on both sides of the comparison', () => {
    const c = compare();
    for (const o of [c.baseline, c.candidate]) {
      expect(o.complete).toBe(true);
      expect(o.endingSoc).toBeGreaterThanOrEqual(0);
      expect(o.endingSoc).toBeLessThanOrEqual(1);
    }
  });

  it('counts self-consumption as generation that stayed, not as energy that came back later', () => {
    const c = compare();
    const generated = solarProfile.samples.reduce((a, b) => a + b, 0) * (dayScenario.stepSeconds / 3600);
    expect(c.candidate.selfConsumedWh).toBeLessThanOrEqual(generated + 1e-6);
    expect(c.candidate.selfConsumedWh).toBeGreaterThan(0);
  });

  it('refuses to call a run with unserved load a cheaper one', () => {
    const out = run({ scenario: outageScenario, plant: teachingPlant, policy: backupReservePolicy });
    const o = outcomeOf(backupReservePolicy, out.series, dayScenario.price!.samples, true);
    expect(o.unservedWh).toBeGreaterThan(0);
  });
});

describe('the card a learner actually reads', () => {
  it('does not say the same thing twice when the policy is itself the reason', () => {
    const atReserve = sealWith(scenarioSchema, { ...dayScenario, initialSoc: manualPolicy.reserveSoc });
    const out = run({ scenario: atReserve, policy: manualPolicy, manualRequestW: 1_000_000 });
    const d = out.decisions.decisions[0];
    expect(d.explanation).toMatch(/reserve/i);
    expect(d.explanation, 'no "the reserve held back held it to 0 kW" tacked on the end')
      .not.toMatch(/held back held it to/i);
  });

  it('attributes the action to whoever took it', () => {
    // Charging a full battery: ergOS asked to charge, and a ceiling downstream allowed nothing.
    // The action is still "charge" — reading it as "reduce" would credit ergOS with the refusal.
    const full = sealWith(scenarioSchema, { ...dayScenario, initialSoc: 1 });
    const out = run({ scenario: full, policy: manualPolicy, manualRequestW: -1_000_000 });
    expect(out.decisions.decisions[0].action).toBe('charge');
    expect(out.series.bindingConstraint[0]).toBe('State of charge ceiling');
    expect(Math.abs(out.series.achievedPowerW[0])).toBeLessThan(1);
  });

  it('records the limits behind the decision, restated as power a reader can compare', () => {
    const out = run({ policy: manualPolicy, manualRequestW: 1_000_000 });
    const limits = out.decisions.decisions[0].appliedLimits;
    expect(limits.length).toBeGreaterThan(2);
    for (const l of limits) {
      expect(l.limitW).toBeGreaterThanOrEqual(0);
      expect(l.reason).toMatch(/: /);
      expect(['PCS', 'BMS', 'grid', 'battery', 'EMS']).toContain(l.by);
    }
  });
});

describe('the connection is shared between the site and the plant', () => {
  it('never lets the plant charge the connection into overload', () => {
    // A plant charging at its rating while the site is already drawing two megawatts is asking the
    // connection for the sum. Before this was a limit, the overflow came back as load nobody
    // served — the site going dark because the battery was busy filling itself.
    const empty = sealWith(scenarioSchema, { ...dayScenario, initialSoc: 0.12 });
    const out = run({ scenario: empty, policy: backupReservePolicy });
    for (const [i, imp] of out.series.gridImportW.entries()) {
      expect(imp, `sample ${i}`).toBeLessThanOrEqual(teachingPlant.gridImportLimitW + 1e-6);
      expect(out.series.unservedLoadW[i], `sample ${i} unserved`).toBeLessThan(1e-6);
    }
  });

  it('lets the plant export more than the export limit only by what the site itself absorbs', () => {
    const out = run({ policy: priceSchedulePolicy });
    for (const [i, exp] of out.series.gridExportW.entries()) {
      expect(exp, `sample ${i}`).toBeLessThanOrEqual(teachingPlant.gridExportLimitW + 1e-6);
    }
  });
});
