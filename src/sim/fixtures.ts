import { sealWith, equipmentParameterSetSchema, plantConfigurationSchema, emsPolicySchema, scenarioSchema, type EquipmentParameterSet, type PlantConfiguration, type EmsPolicy, type Scenario } from './records';
import type { Provenance } from './provenance';

/**
 * The plants the acceptance fixtures run on.
 *
 * §18 defines each fixture as a deliberately simple case with an answer that can be derived by
 * hand, and §17.1 requires those expected values to come from the equations rather than from the
 * function under test. These plants exist to make that possible: round numbers, flat curves, and
 * one property under examination at a time.
 *
 * They are fixtures, not products. Nothing here is a teaching preset and nothing is offered to a
 * learner; the badge is illustrative and the source says what they are for.
 */

const fixtureProvenance = (what: string): Provenance => ({
  badge: 'illustrative',
  source: `Acceptance fixture: ${what}. Not a product specification and not offered to a learner.`,
  reviewedOn: null,
  applicability: { temperatureC: [-40, 80], socFraction: [0, 1], cRate: [0, 10], notes: 'A fixture, exact by construction.' },
  assumptions: ['Every parameter is chosen to make one property checkable by hand.'],
});

/**
 * F01's battery: one hundred kilowatt-hours at a constant 3.2 V.
 *
 * A hundred cells of 312.5 Ah in series is 100 kWh exactly, so half charge is 50 kWh and a
 * 10 kWh withdrawal is exactly ten percentage points. Nothing about that is physical; it is
 * arithmetic chosen so the fixture has an exact answer.
 */
export const flatCellParameters: EquipmentParameterSet = sealWith(equipmentParameterSetSchema, {
  id: 'fixture-flat-cell',
  label: 'Fixture — constant-voltage cell',
  kind: 'EquipmentParameterSet',
  cell: {
    chemistry: 'LFP', nominalV: 3.2, capacityAh: 312.5, minV: 2.5, maxV: 3.65,
    ocvCurve: [{ soc: 0, volts: 3.2 }, { soc: 1, volts: 3.2 }],
    resistanceOhm: 1e-9, resistanceTempCoeff: 0, referenceTempC: 25,
    coulombicEfficiency: 1, massKg: 1, specificHeatJPerKgK: 1000, thermalResistanceKPerW: 100,
    limits: { chargeCurrentMaxA: 1000, dischargeCurrentMaxA: 1000, chargeTempC: [-40, 80], dischargeTempC: [-40, 80] },
  },
  provenance: fixtureProvenance('a constant-voltage store with no losses'),
});

/** The fixture plant: 100 kWh behind a 100 kW converter, with nothing else going on. */
export const fixturePlant = (over: Partial<PlantConfiguration['converter']> = {}): PlantConfiguration => sealWith(plantConfigurationSchema, {
  id: 'fixture-plant',
  label: 'Fixture — 100 kWh behind 100 kW',
  kind: 'PlantConfiguration',
  cellTopology: { series: 100, parallel: 1 },
  packTopology: { series: 1, parallel: 1 },
  parameterSetId: flatCellParameters.id,
  converter: {
    model: 'Fixture converter', ratedW: 100_000, ratedVA: 100_000,
    dcMinV: 200, dcMaxV: 400, dcMaxA: 600,
    chargeEfficiency: 1, dischargeEfficiency: 1, standbyW: 0,
    rampWPerSecond: 1e9, deratingStartC: 1000, deratingPerC: 0,
    provenance: fixtureProvenance('a converter with exactly the efficiency stated'),
    ...over,
  },
  gridImportLimitW: 1_000_000, gridExportLimitW: 1_000_000,
  auxiliaryW: 0, coolingCapacityW: 0, coolingInputW: 0, ambientC: 25, islandCapable: false,
});

/**
 * F03's converter: a hundred kVA with nothing else in the way.
 *
 * The DC current limit is set far above anything the fixture asks for, so the capability circle is
 * the only thing binding — which is the first half of the fixture. The second half tightens the
 * current limit and checks that it takes precedence, because §12.3 is explicit that the circle
 * alone is insufficient.
 */
export const headroomConverter = (over: Partial<PlantConfiguration['converter']> = {}): PlantConfiguration['converter'] => ({
  model: 'Fixture converter — 100 kVA', ratedW: 100_000, ratedVA: 100_000,
  dcMinV: 200, dcMaxV: 400, dcMaxA: 2000,
  chargeEfficiency: 1, dischargeEfficiency: 1, standbyW: 0,
  rampWPerSecond: 1e9, deratingStartC: 1000, deratingPerC: 0,
  provenance: fixtureProvenance('a converter bounded only by its apparent power rating'),
  ...over,
});

export const fixturePolicy: EmsPolicy = sealWith(emsPolicySchema, {
  id: 'fixture-policy', label: 'Fixture — relay the request', kind: 'EMSPolicy',
  policy: 'manual', policyVersion: 'fixture-1',
  reserveSoc: 0, emergencyReserveSoc: 0, setpointCadenceSeconds: 1,
  peakTargetW: null, priceWindows: [],
});

/** A scenario of a given length at a given step, with nothing in it but the initial state. */
export const fixtureScenario = (over: Partial<Scenario> = {}): Scenario => sealWith(scenarioSchema, {
  id: 'fixture-scenario', label: 'Fixture scenario', kind: 'Scenario',
  plantId: 'fixture-plant', policyId: fixturePolicy.id,
  initialSoc: 0.5, initialCellTempC: 25,
  durationSeconds: 1800, stepSeconds: 60,
  siteLoad: null, generation: null, price: null, outage: null, controls: [],
  ...over,
});
