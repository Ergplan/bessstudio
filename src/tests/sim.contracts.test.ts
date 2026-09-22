import { describe, expect, it } from 'vitest';
import * as u from '../sim/units';
import { adapters, directionOf, signed, signConvention, toPandapowerStorageP, fromPandapowerStorageP } from '../sim/signs';
import {
  badgeRank, claimableBadge, evidenceBadges, outsideApplicability, provenanceSchema,
  weakestBadge, withinApplicability, type Provenance,
} from '../sim/provenance';
import { canonicalise, configHash, fullHash, sameConfiguration } from '../sim/hash';
import {
  cellParametersSchema, converterSchema, emsPolicySchema, equipmentParameterSetSchema,
  learningTemplateSchema, plantConfigurationSchema, scenarioSchema, seal, sealIntact,
  simulationRunSchema, timeSeriesResultSchema, sealWith, SIM_SCHEMA_VERSION,
} from '../sim/records';
import { lfpParameterSet, manualPolicy, presets, teachingPlant } from '../sim/presets';
import { answersConfiguration, decodeRun, decodeScenario, encode, roundForStorage, sealRun, storeScenario } from '../sim/store';

/**
 * S2 — model contracts and evidence.
 *
 * The stage's mandatory checks, in the order §17.2 lists them: round-trip persistence; invalid
 * units, ranges and topologies rejected; kW/MW and minute/hour conversions; immutable run
 * snapshots; hashes change with material inputs; evidence badges present. Tenant authorization on
 * the new records is checked against the rules themselves, in `firestore.rules.test.ts`, because
 * §17.2 asks for it there and not only in the interface.
 */

describe('units, and the refusal to mix them', () => {
  it('converts between the prefixes exactly, both ways', () => {
    expect(u.asKW(u.MW(2.5))).toBe(2500);
    expect(u.asMW(u.kW(2500))).toBe(2.5);
    expect(u.asW(u.MW(1))).toBe(1e6);
    expect(u.asMWh(u.kWh(1234))).toBeCloseTo(1.234, 12);
    expect(u.asKWh(u.MWh(0.5))).toBe(500);
    for (const n of [0, 1, 2.5, 1e-6, 1e9]) {
      expect(u.asMW(u.MW(n)), `${n} MW`).toBeCloseTo(n, 9);
      expect(u.asKWh(u.kWh(n)), `${n} kWh`).toBeCloseTo(n, 9);
    }
  });

  it('converts between minutes and hours exactly, both ways', () => {
    expect(u.asSeconds(u.minutes(30))).toBe(1800);
    expect(u.asHours(u.minutes(90))).toBe(1.5);
    expect(u.asMinutes(u.hours(2))).toBe(120);
    expect(u.asHours(u.seconds(3600))).toBe(1);
  });

  it('turns power and time into energy only through the sanctioned crossing', () => {
    // 20 kW for half an hour is 10 kWh. The fixture F01 case, checked here at the unit level.
    expect(u.asKWh(u.energyOver(u.kW(20), u.minutes(30)))).toBeCloseTo(10, 12);
    expect(u.asKW(u.powerOver(u.kWh(10), u.minutes(30)))).toBeCloseTo(20, 12);
    // And back again, for a spread of values.
    for (const [p, t] of [[1, 60], [2500, 3600], [0.5, 1], [1e6, 7200]] as const) {
      const e = u.energyOver(u.W(p), u.seconds(t));
      expect(u.asW(u.powerOver(e, u.seconds(t))), `${p} W for ${t} s`).toBeCloseTo(p, 6);
    }
  });

  it('refuses the conversions that have no answer', () => {
    expect(() => u.powerOver(u.kWh(1), u.seconds(0))).toThrow(RangeError);
    expect(() => u.chargeAt(u.kWh(1), u.V(0))).toThrow(RangeError);
    expect(() => u.currentAt(u.kW(1), u.V(0))).toThrow(RangeError);
  });

  it('keeps amp-hours and watt-hours apart until a voltage is named', () => {
    const cell = u.Ah(314), volts = u.V(3.2);
    expect(u.asWh(u.energyAt(cell, volts))).toBeCloseTo(1004.8, 9);
    expect(u.asAh(u.chargeAt(u.energyAt(cell, volts), volts))).toBeCloseTo(314, 9);
  });

  it('crosses from cell to pack only with the topology named', () => {
    const pack = { series: 104, parallel: 1 };
    expect(u.asV(u.packVoltage(u.V(3.2), pack))).toBeCloseTo(332.8, 9);
    expect(u.asAh(u.packCapacity(u.Ah(314), pack))).toBe(314);
    expect(u.asWh(u.packEnergy(u.energyAt(u.Ah(314), u.V(3.2)), pack))).toBeCloseTo(104_499.2, 6);
    expect(u.cellsIn(pack)).toBe(104);
    // Parallel cells raise current and capacity, series raises voltage; resistance goes both ways.
    const two = { series: 2, parallel: 2 };
    expect(u.asA(u.packCurrent(u.A(157), two))).toBe(314);
    expect(u.asOhm(u.packResistance(u.ohm(1), two))).toBe(1);
    expect(u.asOhm(u.packResistance(u.ohm(1), { series: 4, parallel: 1 }))).toBe(4);
  });

  it('builds the reference string the catalogue describes', () => {
    // 104 cells in series make a pack; four packs in series make a string.
    const cell = u.V(3.2);
    const packV = u.packVoltage(cell, { series: 104, parallel: 1 });
    const stringV = u.packVoltage(packV, { series: 4, parallel: 1 });
    expect(u.asV(stringV)).toBeCloseTo(1331.2, 9);
    const stringMaxV = u.packVoltage(u.packVoltage(u.V(3.65), { series: 104, parallel: 1 }), { series: 4, parallel: 1 });
    expect(u.asV(stringMaxV)).toBeCloseTo(1518.4, 9);
  });

  it('computes apparent power from active and reactive', () => {
    expect(u.asKVA(u.apparent(u.kW(60), u.kVAr(80)))).toBeCloseTo(100, 9);
    expect(u.asKVA(u.apparent(u.kW(100), u.kVAr(0)))).toBeCloseTo(100, 9);
  });
});

describe('one sign convention, and an adapter for every library that disagrees', () => {
  it('states the convention it carries', () => {
    expect(signConvention.activePower).toContain('discharging');
    expect(signConvention.batteryCurrent).toContain('discharge');
  });

  it('reads a signed power the way the convention says', () => {
    expect(directionOf(u.kW(100))).toBe('discharge');
    expect(directionOf(u.kW(-100))).toBe('charge');
    expect(directionOf(u.W(0))).toBe('idle');
    expect(signed(100, 'charge')).toBe(-100);
    expect(signed(-100, 'charge'), 'a magnitude is a magnitude whatever sign it arrives with').toBe(-100);
    expect(signed(100, 'discharge')).toBe(100);
    expect(signed(100, 'idle')).toBe(0);
  });

  it('flips for pandapower, which calls charging positive, and flips back', () => {
    const discharging = u.kW(250);
    expect(toPandapowerStorageP(discharging), 'discharge is negative to pandapower').toBeLessThan(0);
    expect(fromPandapowerStorageP(toPandapowerStorageP(discharging))).toBe(discharging);
  });

  it('round-trips every adapter in both directions, and flips exactly the ones that should', () => {
    for (const a of adapters) {
      for (const value of [0, 1, -1, 2507.5, -1e6]) {
        const there = a.to(value as never);
        expect(a.from(there as never), `${a.library} ${a.quantity} at ${value}`).toBeCloseTo(value, 9);
        if (value !== 0) {
          expect(Math.sign(there as number) !== Math.sign(value), `${a.library} ${a.quantity} flips`).toBe(a.flips);
        }
      }
    }
  });
});

describe('evidence badges', () => {
  const ok = (over: Partial<Provenance> = {}) => provenanceSchema.parse({
    badge: 'illustrative', source: '', reviewedOn: null,
    applicability: { temperatureC: [0, 45], socFraction: [0, 1], cRate: [0, 1], notes: '' },
    assumptions: [], ...over,
  });

  it('carries all three badges with a meaning for each', () => {
    expect(evidenceBadges).toHaveLength(3);
    for (const b of evidenceBadges) expect(badgeRank[b]).toBeTypeOf('number');
  });

  it('refuses a claim it has no evidence for', () => {
    expect(() => ok({ badge: 'published-source' })).toThrow(/needs a source/);
    expect(() => ok({ badge: 'validated-against-equipment', source: 'a data sheet' })).toThrow(/review date/);
    expect(ok({ badge: 'validated-against-equipment', source: 'a data sheet', reviewedOn: '2026-09-01' }).badge)
      .toBe('validated-against-equipment');
  });

  it('claims only what its weakest parameter allows', () => {
    expect(weakestBadge(['validated-against-equipment', 'published-source'])).toBe('published-source');
    expect(weakestBadge(['validated-against-equipment'])).toBe('validated-against-equipment');
    expect(weakestBadge(['published-source', 'illustrative'])).toBe('illustrative');
  });

  it('drops to illustrative the moment a parameter is missing', () => {
    expect(claimableBadge(['validated-against-equipment'], [])).toBe('validated-against-equipment');
    expect(claimableBadge(['validated-against-equipment'], [{ name: 'entropic coefficient', why: 'not published for this cell', assumedValue: 0, assumedUnit: 'V/K' }]))
      .toBe('illustrative');
  });

  it('says when a condition is outside what the parameters cover, and why', () => {
    const a = ok().applicability;
    expect(withinApplicability(a, { temperatureC: 25, soc: 0.5, cRate: 0.5 })).toBe(true);
    expect(withinApplicability(a, { temperatureC: 55, soc: 0.5, cRate: 0.5 })).toBe(false);
    const why = outsideApplicability(a, { temperatureC: 55, soc: 0.5, cRate: 2 });
    expect(why).toHaveLength(2);
    expect(why.join(' ')).toContain('55.0 °C');
    expect(why.join(' ')).toContain('2.00 C');
    expect(outsideApplicability(a, { temperatureC: 25, soc: 0.5, cRate: 0.5 })).toHaveLength(0);
  });
});

describe('the configuration hash', () => {
  const cfg = { power: 2500, duration: 4, label: 'Anything', notes: 'anything at all' };

  it('changes when a material input changes', () => {
    expect(configHash({ ...cfg, power: 2501 })).not.toBe(configHash(cfg));
    expect(configHash({ ...cfg, duration: 4.0001 })).not.toBe(configHash(cfg));
  });

  it('does not change when only the description does', () => {
    expect(configHash({ ...cfg, label: 'Something else' })).toBe(configHash(cfg));
    expect(configHash({ ...cfg, notes: '' })).toBe(configHash(cfg));
    expect(configHash({ ...cfg, id: 'x', createdAt: '2026-01-01', ownerUid: 'u' })).toBe(configHash(cfg));
    // The diagnostic hash exists precisely so the difference can be seen when it matters.
    expect(fullHash({ ...cfg, label: 'Something else' })).not.toBe(fullHash(cfg));
  });

  it('does not depend on the order the fields were written in', () => {
    expect(configHash({ a: 1, b: 2 })).toBe(configHash({ b: 2, a: 1 }));
    expect(configHash({ a: { x: 1, y: 2 } })).toBe(configHash({ a: { y: 2, x: 1 } }));
    // Arrays are ordered, and their order is material.
    expect(configHash({ a: [1, 2] })).not.toBe(configHash({ a: [2, 1] }));
  });

  it('writes numbers one way, so the same value cannot hash two ways', () => {
    expect(canonicalise(1)).toBe(canonicalise(1.0));
    expect(canonicalise(0)).toBe(canonicalise(-0));
    expect(configHash({ v: 1e3 })).toBe(configHash({ v: 1000 }));
    expect(canonicalise(NaN)).toBe('NaN');
    expect(canonicalise(Infinity)).toBe('Inf');
  });

  it('tells apart configurations that differ anywhere at all', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 500; i++) seen.add(configHash({ ...cfg, power: 2500 + i * 0.001 }));
    expect(seen.size, 'five hundred distinct configurations hashed to distinct values').toBe(500);
    expect(sameConfiguration(cfg, { ...cfg })).toBe(true);
  });

  it('seals idempotently, and notices a record edited after it was sealed', () => {
    const once = seal({ id: 'r', power: 100 });
    const twice = seal(once);
    expect(twice.configHash).toBe(once.configHash);
    expect(once.schemaVersion).toBe(SIM_SCHEMA_VERSION);
    expect(sealIntact(once)).toBe(true);
    expect(sealIntact({ ...once, power: 101 })).toBe(false);
    expect(sealIntact({ ...once, id: 'renamed' }), 'a rename is not a material change').toBe(true);
  });
});

describe('the records, and what they refuse', () => {
  it('accepts every preset it ships with', () => {
    expect(() => equipmentParameterSetSchema.parse(lfpParameterSet)).not.toThrow();
    expect(() => plantConfigurationSchema.parse(teachingPlant)).not.toThrow();
    expect(() => emsPolicySchema.parse(manualPolicy)).not.toThrow();
    for (const p of [...presets.parameterSets, ...presets.plants, ...presets.policies]) {
      expect(sealIntact(p as never), `${p.id} seal intact`).toBe(true);
      expect(p.schemaVersion).toBe(SIM_SCHEMA_VERSION);
    }
  });

  const cell = () => structuredClone(lfpParameterSet.cell);

  it('rejects a cell whose voltage window is upside down or whose nominal sits outside it', () => {
    expect(() => cellParametersSchema.parse({ ...cell(), minV: 3.8 })).toThrow(/below the maximum/);
    expect(() => cellParametersSchema.parse({ ...cell(), nominalV: 4.0 })).toThrow(/inside the operating window/);
  });

  it('rejects an open-circuit curve that does not ascend, or that leaves the window', () => {
    expect(() => cellParametersSchema.parse({ ...cell(), ocvCurve: [{ soc: 0.5, volts: 3.2 }, { soc: 0.2, volts: 3.3 }] }))
      .toThrow(/ascend/);
    expect(() => cellParametersSchema.parse({ ...cell(), ocvCurve: [{ soc: 0, volts: 3.2 }, { soc: 1, volts: 9 }] }))
      .toThrow(/leaves the cell voltage window/);
  });

  it('rejects impossible numbers outright', () => {
    for (const bad of [{ capacityAh: 0 }, { capacityAh: -314 }, { resistanceOhm: 0 }, { coulombicEfficiency: 1.2 }, { massKg: 0 }]) {
      expect(() => cellParametersSchema.parse({ ...cell(), ...bad }), JSON.stringify(bad)).toThrow();
    }
  });

  it('rejects a converter that cannot reach its own rating at the bottom of its own window', () => {
    const c = structuredClone(teachingPlant.converter);
    expect(() => converterSchema.parse(c)).not.toThrow();
    expect(() => converterSchema.parse({ ...c, dcMaxA: 2000 })).toThrow(/above the stated 2000 A limit/);
    expect(() => converterSchema.parse({ ...c, dcMinV: 1600 })).toThrow(/below its maximum/);
    expect(() => converterSchema.parse({ ...c, ratedVA: 1_000_000 })).toThrow(/cannot be below the active power rating/);
  });

  it('rejects a topology that is not a whole number of things', () => {
    for (const bad of [{ series: 0, parallel: 1 }, { series: 1.5, parallel: 1 }, { series: -4, parallel: 1 }, { series: 4, parallel: 0 }]) {
      expect(() => plantConfigurationSchema.parse({ ...teachingPlant, packTopology: bad }), JSON.stringify(bad)).toThrow();
    }
  });

  it('rejects a policy whose emergency floor sits above the reserve it exists to go below', () => {
    expect(() => emsPolicySchema.parse({ ...manualPolicy, emergencyReserveSoc: 0.5 })).toThrow(/cannot sit above/);
    expect(() => emsPolicySchema.parse({ ...manualPolicy, policy: 'peak-shaving' })).toThrow(/needs a target/);
    expect(() => emsPolicySchema.parse({ ...manualPolicy, policy: 'price-schedule' })).toThrow(/at least one window/);
  });

  const scenario = () => seal({
    id: 'sc-test', label: 'Test scenario', kind: 'Scenario' as const,
    plantId: teachingPlant.id, policyId: manualPolicy.id,
    initialSoc: 0.5, initialCellTempC: 25,
    durationSeconds: 1800, stepSeconds: 60,
    siteLoad: null, generation: null, price: null, outage: null, controls: ['power'],
  });

  it('accepts a whole scenario, and refuses one whose profile is the wrong length', () => {
    expect(() => scenarioSchema.parse(scenario())).not.toThrow();
    const wrong = { ...scenario(), siteLoad: { name: 'Site load', unit: 'W' as const, samples: [1, 2, 3] } };
    expect(() => scenarioSchema.parse(wrong)).toThrow(/3 samples for 30 steps/);
    const right = { ...scenario(), siteLoad: { name: 'Site load', unit: 'W' as const, samples: Array(30).fill(1000) } };
    expect(() => scenarioSchema.parse(right)).not.toThrow();
  });

  it('refuses a timestep longer than the scenario, and an outage that runs past its end', () => {
    expect(() => scenarioSchema.parse({ ...scenario(), stepSeconds: 3600 })).toThrow(/cannot be longer than the scenario/);
    expect(() => scenarioSchema.parse({ ...scenario(), outage: { fromSeconds: 600, toSeconds: 300 } })).toThrow(/must end after it starts/);
    expect(() => scenarioSchema.parse({ ...scenario(), outage: { fromSeconds: 600, toSeconds: 9000 } })).toThrow(/past the end/);
  });

  it('holds a lesson to three controls, four metrics and two charts', () => {
    const template = {
      id: 't', label: 'Charge and discharge', kind: 'LearningTemplate' as const,
      question: 'Where does energy go?', objective: 'Follow the energy.',
      expectedOutcomes: ['SOC rises on charge'], scenarioId: 'sc-test', estimatedMinutes: 3,
      metrics: ['a', 'b', 'c', 'd'], charts: ['x', 'y'], configHash: '0'.repeat(32), schemaVersion: 1,
    };
    expect(() => learningTemplateSchema.parse(template)).not.toThrow();
    expect(() => learningTemplateSchema.parse({ ...template, metrics: ['a', 'b', 'c', 'd', 'e'] })).toThrow();
    expect(() => learningTemplateSchema.parse({ ...template, charts: ['x', 'y', 'z'] })).toThrow();
    expect(() => scenarioSchema.parse({ ...scenario(), controls: ['a', 'b', 'c', 'd'] })).toThrow();
  });

  it('refuses a result whose channels disagree about how many samples there are', () => {
    const n = 3, arr = () => Array(n).fill(0);
    const series = {
      id: 's', label: 'r', kind: 'TimeSeriesResult' as const, runId: 'r', stepSeconds: 60,
      timeSeconds: [0, 60, 120], requestedPowerW: arr(), achievedPowerW: arr(), gridPowerW: arr(),
      dcPowerW: arr(), packVoltageV: arr(), packCurrentA: arr(), cellVoltageV: arr(),
      cellVoltageMaxV: arr(), cellVoltageMinV: arr(), soc: arr(), countedSoc: arr(),
      cellTempC: arr(), cellTempMaxC: arr(), converterLossW: arr(), batteryLossW: arr(), auxiliaryW: arr(),
      bindingConstraint: ['', '', ''], pcsState: ['', '', ''], bmsState: ['', '', ''],
      unservedLoadW: arr(), schemaVersion: 1,
    };
    expect(() => timeSeriesResultSchema.parse(series)).not.toThrow();
    expect(() => timeSeriesResultSchema.parse({ ...series, soc: [0, 0] })).toThrow(/2 samples against 3 timestamps/);
  });
});

describe('persistence, and what survives it', () => {
  const scenario = seal({
    id: 'sc-round', label: 'Round trip', kind: 'Scenario' as const,
    plantId: teachingPlant.id, policyId: manualPolicy.id,
    initialSoc: 0.42, initialCellTempC: 23.5, durationSeconds: 600, stepSeconds: 60,
    siteLoad: { name: 'Site load', unit: 'W' as const, samples: Array.from({ length: 10 }, (_, i) => 1000 + i) },
    generation: null, price: null, outage: null, controls: [],
  });

  it('goes out to storage and comes back the same', () => {
    const stored = storeScenario({ orgId: 'org', ownerUid: 'uid', at: '2026-09-22T00:00:00.000Z', scenario: scenario as never });
    const back = decodeScenario(encode(stored));
    expect(back).toEqual(stored);
    expect(back.record.initialSoc).toBe(0.42);
    expect(back.record.siteLoad!.samples).toEqual(scenario.siteLoad.samples);
    expect(back.orgId).toBe('org');
    expect(back.ownerUid).toBe('uid');
  });

  it('notices a record that was edited in the database rather than through the application', () => {
    const stored = storeScenario({ orgId: 'org', ownerUid: 'uid', at: '2026-09-22T00:00:00.000Z', scenario: scenario as never });
    const tampered = JSON.parse(encode(stored));
    tampered.record.initialSoc = 0.9;
    expect(() => decodeScenario(JSON.stringify(tampered))).toThrow(/configuration hash no longer matches/);
  });

  const run = (over: Record<string, unknown> = {}) => sealRun({
    orgId: 'org', ownerUid: 'uid', at: '2026-09-22T00:00:00.000Z',
    run: {
      id: 'run-1', label: 'Run 1', kind: 'SimulationRun', schemaVersion: 1,
      scenarioHash: scenario.configHash, plantHash: teachingPlant.configHash,
      policyHash: manualPolicy.configHash, parameterSetHash: lfpParameterSet.configHash,
      engine: 'bess-studio', engineVersion: '0.1.0',
      solver: { integrator: 'explicit-euler', subSteps: 1, toleranceFraction: 0.001, maxIterations: 20 },
      seed: null, signConvention: 'positive = discharging', status: 'complete',
      startedAt: '2026-09-22T00:00:00.000Z', finishedAt: '2026-09-22T00:00:01.000Z',
      failure: null, badge: 'illustrative', configHash: '0'.repeat(32), ...over,
    } as never,
    series: {
      id: 's-1', label: 'Series', kind: 'TimeSeriesResult', schemaVersion: 1, runId: 'run-1', stepSeconds: 60,
      timeSeconds: [0, 60], requestedPowerW: [1000.123456789, 0], achievedPowerW: [999.987654321, 0],
      gridPowerW: [0, 0], dcPowerW: [0, 0], packVoltageV: [0, 0], packCurrentA: [0, 0],
      cellVoltageV: [0, 0], cellVoltageMaxV: [0, 0], cellVoltageMinV: [0, 0],
      soc: [0.5, 0.49], countedSoc: [0.5, 0.49], cellTempC: [25, 25], cellTempMaxC: [25, 25],
      converterLossW: [0, 0], batteryLossW: [0, 0], auxiliaryW: [0, 0],
      bindingConstraint: ['', ''], pcsState: ['standby', 'standby'], bmsState: ['normal', 'normal'],
      unservedLoadW: [0, 0],
    } as never,
    decisions: { id: 'd-1', label: 'Decisions', kind: 'EMSDecisionLog', schemaVersion: 1, runId: 'run-1', decisions: [] } as never,
    events: { id: 'e-1', label: 'Events', kind: 'EventLog', schemaVersion: 1, runId: 'run-1', events: [] } as never,
  });

  it('stores a run with everything needed to say what produced it', () => {
    const stored = run();
    expect(stored.record.engineVersion).toBe('0.1.0');
    expect(stored.record.solver.integrator).toBe('explicit-euler');
    expect(stored.record.seed, 'a deterministic model says so rather than omitting the field').toBeNull();
    expect(stored.record.signConvention).toContain('discharging');
    expect(stored.record.badge).toBe('illustrative');
    expect(decodeRun(encode(stored))).toEqual(stored);
  });

  it('rounds the series for storage without moving it anywhere a reader would notice', () => {
    const stored = run();
    expect(stored.series.requestedPowerW[0]).toBe(1000.12);
    expect(roundForStorage(1 / 3)).toBe(0.333333);
    expect(Math.abs(stored.series.achievedPowerW[0] - 999.987654321)).toBeLessThan(1e-3);
  });

  it('answers a configuration only when all four hashes match and the run completed', () => {
    const want = {
      scenarioHash: scenario.configHash, plantHash: teachingPlant.configHash,
      policyHash: manualPolicy.configHash, parameterSetHash: lfpParameterSet.configHash,
    };
    expect(answersConfiguration(run().record, want)).toBe(true);
    expect(answersConfiguration(run({ status: 'failed' }).record, want)).toBe(false);
    expect(answersConfiguration(run().record, { ...want, plantHash: '1'.repeat(32) })).toBe(false);
    expect(answersConfiguration(run().record, { ...want, policyHash: '1'.repeat(32) })).toBe(false);
    expect(answersConfiguration(run().record, { ...want, parameterSetHash: '1'.repeat(32) })).toBe(false);
  });

  it('records a failure as a failure, never as an empty success', () => {
    const failed = run({ status: 'failed', failure: 'The limit iteration did not converge in 20 passes.', finishedAt: null });
    expect(failed.record.status).toBe('failed');
    expect(failed.record.failure).toMatch(/did not converge/);
    expect(simulationRunSchema.parse(failed.record).failure).toBeTruthy();
  });
});

describe('sealing a record the contract has not finished with', () => {
  /**
   * A schema fills in what a record left out. Sealing before that happens seals over contents the
   * parse is about to change, and the hash stops matching the moment the record is read back —
   * silently, because nothing complains until the read. The solver's `maxSubStepSeconds` default
   * found this on the day it was added.
   */
  it('puts the schema defaults inside the hash, not outside it', () => {
    const withoutDefault = {
      id: 'run-x', label: 'x', kind: 'SimulationRun' as const,
      scenarioHash: '0'.repeat(32), plantHash: '0'.repeat(32), policyHash: '0'.repeat(32), parameterSetHash: '0'.repeat(32),
      engine: 'e', engineVersion: '1', seed: null, signConvention: 'positive = discharging',
      status: 'complete' as const, startedAt: '2026-09-22T00:00:00.000Z', finishedAt: '2026-09-22T00:00:01.000Z', failure: null, badge: 'illustrative' as const,
      // Every solver field except the two that carry defaults.
      solver: { integrator: 'explicit-euler' as const, subSteps: 1, toleranceFraction: 0.001, maxIterations: 20 },
    };
    const sealedProperly = sealWith(simulationRunSchema, withoutDefault);
    expect(sealedProperly.solver.maxSubStepSeconds, 'the default was applied').toBe(10);
    expect(sealIntact(sealedProperly), 'and it is inside the hash').toBe(true);

    // The other order is what used to happen, and it does not survive a read.
    const sealedTooEarly = simulationRunSchema.parse(seal({ ...withoutDefault, schemaVersion: SIM_SCHEMA_VERSION }));
    expect(sealIntact(sealedTooEarly)).toBe(false);
  });
});
