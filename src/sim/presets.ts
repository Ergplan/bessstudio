import { sealWith, equipmentParameterSetSchema, plantConfigurationSchema, emsPolicySchema, scenarioSchema, type EquipmentParameterSet, type PlantConfiguration, type EmsPolicy, type Scenario } from './records';
import type { Provenance } from './provenance';

/**
 * The teaching plant.
 *
 * §15 asks for one consistent, clearly illustrative LFP preset behind the starter lessons, and is
 * explicit that it must never be implied to be a real Solarworld product specification. It is
 * shaped like the catalogue's 5 MWh enclosure — same cell, same pack, same topology, same
 * converter rating — because a learner who then opens the studio should recognise what they are
 * looking at. Everything that the catalogue does not state, and that a simulation needs, is an
 * illustrative teaching value and is labelled as one here rather than anywhere further downstream.
 *
 * The parameters the catalogue does not carry, and where each came from:
 *
 * | Parameter | Value | Basis |
 * | --- | --- | --- |
 * | Open-circuit voltage curve | 2.90–3.45 V | The characteristic LFP plateau: nearly flat from 20% to 90%, falling away sharply at each end. Illustrative shape, not a measured curve. |
 * | Series resistance | 0.45 mΩ at 25 °C | The order of magnitude for a 314 Ah prismatic LFP cell. Rises as the cell cools. |
 * | Coulombic efficiency | 99.5% | Charge returned against charge accepted, before any converter loss. |
 * | Thermal mass | 5.62 kg at 1 000 J/kg·K | Mass from the catalogue; specific heat typical of a prismatic cell. |
 * | Thermal resistance | 0.7 K/W per cell | To the coolant, for a cell on a liquid cold plate: about eight kelvin above it at the full continuous current, which is what a liquid loop is for. |
 *
 * None of these is a product specification and the badge says so.
 */

export const illustrative = (source: string, assumptions: string[] = []): Provenance => ({
  badge: 'illustrative',
  source,
  reviewedOn: null,
  applicability: {
    temperatureC: [0, 45],
    socFraction: [0.05, 1],
    cRate: [0, 1],
    notes: 'Established for the teaching preset only. Outside these conditions the result is reported as extrapolated.',
  },
  assumptions,
});

/**
 * The open-circuit voltage of one LFP cell against its state of charge.
 *
 * The shape matters more than any single point: an LFP cell sits within about 80 mV over the
 * middle four-fifths of its range, which is exactly why §12.4 asks the lessons to explain that
 * inferring state of charge from voltage alone is a limitation rather than a method.
 */
export const lfpOcvCurve = [
  // Zero charge is the discharge cutoff, by definition, and LFP falls off a cliff to reach it —
  // which is why the last two per cent of an LFP pack are worth so little and why a cell that
  // gets there drags a whole string down with it.
  { soc: 0.00, volts: 2.50 },
  { soc: 0.01, volts: 2.90 },
  { soc: 0.02, volts: 3.06 },
  { soc: 0.05, volts: 3.16 },
  { soc: 0.10, volts: 3.21 },
  { soc: 0.20, volts: 3.25 },
  { soc: 0.35, volts: 3.27 },
  { soc: 0.50, volts: 3.29 },
  { soc: 0.65, volts: 3.31 },
  { soc: 0.80, volts: 3.32 },
  { soc: 0.90, volts: 3.34 },
  { soc: 0.95, volts: 3.38 },
  { soc: 1.00, volts: 3.45 },
];

export const lfpParameterSet: EquipmentParameterSet = sealWith(equipmentParameterSetSchema, {
  id: 'params-lfp-314-illustrative',
  label: 'LFP 314 Ah prismatic — teaching parameters',
  kind: 'EquipmentParameterSet',
  cell: {
    chemistry: 'LFP',
    nominalV: 3.2,
    capacityAh: 314,
    minV: 2.5,
    maxV: 3.65,
    ocvCurve: lfpOcvCurve,
    resistanceOhm: 0.00045,
    resistanceTempCoeff: 0.022,
    referenceTempC: 25,
    coulombicEfficiency: 0.995,
    massKg: 5.62,
    specificHeatJPerKgK: 1000,
    thermalResistanceKPerW: 0.7,
    limits: {
      chargeCurrentMaxA: 157,
      dischargeCurrentMaxA: 157,
      chargeTempC: [0, 55],
      dischargeTempC: [-10, 55],
    },
  },
  provenance: illustrative(
    'Cell geometry, capacity, voltage window and current limits from the supplied product schedule; everything else is an illustrative teaching value.',
    [
      'The open-circuit voltage curve is the characteristic LFP shape, not a measured curve for this cell.',
      'Series resistance is a single value at 25 °C with a linear temperature coefficient; no state-of-charge dependence is modelled.',
      'One representative cell stands for the pack. Cell-to-cell spread is a separately injected scenario, not a modelled distribution.',
    ],
  ),
});

/**
 * One 5 MWh enclosure, with its converter.
 *
 * 104 cells in series make a pack; four packs in series make a string; twelve strings in parallel
 * fill the container. That is the catalogue's reference topology, and it is what the 3D studio
 * draws, so the numbers a learner sees here are the numbers they will see there.
 */
export const teachingPlant: PlantConfiguration = sealWith(plantConfigurationSchema, {
  id: 'plant-5mwh-teaching',
  label: '5 MWh liquid-cooled enclosure — teaching plant',
  kind: 'PlantConfiguration',
  cellTopology: { series: 104, parallel: 1 },
  packTopology: { series: 4, parallel: 12 },
  parameterSetId: lfpParameterSet.id,
  converter: {
    model: 'PCS 2507.5 kW',
    ratedW: 2_507_500,
    ratedVA: 2_750_000,
    dcMinV: 1000,
    dcMaxV: 1500,
    dcMaxA: 3000,
    chargeEfficiency: 0.985,
    dischargeEfficiency: 0.985,
    standbyW: 1_200,
    rampWPerSecond: 1_253_750,
    deratingStartC: 45,
    deratingPerC: 0.02,
    provenance: illustrative(
      'Rating, DC window and current limit from the supplied converter schedule; efficiency, standby, ramp and derating are illustrative teaching values.',
      ['One efficiency figure in each direction, not a load-dependent efficiency map.'],
    ),
  },
  gridImportLimitW: 3_000_000,
  gridExportLimitW: 3_000_000,
  auxiliaryW: 20_800,
  coolingCapacityW: 60_000,
  coolingInputW: 20_000,
  ambientC: 30,
  islandCapable: false,
});

/**
 * The manual policy: the learner asks, and the policy relays the request downwards without
 * altering it. Lesson 1 exists to show what happens between the request and the response, so the
 * policy above it has to be transparent enough to be ruled out as the cause.
 */
export const manualPolicy: EmsPolicy = sealWith(emsPolicySchema, {
  id: 'policy-manual',
  label: 'Manual request',
  kind: 'EMSPolicy',
  policy: 'manual',
  policyVersion: 'manual-1',
  reserveSoc: 0.1,
  emergencyReserveSoc: 0.05,
  setpointCadenceSeconds: 60,
  peakTargetW: null,
  priceWindows: [],
});

/**
 * Every preset, so a test can walk them rather than trusting a list written by hand.
 *
 * Declared at the bottom of the file, after the supervisory presets, because a list that is missing
 * half of what it claims to cover is worse than no list: every check written against it passes.
 */
export const presets = {
  get parameterSets() { return [lfpParameterSet]; },
  get plants() { return [teachingPlant, backupPlant]; },
  get policies() { return [manualPolicy, ...supervisoryPolicies]; },
  get scenarios() { return [...conditions, dayScenario, outageScenario, telemetryLossScenario]; },
};

/* ------------------------------------------------ the conditions presets -- */

/**
 * Three conditions the same plant can be in.
 *
 * §17.2 asks S4 for weak-cell and temperature fixtures, and §15 asks lesson 6 for a normal, a hot
 * and a weak-cell preset to compare. They are the same object: one plant, one duty, and one thing
 * different about it — which is the only way a comparison means anything.
 *
 * Each is an injected condition rather than an emergent one. §12.4 is explicit that educational
 * fault injection is a simulated input, and putting it on the scenario is what makes that visible
 * to the reader rather than buried in a model that does not have the physics for it.
 */
const condition = (over: Partial<Scenario>): Scenario => sealWith(scenarioSchema, {
  id: 'condition', label: 'Condition', kind: 'Scenario',
  plantId: teachingPlant.id, policyId: manualPolicy.id,
  initialSoc: 0.8, initialCellTempC: 25, ambientC: null,
  durationSeconds: 7200, stepSeconds: 60,
  siteLoad: null, generation: null, price: null, outage: null, controls: [],
  injected: { weakCell: null, coolingFailsAtSeconds: null, communicationLostAtSeconds: null, telemetryLostAtSeconds: null },
  reactiveVar: 0,
  ...over,
});

/** Nothing wrong with it. The baseline every other condition is compared against. */
export const normalCondition = condition({ id: 'condition-normal', label: 'Nothing wrong with it' });

/**
 * A hot day and a plant that starts warm. The cells are already inside the derating band before
 * anything is asked of them, so the first thing a learner sees is power they cannot have.
 */
export const hotCondition = condition({
  id: 'condition-hot', label: 'A hot day',
  ambientC: 45, initialCellTempC: 45,
});

/**
 * One cell with four fifths of the capacity, three times the resistance, ten points of charge
 * behind the rest and five degrees warmer.
 *
 * Deliberately a spread placed rather than a distribution claimed. It is the smallest arrangement
 * that makes §12.4's point: the pack's average is comfortable and the pack stops anyway.
 */
export const weakCellCondition = condition({
  id: 'condition-weak-cell', label: 'One weak cell',
  injected: {
    weakCell: { capacityFraction: 0.8, resistanceMultiple: 3, socOffset: -0.1, tempOffsetC: 5 },
    coolingFailsAtSeconds: null, communicationLostAtSeconds: null, telemetryLostAtSeconds: null },
});

/** The coolant stops moving an hour in. §12.5: the temperature rise and the derating, nothing else. */
/**
 * The coolant stops moving half an hour in. §12.5: the temperature rise and the derating response,
 * and nothing else — no propagation is modelled and none is claimed.
 *
 * Four hours rather than two, and starting full, because a five-megawatt-hour pack has a thermal
 * time constant measured in hours. A scenario that took a cell from warm to tripped inside a
 * lesson-length run would be showing something that does not happen. Part of what this teaches is
 * that nothing here is quick — including the fact that once the loop has stopped, the heat does
 * not leave after the plant does.
 */
export const coolingFailureCondition = condition({
  id: 'condition-cooling-failure', label: 'The cooling stops',
  initialSoc: 1, initialCellTempC: 40,
  durationSeconds: 14_400, stepSeconds: 120,
  injected: { weakCell: null, coolingFailsAtSeconds: 1800, communicationLostAtSeconds: null, telemetryLostAtSeconds: null },
});

/** The plant stops hearing from the management system half an hour in. */
export const communicationLossCondition = condition({
  id: 'condition-communication-loss', label: 'The management system goes quiet',
  injected: { weakCell: null, coolingFailsAtSeconds: null, communicationLostAtSeconds: 1800, telemetryLostAtSeconds: null },
});

export const conditions = [normalCondition, hotCondition, weakCellCondition, coolingFailureCondition, communicationLossCondition];

/* ------------------------------------------------ the supervisory presets -- */

/**
 * One day, at five-minute resolution.
 *
 * Every policy below §11.3 decides on telemetry, so there has to be telemetry for them to decide
 * on. This is one illustrative commercial-industrial day: a base load that never goes away, a
 * morning shoulder, an evening peak after the sun has gone, and a solar array that produces its
 * most at exactly the wrong time of day for the peak. That mismatch is the whole subject of
 * lessons 2 and 3, and it is why the day is shaped this way rather than smoothly.
 *
 * Illustrative, and labelled so. No site was measured to produce it.
 */
export const DAY_SECONDS = 86_400;
export const DAY_STEP_SECONDS = 300;
const DAY_STEPS = DAY_SECONDS / DAY_STEP_SECONDS;

const sampled = (f: (hour: number) => number) =>
  Array.from({ length: DAY_STEPS }, (_, i) => f((i * DAY_STEP_SECONDS) / 3600));

/** A base load, a working day on top of it, and an evening peak after the sun has gone. */
export const siteLoadProfile = {
  name: 'Illustrative commercial and industrial day',
  unit: 'W' as const,
  samples: sampled(h => {
    const base = 700_000;
    const working = h >= 8 && h < 18 ? 900_000 : 0;
    const evening = h >= 17 && h < 22 ? 1_000_000 * Math.sin(((h - 17) / 5) * Math.PI) : 0;
    return Math.round(base + working + evening);
  }),
};

/** A 2 MW array, producing between six and eighteen hundred, most of it in the middle. */
export const solarProfile = {
  name: 'Illustrative 2 MW rooftop array, clear day',
  unit: 'W' as const,
  samples: sampled(h => (h >= 6 && h < 18 ? Math.round(2_000_000 * Math.sin(((h - 6) / 12) * Math.PI) ** 2) : 0)),
};

/** Three prices, in rupees per megawatt-hour. Illustrative: no tariff was quoted to produce them. */
export const priceProfile = {
  name: 'Illustrative three-part tariff',
  unit: 'currency/MWh' as const,
  samples: sampled(h => (h < 6 ? 3_000 : h >= 18 && h < 22 ? 12_000 : 7_000)),
};

/**
 * The same 5 MWh enclosure, with the transfer equipment that lets it form an island.
 *
 * Kept as a separate plant rather than a flag on the teaching one, because it is a different
 * product: islanding needs a transfer switch and a grid-forming converter, and §15 lesson 4's
 * "supported topology" means exactly that a plant without them cannot do this.
 */
export const backupPlant: PlantConfiguration = sealWith(plantConfigurationSchema, {
  ...teachingPlant,
  id: 'plant-5mwh-backup',
  label: '5 MWh enclosure with island transfer — backup plant',
  islandCapable: true,
});

const policy = (over: Partial<EmsPolicy> & Pick<EmsPolicy, 'id' | 'label' | 'policy' | 'policyVersion'>): EmsPolicy =>
  sealWith(emsPolicySchema, {
    kind: 'EMSPolicy', reserveSoc: 0.1, emergencyReserveSoc: 0.05, setpointCadenceSeconds: 300,
    peakTargetW: null, priceWindows: [], telemetryTimeoutSeconds: 900, staleFallback: 'stop', ...over,
  });

/** Hold the site's import below 1.5 MW, and refill only in the room left under it. */
export const peakShavingPolicy = policy({
  id: 'policy-peak-shaving', label: 'Hold the import below the target', policy: 'peak-shaving',
  policyVersion: 'peak-shaving-1', peakTargetW: 1_500_000,
});

/** Store what the array would otherwise export, and spend it on the site. */
export const selfConsumptionPolicy = policy({
  id: 'policy-self-consumption', label: 'Use the generation on site', policy: 'self-consumption',
  policyVersion: 'self-consumption-1',
});

/**
 * Keep half the battery for an outage.
 *
 * A high reserve and a low emergency floor, because that difference is the lesson: what is
 * protected under normal economics is exactly what an outage is allowed to spend.
 */
export const backupReservePolicy = policy({
  id: 'policy-backup-reserve', label: 'Keep the backup ready', policy: 'backup-reserve',
  policyVersion: 'backup-reserve-1', reserveSoc: 0.5, emergencyReserveSoc: 0.1,
});

/** Charge in the cheap window, discharge in the dear one. Prices illustrative. */
export const priceSchedulePolicy = policy({
  id: 'policy-price-schedule', label: 'Follow the tariff', policy: 'price-schedule',
  policyVersion: 'price-schedule-1',
  priceWindows: [
    { fromHour: 0, toHour: 6, pricePerMWh: 3_000, action: 'charge', powerFraction: 1 },
    { fromHour: 6, toHour: 18, pricePerMWh: 7_000, action: 'hold', powerFraction: 1 },
    { fromHour: 18, toHour: 22, pricePerMWh: 12_000, action: 'discharge', powerFraction: 1 },
  ],
});

/**
 * The baseline for §11.4's comparison: a clock, and nothing else.
 *
 * It charges overnight and discharges in the evening whatever the site is actually doing, which is
 * how a great many plants are still run. It keeps every PCS limit and every BMS protection — §11.4
 * forbids a baseline that disables safety or invents irrational dispatch to flatter the comparison.
 */
export const fixedSchedulePolicy = policy({
  id: 'policy-fixed-schedule', label: 'Fixed schedule', policy: 'price-schedule',
  policyVersion: 'fixed-schedule-1',
  priceWindows: [
    { fromHour: 1, toHour: 5, pricePerMWh: 3_000, action: 'charge', powerFraction: 1 },
    { fromHour: 18, toHour: 21, pricePerMWh: 12_000, action: 'discharge', powerFraction: 1 },
  ],
});

/** One illustrative day, with the site, the array and the tariff on it. */
export const dayScenario: Scenario = sealWith(scenarioSchema, {
  id: 'scenario-illustrative-day', label: 'One illustrative day', kind: 'Scenario',
  plantId: teachingPlant.id, policyId: peakShavingPolicy.id,
  initialSoc: 0.5, initialCellTempC: 25, ambientC: null,
  durationSeconds: DAY_SECONDS, stepSeconds: DAY_STEP_SECONDS,
  siteLoad: siteLoadProfile, generation: solarProfile, price: priceProfile,
  outage: null, injected: { weakCell: null, coolingFailsAtSeconds: null, communicationLostAtSeconds: null, telemetryLostAtSeconds: null },
  reactiveVar: 0, controls: [],
});

/** The same day with the grid gone from six in the evening until nine. */
export const outageScenario: Scenario = sealWith(scenarioSchema, {
  ...dayScenario,
  id: 'scenario-evening-outage', label: 'The grid goes at six',
  plantId: backupPlant.id, policyId: backupReservePolicy.id,
  outage: { fromSeconds: 18 * 3600, toSeconds: 21 * 3600 },
});

/** The same day with the site telemetry lost at noon, so the fallback can be seen. */
export const telemetryLossScenario: Scenario = sealWith(scenarioSchema, {
  ...dayScenario,
  id: 'scenario-telemetry-loss', label: 'The site meter goes quiet at noon',
  injected: { weakCell: null, coolingFailsAtSeconds: null, communicationLostAtSeconds: null, telemetryLostAtSeconds: 12 * 3600 },
});

export const supervisoryPolicies = [
  peakShavingPolicy, selfConsumptionPolicy, backupReservePolicy, priceSchedulePolicy, fixedSchedulePolicy,
];
