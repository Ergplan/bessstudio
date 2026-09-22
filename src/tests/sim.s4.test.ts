import { describe, expect, it } from 'vitest';
import { simulate } from '../sim/engine';
import {
  coolingFailureCondition, communicationLossCondition, hotCondition, lfpParameterSet,
  manualPolicy, normalCondition, teachingPlant, weakCellCondition,
} from '../sim/presets';
import { scenarioSchema, sealWith, type Scenario } from '../sim/records';
import { deratedRatingW } from '../sim/limits';
import { pcsStates } from '../sim/pcs';
import { bmsStates } from '../sim/bms';

/**
 * S4 — the converter and the management system inside a whole run.
 *
 * The unit tests in `sim.bms.test.ts` prove the state machines in isolation. These prove they are
 * actually wired in: that an injected condition changes what the plant does, that the change is
 * attributed to the subsystem that caused it, and that nothing steps past a protection limit and
 * comes back with a legal-looking endpoint.
 */

const run = (scenario: Scenario, manualRequestW = 2_000_000) => simulate({
  scenario, plant: teachingPlant, policy: manualPolicy, parameters: lfpParameterSet, manualRequestW,
});

const last = <T>(a: T[]) => a[a.length - 1];
const dispatching = <T>(a: T[]) => a.slice(0, -1);

describe('requested against achieved, all the way through', () => {
  it('meets what it is asked when nothing is in the way, and says so', () => {
    const out = run(normalCondition, 800_000);
    expect(out.run.status).toBe('complete');
    expect(out.series.achievedPowerW[0] / 1e3).toBeCloseTo(800, 1);
    expect(out.series.bindingConstraint[0]).toBe('Request met in full');
    expect(out.series.pcsState[0]).toBe('discharging');
    expect(out.series.bmsState[0]).toBe('normal');
  });

  it('reports the converter as derated when it is holding the request back', () => {
    const out = run(normalCondition, 4_000_000);
    expect(out.series.pcsState[0]).toBe('derated');
    expect(Math.abs(out.series.achievedPowerW[0])).toBeLessThan(4_000_000);
    expect(out.series.bindingConstraint[0]).not.toBe('Request met in full');
  });

  it('names a state for every sample, from the two vocabularies that own them', () => {
    const out = run(weakCellCondition);
    for (const [i, s] of out.series.pcsState.entries()) {
      expect(pcsStates as readonly string[], `sample ${i}`).toContain(s);
    }
    for (const [i, s] of out.series.bmsState.entries()) {
      expect(bmsStates as readonly string[], `sample ${i}`).toContain(s);
    }
  });
});

describe('a hot plant', () => {
  it('derates the converter, which a cool one does not', () => {
    const hot = run(hotCondition, 2_500_000);
    const cool = run(normalCondition, 2_500_000);
    // Power, not energy. A derated plant delivers less at any moment and therefore lasts longer,
    // so the energy it moves before it empties is about the same — which is worth knowing, and is
    // the opposite of what a careless comparison would report.
    const peak = (o: typeof hot) => Math.max(...o.series.achievedPowerW);
    expect(peak(hot) / 1e3, 'a hot plant gives less at any one moment').toBeLessThan(peak(cool) / 1e3);
    const moved = (o: typeof hot) => dispatching(o.series.achievedPowerW).reduce((t, p) => t + Math.max(0, p), 0);
    expect(moved(hot) / moved(cool), 'but moves much the same energy, over longer').toBeCloseTo(1, 1);
    // Which subsystem holds it back is worth reading rather than assuming. At this ambient the
    // cell's own over-temperature protection reaches its band before the converter reaches its
    // derating, so the management system is the one that answers — and it says so.
    expect(hot.series.bindingConstraint.some(c => /temperature|derated/i.test(c)), hot.series.bindingConstraint.join(',').slice(0, 80)).toBe(true);
    expect(cool.series.bindingConstraint.some(c => /temperature|derated/i.test(c))).toBe(false);
    // The rule underneath it, checked directly.
    expect(deratedRatingW(teachingPlant.converter, 50)).toBeLessThan(teachingPlant.converter.ratedW);
    expect(deratedRatingW(teachingPlant.converter, 40)).toBe(teachingPlant.converter.ratedW);
  });

  it('settles above its ambient rather than cooling to it, because it is working', () => {
    const hot = run(hotCondition, 2_500_000);
    expect(last(hot.series.cellTempC)).toBeGreaterThan(hotCondition.ambientC!);
  });

  it('gets hotter under load than at rest', () => {
    const working = run(hotCondition, 2_500_000);
    const idle = run(hotCondition, 0);
    expect(last(working.series.cellTempC)).toBeGreaterThan(last(idle.series.cellTempC));
    expect(last(idle.series.cellTempC), 'an idle plant sits at its ambient').toBeCloseTo(hotCondition.ambientC!, 0);
  });
});

describe('one weak cell', () => {
  it('opens a spread the protections can see, where a single cell would show none', () => {
    const weak = run(weakCellCondition, 1_500_000);
    const normal = run(normalCondition, 1_500_000);
    const spread = (o: typeof weak, i: number) => o.series.cellVoltageMaxV[i] - o.series.cellVoltageMinV[i];
    expect(spread(normal, 0), 'no spread injected, no spread reported').toBeCloseTo(0, 9);
    // At the first sample nothing has flowed yet, so the terminals show only the difference in
    // open-circuit voltage — which on a flat LFP curve is almost nothing. The spread the
    // protections actually see is the one under load.
    expect(spread(weak, 0), 'at rest the curve hides it').toBeLessThan(0.01);
    expect(spread(weak, 5), 'under load it does not').toBeGreaterThan(0.05);
    expect(spread(normal, 5), 'and a pack with no spread still shows none').toBeCloseTo(0, 9);
  });

  it('stops the whole pack on the weak cell while the average is still comfortable', () => {
    const weak = run(weakCellCondition, 1_500_000);
    const iStopped = weak.series.achievedPowerW.findIndex((p, i) => i > 0 && Math.abs(p) < 1e3);
    expect(iStopped, 'it does stop').toBeGreaterThan(0);
    // At the moment it stops, the representative cell still has charge in it.
    expect(weak.series.soc[iStopped], 'the average is not the problem').toBeGreaterThan(manualPolicy.reserveSoc);
    expect(weak.series.cellVoltageMinV[iStopped], 'the weakest cell is').toBeLessThan(weak.series.cellVoltageV[iStopped]);
  });

  it('empties sooner than the same plant with no spread in it', () => {
    const weak = run(weakCellCondition, 1_500_000);
    const normal = run(normalCondition, 1_500_000);
    const delivered = (o: typeof weak) => dispatching(o.series.achievedPowerW).reduce((t, p) => t + Math.max(0, p), 0);
    expect(delivered(weak)).toBeLessThan(delivered(normal));
  });

  it('runs the weak cell warmer, because more of the loss is in it', () => {
    const weak = run(weakCellCondition, 1_500_000);
    expect(last(weak.series.cellTempMaxC)).toBeGreaterThan(last(weak.series.cellTempC));
  });
});

describe('when the cooling stops', () => {
  const out = run(coolingFailureCondition, 2_500_000);

  it('shows the temperature climbing after it fails, and not before', () => {
    const failsAt = coolingFailureCondition.injected.coolingFailsAtSeconds!;
    const before = out.series.cellTempC[Math.floor(failsAt / out.series.stepSeconds) - 1];
    const after = last(out.series.cellTempC);
    expect(after, 'it climbs once the loop stops').toBeGreaterThan(before);
  });

  it('derates and then stops, rather than carrying on at full power into a limit', () => {
    const states = out.series.bmsState;
    expect(states.some(s => s === 'derating' || s === 'alarm' || s === 'tripped'), states.join(',').slice(0, 80)).toBe(true);
    const iDerate = states.findIndex(s => s !== 'normal');
    const iStop = states.findIndex(s => s === 'tripped');
    if (iStop >= 0) expect(iDerate, 'it derates before it trips').toBeLessThan(iStop);
  });

  it('models a temperature and a derating, and claims nothing else', () => {
    // §12.5: no propagation is modelled and none is claimed. The only thermal channels in the
    // result are the representative cell and the hottest one.
    expect(Object.keys(out.series).filter(k => /temp/i.test(k)).sort()).toEqual(['cellTempC', 'cellTempMaxC']);
    expect(last(out.series.cellTempC), 'nothing runs away').toBeLessThan(200);
  });
});

describe('when the management system goes quiet', () => {
  const out = run(communicationLossCondition, 1_500_000);
  const lostAt = communicationLossCondition.injected.communicationLostAtSeconds!;
  const i = Math.floor(lostAt / out.series.stepSeconds);

  it('dispatches before, and stops after', () => {
    expect(Math.abs(out.series.achievedPowerW[i - 1]), 'dispatching before').toBeGreaterThan(1e5);
    expect(Math.abs(out.series.achievedPowerW[i + 2]), 'stopped after').toBeLessThan(1e3);
  });

  it('records it as the management system’s doing, not the converter’s', () => {
    const event = out.events.events.find(e => e.code === 'communication-lost');
    expect(event, out.events.events.map(e => e.code).join(',')).toBeTruthy();
    expect(event!.owner).toBe('BMS');
    expect(event!.atSeconds).toBeGreaterThanOrEqual(lostAt);
  });
});

describe('no hidden one-step overshoot', () => {
  /**
   * §17.2 asks for this by name, and §13.1 explains why: a solver that steps past a protection
   * limit and returns a legal-looking endpoint has silently broken the thing the model exists to
   * show. Checked at every reported sample, on every condition, at reporting steps from one minute
   * to ten — because the point of the check is that it does not depend on how finely anyone looked.
   */
  const cell = lfpParameterSet.cell;

  it('never reports a cell outside its voltage window, at any timestep or in any condition', () => {
    for (const base of [normalCondition, hotCondition, weakCellCondition, coolingFailureCondition]) {
      for (const stepSeconds of [60, 300, 600]) {
        for (const request of [2_500_000, -2_500_000]) {
          const scenario = sealWith(scenarioSchema, { ...base, stepSeconds, initialSoc: request > 0 ? 0.15 : 0.95 });
          const out = run(scenario, request);
          const where = `${base.label} at ${stepSeconds} s, ${request > 0 ? 'discharging' : 'charging'}`;
          for (const [i, v] of out.series.cellVoltageMinV.entries()) {
            expect(v, `${where}, sample ${i} low`).toBeGreaterThanOrEqual(cell.minV - 1e-6);
          }
          for (const [i, v] of out.series.cellVoltageMaxV.entries()) {
            expect(v, `${where}, sample ${i} high`).toBeLessThanOrEqual(cell.maxV + 1e-6);
          }
          for (const [i, s] of out.series.soc.entries()) {
            expect(s, `${where}, sample ${i} charge`).toBeGreaterThanOrEqual(-1e-9);
            expect(s, `${where}, sample ${i} charge`).toBeLessThanOrEqual(1 + 1e-9);
          }
        }
      }
    }
  });

  it('never reports a current past what the management system permits', () => {
    for (const base of [normalCondition, weakCellCondition]) {
      for (const stepSeconds of [60, 600]) {
        const scenario = sealWith(scenarioSchema, { ...base, stepSeconds });
        const out = run(scenario, 4_000_000);
        const perCell = (i: number) => Math.abs(out.series.packCurrentA[i]) / (teachingPlant.cellTopology.parallel * teachingPlant.packTopology.parallel);
        for (let i = 0; i < out.series.packCurrentA.length; i++) {
          expect(perCell(i), `${base.label} at ${stepSeconds} s, sample ${i}`)
            .toBeLessThanOrEqual(cell.limits.dischargeCurrentMaxA + 1e-6);
        }
      }
    }
  });
});

describe('what the management system believes, inside a run', () => {
  it('drifts against the truth across the flat middle, and says both numbers', () => {
    const scenario = sealWith(scenarioSchema, { ...normalCondition, initialSoc: 0.6, durationSeconds: 10_800 });
    const out = run(scenario, 200_000);
    const believed = last(out.series.countedSoc), actual = last(out.series.soc);
    expect(believed).not.toBe(actual);
    expect(Math.abs(believed - actual), 'and the gap is small, as a sensor offset is').toBeLessThan(0.02);
  });
});

/**
 * The silences.
 *
 * Every one of these was found by opening the lesson and asking why nothing was happening. A plant
 * that refuses a request and says nothing about it is worse than one that refuses loudly: the
 * learner concludes the model is broken, and on the evidence in front of them they are right.
 */
describe('nothing is refused silently', () => {
  it('names the policy as the constraint when the policy is what stopped it', () => {
    const scenario = sealWith(scenarioSchema, { ...normalCondition, initialSoc: manualPolicy.reserveSoc });
    const out = run(scenario, 2_500_000);
    expect(out.series.achievedPowerW[0]).toBe(0);
    expect(out.series.bindingConstraint[0], 'the constraint has to be named').toBe('Reserve held back');
    const held = out.events.events.find(e => e.owner === 'EMS');
    expect(held, 'and logged against whoever decided it').toBeTruthy();
    expect(held!.severity).toBe('limit');
    expect(held!.message).toMatch(/reserve/i);
    expect(out.decisions.decisions[0].explanation).toMatch(/reserve/i);
  });

  it('stays quiet when nothing was asked of it, because that is not a refusal', () => {
    const out = run(normalCondition, 0);
    expect(out.series.bindingConstraint[0]).toBe('');
    expect(out.events.events.filter(e => e.owner === 'EMS')).toHaveLength(0);
    expect(out.series.pcsState[0]).toBe('standby');
  });

  it('names the ceiling when a full battery is asked to charge', () => {
    const scenario = sealWith(scenarioSchema, { ...normalCondition, initialSoc: 1 });
    const out = run(scenario, -2_500_000);
    expect(Math.abs(out.series.achievedPowerW[0])).toBeLessThan(1);
    expect(out.series.bindingConstraint[0]).toBe('State of charge ceiling');
    expect(out.series.pcsState[0], 'the converter is dispatching nothing, not idle').toBe('derated');
    const e = out.events.events.find(x => x.code === 'state-of-charge-ceiling');
    expect(e).toBeTruthy();
    expect(e!.message).toMatch(/held to nothing/);
  });

  it('keeps alarm and trip for the protections, not for a ceiling doing its job', () => {
    for (const [label, scenario, request] of [
      ['full', sealWith(scenarioSchema, { ...normalCondition, initialSoc: 1 }), -2_500_000],
      ['empty', sealWith(scenarioSchema, { ...normalCondition, initialSoc: 0.1 }), 2_500_000],
    ] as const) {
      const out = run(scenario, request);
      for (const e of out.events.events) {
        expect(['info', 'limit'], `${label}: ${e.code} came back as ${e.severity}`).toContain(e.severity);
      }
    }
  });
});

describe('the state and the constraint are two readings of one moment', () => {
  it('never reports a converter meeting a request it is being held back from', () => {
    for (const [label, soc, request] of [
      ['at the current limit', 0.3, 2_500_000],
      ['near the floor', 0.15, 2_500_000],
      ['near the ceiling', 0.95, -2_500_000],
    ] as const) {
      const out = run(sealWith(scenarioSchema, { ...normalCondition, initialSoc: soc }), request);
      const s = out.series;
      for (const i of dispatching(s.timeSeconds).map((_, k) => k)) {
        const named = s.bindingConstraint[i] !== '' && s.bindingConstraint[i] !== 'Request met in full';
        if (named && Math.abs(s.achievedPowerW[i]) > 1) {
          expect(s.pcsState[i], `${label}, sample ${i}: "${s.bindingConstraint[i]}" but the converter reads ${s.pcsState[i]}`).toBe('derated');
        }
        if (s.bindingConstraint[i] === 'Request met in full') {
          expect(['discharging', 'charging'], `${label}, sample ${i}`).toContain(s.pcsState[i]);
        }
      }
    }
  });
});
