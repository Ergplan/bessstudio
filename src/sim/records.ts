import { z } from 'zod';
import { provenanceSchema } from './provenance';
import { configHash } from './hash';
import { signConvention } from './signs';

/**
 * The record contracts.
 *
 * §13.2 names ten records and the things each one must carry: units, sign conventions, chemistry,
 * data source, applicability range, provenance status, model and library versions, solver
 * settings, a random seed where one applies, and a configuration hash.
 *
 * Two decisions run through all of them.
 *
 * **Units are named in the field, not in a comment.** Every numeric field carries its unit in its
 * own name — `nominalV`, `capacityAh`, `ratedW`, `stepSeconds` — and every field is stored in the
 * canonical unit from `units.ts`. A record read back from storage therefore cannot be
 * misinterpreted by code that never saw the schema.
 *
 * **Every record is versioned and hashed.** `schemaVersion` says which shape it was written in, so
 * a record from an earlier version can be migrated rather than mis-parsed; `configHash` says which
 * configuration it represents, and changes when and only when something material changes.
 */

/** Bumped whenever a schema in this file changes shape in a way that is not backward compatible. */
export const SIM_SCHEMA_VERSION = 1;

/** The engine's own version, recorded on every run so a result can be tied to what produced it. */
export const ENGINE_VERSION = '0.1.0';

const id = () => z.string().min(1).max(120);
const isoDate = () => z.string().min(4).max(40);

/** Every record shares these. */
const base = {
  id: id(),
  label: z.string().min(1).max(160),
  schemaVersion: z.number().int().positive(),
};

/* ------------------------------------------------ equipment parameters ---- */

export const chemistries = ['LFP', 'NMC', 'LTO', 'Na-ion', 'VRLA'] as const;
export type Chemistry = (typeof chemistries)[number];

/**
 * A cell, electrically and thermally, at the fidelity §13 sanctions: an open-circuit voltage curve
 * against state of charge plus a series resistance — a first-order Thevenin equivalent circuit.
 * Anything beyond that is a `GAP` and is not manufactured here.
 */
export const cellParametersSchema = z.object({
  chemistry: z.enum(chemistries),
  nominalV: z.number().positive().max(100),
  capacityAh: z.number().positive().max(100_000),
  minV: z.number().positive().max(100),
  maxV: z.number().positive().max(100),
  /** Open-circuit voltage against state of charge, ascending in SOC. At least two points. */
  ocvCurve: z.array(z.object({ soc: z.number().min(0).max(1), volts: z.number().positive() })).min(2),
  /** Series resistance of one cell at the reference temperature. */
  resistanceOhm: z.number().positive().max(10),
  /** How resistance grows as the cell cools, as a multiplier per degree below the reference. */
  resistanceTempCoeff: z.number().min(0).max(1).default(0.02),
  referenceTempC: z.number().min(-40).max(80).default(25),
  /** Charge accepted against charge returned, over a full cycle, before any converter loss. */
  coulombicEfficiency: z.number().min(0.5).max(1),
  /** Thermal mass of one cell and how readily it sheds heat to its surroundings. */
  massKg: z.number().positive().max(1000),
  specificHeatJPerKgK: z.number().positive().max(5000),
  thermalResistanceKPerW: z.number().positive().max(100),
  limits: z.object({
    chargeCurrentMaxA: z.number().positive().max(100_000),
    dischargeCurrentMaxA: z.number().positive().max(100_000),
    chargeTempC: z.tuple([z.number(), z.number()]),
    dischargeTempC: z.tuple([z.number(), z.number()]),
  }).strict(),
}).strict().superRefine((c, ctx) => {
  if (c.minV >= c.maxV) ctx.addIssue({ code: 'custom', path: ['minV'], message: 'Minimum cell voltage must be below the maximum.' });
  if (c.nominalV < c.minV || c.nominalV > c.maxV) ctx.addIssue({ code: 'custom', path: ['nominalV'], message: 'Nominal voltage must lie inside the operating window.' });
  const socs = c.ocvCurve.map(p => p.soc);
  if (socs.some((s, i) => i > 0 && s <= socs[i - 1])) ctx.addIssue({ code: 'custom', path: ['ocvCurve'], message: 'The open-circuit voltage curve must ascend in state of charge.' });
  if (c.ocvCurve.some(p => p.volts < c.minV * 0.9 || p.volts > c.maxV * 1.1)) {
    ctx.addIssue({ code: 'custom', path: ['ocvCurve'], message: 'The open-circuit voltage curve leaves the cell voltage window.' });
  }
});
export type CellParameters = z.infer<typeof cellParametersSchema>;

export const equipmentParameterSetSchema = z.object({
  ...base,
  kind: z.literal('EquipmentParameterSet'),
  cell: cellParametersSchema,
  provenance: provenanceSchema,
  configHash: z.string().length(32),
}).strict();
export type EquipmentParameterSet = z.infer<typeof equipmentParameterSetSchema>;

/* ---------------------------------------------------- plant configuration -- */

/**
 * The converter, averaged. §12.3 requires the capability circle **and** the voltage and current
 * limits, because a real converter is usually bounded tighter by current at low DC voltage.
 */
export const converterSchema = z.object({
  model: z.string().min(1).max(120),
  ratedW: z.number().positive(),
  ratedVA: z.number().positive(),
  dcMinV: z.number().positive(),
  dcMaxV: z.number().positive(),
  dcMaxA: z.number().positive(),
  /** Conversion efficiency in each direction, at rated power. */
  chargeEfficiency: z.number().min(0.5).max(1),
  dischargeEfficiency: z.number().min(0.5).max(1),
  /** Consumption when the converter is energised but not dispatching. */
  standbyW: z.number().min(0),
  /** How fast the converter may change its output. */
  rampWPerSecond: z.number().positive(),
  /** Output derates above this temperature, by this fraction of rating per degree. */
  deratingStartC: z.number(),
  deratingPerC: z.number().min(0).max(1),
  provenance: provenanceSchema,
}).strict().superRefine((c, ctx) => {
  if (c.dcMinV >= c.dcMaxV) ctx.addIssue({ code: 'custom', path: ['dcMinV'], message: 'The DC window minimum must be below its maximum.' });
  if (c.ratedVA < c.ratedW) ctx.addIssue({ code: 'custom', path: ['ratedVA'], message: 'Apparent power rating cannot be below the active power rating.' });
  // A converter that cannot reach its own rating at the bottom of its own window is mis-specified,
  // and the catalogue audit found one that was.
  const neededA = c.ratedW / (c.dcMinV * c.dischargeEfficiency);
  if (neededA > c.dcMaxA * 1.001) {
    ctx.addIssue({ code: 'custom', path: ['dcMaxA'], message: `Reaching ${Math.round(c.ratedW / 1e3)} kW at ${c.dcMinV} V needs ${Math.round(neededA)} A, above the stated ${c.dcMaxA} A limit.` });
  }
});
export type Converter = z.infer<typeof converterSchema>;

export const plantConfigurationSchema = z.object({
  ...base,
  kind: z.literal('PlantConfiguration'),
  /** Cells in series and in parallel within one pack, and packs in series and parallel above it. */
  cellTopology: z.object({ series: z.number().int().positive(), parallel: z.number().int().positive() }).strict(),
  packTopology: z.object({ series: z.number().int().positive(), parallel: z.number().int().positive() }).strict(),
  parameterSetId: id(),
  converter: converterSchema,
  /** What the site may draw from the grid, and push back into it. */
  gridImportLimitW: z.number().positive(),
  gridExportLimitW: z.number().min(0),
  /** Auxiliary load that runs whenever the plant is energised. */
  auxiliaryW: z.number().min(0),
  /** Heat the cooling system can remove, and what it costs to run at full output. */
  coolingCapacityW: z.number().min(0),
  coolingInputW: z.number().min(0),
  ambientC: z.number().min(-40).max(70),
  /** Whether the converter and transfer equipment support running an island. §15 lesson 4. */
  islandCapable: z.boolean().default(false),
  configHash: z.string().length(32),
}).strict();
export type PlantConfiguration = z.infer<typeof plantConfigurationSchema>;

/* ------------------------------------------------------------ EMS policy --- */

export const emsPolicyKinds = ['manual', 'peak-shaving', 'self-consumption', 'price-schedule', 'backup-reserve'] as const;
export type EmsPolicyKind = (typeof emsPolicyKinds)[number];

export const emsPolicySchema = z.object({
  ...base,
  kind: z.literal('EMSPolicy'),
  policy: z.enum(emsPolicyKinds),
  /** Version of the policy's own rules, recorded in every decision so an explanation can be traced. */
  policyVersion: z.string().min(1).max(40),
  /** State of charge the policy will not go below under normal economics. §15 lesson 4. */
  reserveSoc: z.number().min(0).max(1),
  /** The floor an explicitly declared outage may use instead. Never lower than the cell's own limit. */
  emergencyReserveSoc: z.number().min(0).max(1),
  /** How often the policy is allowed to issue a new setpoint. */
  setpointCadenceSeconds: z.number().positive(),
  /** Site import the policy tries to stay below, where the policy is peak shaving. */
  peakTargetW: z.number().min(0).nullable(),
  /** Price windows, where the policy follows a schedule. Hour of day, half-open. */
  priceWindows: z.array(z.object({
    fromHour: z.number().min(0).max(24), toHour: z.number().min(0).max(24),
    pricePerMWh: z.number(), action: z.enum(['charge', 'discharge', 'hold']),
  })).default([]),
  configHash: z.string().length(32),
}).strict().superRefine((p, ctx) => {
  if (p.emergencyReserveSoc > p.reserveSoc) {
    ctx.addIssue({ code: 'custom', path: ['emergencyReserveSoc'], message: 'The emergency floor cannot sit above the normal reserve it is there to go below.' });
  }
  if (p.policy === 'peak-shaving' && p.peakTargetW === null) {
    ctx.addIssue({ code: 'custom', path: ['peakTargetW'], message: 'A peak-shaving policy needs a target to shave to.' });
  }
  if (p.policy === 'price-schedule' && p.priceWindows.length === 0) {
    ctx.addIssue({ code: 'custom', path: ['priceWindows'], message: 'A price-schedule policy needs at least one window.' });
  }
  for (const [i, w] of p.priceWindows.entries()) {
    if (w.fromHour >= w.toHour) ctx.addIssue({ code: 'custom', path: ['priceWindows', i], message: 'A price window must end after it starts.' });
  }
});
export type EmsPolicy = z.infer<typeof emsPolicySchema>;

/* -------------------------------------------------------------- scenario --- */

/** A profile sampled at the scenario's own timestep: site load, generation, or price. */
export const profileSchema = z.object({
  name: z.string().min(1).max(80),
  unit: z.enum(['W', 'currency/MWh']),
  /** One value per step, in the unit named. */
  samples: z.array(z.number()).min(1),
}).strict();
export type Profile = z.infer<typeof profileSchema>;

export const scenarioSchema = z.object({
  ...base,
  kind: z.literal('Scenario'),
  plantId: id(),
  policyId: id(),
  /** Where the plant starts. */
  initialSoc: z.number().min(0).max(1),
  initialCellTempC: z.number().min(-40).max(80),
  /**
   * The ambient the scenario runs in, where it differs from the plant's own design ambient.
   *
   * §12.1 and §12.2 both list ambient conditions as an input to the run rather than a property of
   * the equipment, and they are right: the same plant on a hot day is the same plant. Null means
   * the plant's design ambient stands.
   */
  ambientC: z.number().min(-40).max(70).nullable().default(null),
  /** How long the scenario runs, and how finely. */
  durationSeconds: z.number().positive(),
  stepSeconds: z.number().positive(),
  /** Profiles by role. A missing profile is an absence, never a silent zero. */
  siteLoad: profileSchema.nullable(),
  generation: profileSchema.nullable(),
  price: profileSchema.nullable(),
  /** A declared grid outage, as a half-open window in seconds from the start. §15 lesson 4. */
  outage: z.object({ fromSeconds: z.number().min(0), toSeconds: z.number().min(0) }).strict().nullable(),
  /**
   * Conditions injected into the scenario.
   *
   * §12.4 is explicit that educational fault injection is **a simulated input**, not a claim to
   * model every fault mechanism. So these live on the scenario, where a reader can see that they
   * were asked for, rather than emerging from a model that does not have the physics for them.
   */
  injected: z.object({
    /**
     * One cell weaker than the rest: less capacity, more resistance, starting lower, running
     * warmer. A spread deliberately placed, not a distribution claimed.
     */
    weakCell: z.object({
      capacityFraction: z.number().min(0.1).max(1),
      resistanceMultiple: z.number().min(1).max(20),
      socOffset: z.number().min(-0.5).max(0.5),
      tempOffsetC: z.number().min(-20).max(40),
    }).strict().nullable().default(null),
    /**
     * The coolant stops moving at this second. §12.5: what follows is the modelled temperature
     * rise and the derating response to it, and nothing about propagation.
     */
    coolingFailsAtSeconds: z.number().min(0).nullable().default(null),
    /** The plant stops hearing from the battery management system at this second. */
    communicationLostAtSeconds: z.number().min(0).nullable().default(null),
  }).strict().default({ weakCell: null, coolingFailsAtSeconds: null, communicationLostAtSeconds: null }),
  /**
   * Reactive power commanded at the connection, in vars, positive when the plant supplies them.
   * It takes its share of the converter's apparent power before any active power is available.
   */
  reactiveVar: z.number().default(0),
  /** What the learner is allowed to change. §15.1 caps this at three. */
  controls: z.array(z.string()).max(3).default([]),
  configHash: z.string().length(32),
}).strict().superRefine((s, ctx) => {
  if (s.stepSeconds > s.durationSeconds) {
    ctx.addIssue({ code: 'custom', path: ['stepSeconds'], message: 'The timestep cannot be longer than the scenario.' });
  }
  const steps = Math.round(s.durationSeconds / s.stepSeconds);
  for (const [key, p] of [['siteLoad', s.siteLoad], ['generation', s.generation], ['price', s.price]] as const) {
    if (p && p.samples.length !== steps) {
      ctx.addIssue({ code: 'custom', path: [key], message: `${p.name} has ${p.samples.length} samples for ${steps} steps.` });
    }
  }
  if (s.outage && s.outage.fromSeconds >= s.outage.toSeconds) {
    ctx.addIssue({ code: 'custom', path: ['outage'], message: 'An outage must end after it starts.' });
  }
  if (s.outage && s.outage.toSeconds > s.durationSeconds) {
    ctx.addIssue({ code: 'custom', path: ['outage'], message: 'The outage runs past the end of the scenario.' });
  }
});
export type Scenario = z.infer<typeof scenarioSchema>;

/* ------------------------------------------------------ learning template -- */

export const learningTemplateSchema = z.object({
  ...base,
  kind: z.literal('LearningTemplate'),
  /** The one question the card puts to the learner. §15. */
  question: z.string().min(1).max(200),
  objective: z.string().min(1).max(400),
  /** What should be observed if the model is behaving. Falsifiable, per §15.2. */
  expectedOutcomes: z.array(z.string().min(1)).min(1),
  scenarioId: id(),
  /** Minutes the card claims it takes to explore. §15 asks for 2–5. */
  estimatedMinutes: z.number().int().min(1).max(30),
  /** At most four headline metrics and two charts. §15.1. */
  metrics: z.array(z.string()).max(4),
  charts: z.array(z.string()).max(2),
  configHash: z.string().length(32),
}).strict();
export type LearningTemplate = z.infer<typeof learningTemplateSchema>;

/* ------------------------------------------------------------------ run ---- */

export const runStatuses = ['pending', 'running', 'complete', 'failed', 'cancelled'] as const;
export type RunStatus = (typeof runStatuses)[number];

/**
 * A run, once written, is a fact about the past.
 *
 * §17.2 requires immutable run snapshots, so the record carries everything needed to say what
 * produced it — the engine and its version, the solver settings, the seed, and the hash of the
 * configuration it ran. Nothing here refers to a mutable record by id alone.
 */
export const solverSettingsSchema = z.object({
  /** How the state is advanced. Only the explicit scheme exists today; the field names the choice. */
  integrator: z.enum(['explicit-euler', 'heun']),
  /** How many sub-steps each scenario step is divided into. */
  subSteps: z.number().int().min(1).max(1000),
  /** Convergence tolerance for the inner limit iteration, as a fraction of rated power. */
  toleranceFraction: z.number().positive().max(0.1),
  maxIterations: z.number().int().min(1).max(1000),
  /**
   * The longest a single integration piece may be, whatever the reporting step is.
   *
   * These are two different concerns and conflating them is a mistake with a visible cost: a
   * learner who asks for a sample every ten minutes instead of every minute is asking for a
   * coarser *chart*, not a coarser *model*, and an engine that integrates in a fixed number of
   * pieces per step quietly gives them the second. The reporting step sets how often the result is
   * written down; this sets how finely the state is advanced underneath it.
   */
  maxSubStepSeconds: z.number().positive().max(3600).default(10),
  /**
   * The fixture mode §14.1 asks for: "analytic idealised SOC and energy with losses disabled".
   *
   * With this set, internal resistance, conversion loss, coulombic loss and auxiliary consumption
   * are all zero, and the cell holds a constant voltage. It exists so the analytic fixtures have
   * something exact to compare against, and it is recorded on the run so a result computed this
   * way can never be mistaken for one that was not.
   */
  idealised: z.boolean().default(false),
}).strict();
export type SolverSettings = z.infer<typeof solverSettingsSchema>;

export const simulationRunSchema = z.object({
  ...base,
  kind: z.literal('SimulationRun'),
  scenarioHash: z.string().length(32),
  plantHash: z.string().length(32),
  policyHash: z.string().length(32),
  parameterSetHash: z.string().length(32),
  engine: z.string().min(1).max(60),
  engineVersion: z.string().min(1).max(40),
  solver: solverSettingsSchema,
  /** Present where the model uses one; null where it is deterministic, stated rather than absent. */
  seed: z.number().int().nullable(),
  signConvention: z.string().min(1),
  status: z.enum(runStatuses),
  startedAt: isoDate(),
  finishedAt: isoDate().nullable(),
  /** Why a run failed, in the words shown to the reader. §14: never a fabricated success. */
  failure: z.string().nullable(),
  /** The strongest claim this run's parameters allow. */
  badge: z.enum(['illustrative', 'published-source', 'validated-against-equipment']),
  configHash: z.string().length(32),
}).strict();
export type SimulationRun = z.infer<typeof simulationRunSchema>;

/* --------------------------------------------------------- time series ---- */

/**
 * The result, as parallel arrays with their units in their names.
 *
 * Arrays rather than an array of objects because a day at one-minute steps is 1,440 points across
 * twenty channels, and the shape that costs least to store and plot is the one that keeps each
 * channel contiguous.
 */
export const timeSeriesResultSchema = z.object({
  ...base,
  kind: z.literal('TimeSeriesResult'),
  runId: id(),
  stepSeconds: z.number().positive(),
  /**
   * Seconds from the start of the scenario, one per sample.
   *
   * **The convention, because a series is unreadable without one.** Sample `i` describes the
   * interval that *begins* at `timeSeconds[i]`. The state channels — charge level, voltages,
   * current, temperature — are the values at the start of that interval; the power channels are
   * the averages across it. A final sample closes the series: it carries the state the run ended
   * in and zero power, so summing power × step over every sample gives the energy exactly once.
   *
   * Without this the first sample is a step late, and a chart of a run that begins at half charge
   * begins somewhere else.
   */
  timeSeconds: z.array(z.number()),
  /** Signed, per the application convention: positive is discharge. */
  requestedPowerW: z.array(z.number()),
  achievedPowerW: z.array(z.number()),
  /** Net at the point of connection, after the converter, the transformer and the auxiliaries. */
  gridPowerW: z.array(z.number()),
  dcPowerW: z.array(z.number()),
  packVoltageV: z.array(z.number()),
  packCurrentA: z.array(z.number()),
  cellVoltageV: z.array(z.number()),
  /** Extrema across the cells, which is what the protections read. Equal where no spread is injected. */
  cellVoltageMaxV: z.array(z.number()),
  cellVoltageMinV: z.array(z.number()),
  soc: z.array(z.number()),
  /** What the management system believes, against `soc` which is what the model knows. */
  countedSoc: z.array(z.number()),
  cellTempC: z.array(z.number()),
  cellTempMaxC: z.array(z.number()),
  /** Losses, split so each is counted exactly once. §14.1 matched-boundary accounting. */
  converterLossW: z.array(z.number()),
  batteryLossW: z.array(z.number()),
  auxiliaryW: z.array(z.number()),
  /** Which subsystem set the achieved power at each step, by name. Empty string where nothing did. */
  bindingConstraint: z.array(z.string()),
  /** The converter's state and the management system's, one per sample. §12.3 and §12.4. */
  pcsState: z.array(z.string()),
  bmsState: z.array(z.string()),
  /** Load the plant could not serve, where a load was asked of it. */
  unservedLoadW: z.array(z.number()),
}).strict().superRefine((r, ctx) => {
  const n = r.timeSeconds.length;
  for (const [key, arr] of Object.entries(r)) {
    if (Array.isArray(arr) && arr.length !== n) {
      ctx.addIssue({ code: 'custom', path: [key], message: `${key} has ${arr.length} samples against ${n} timestamps.` });
    }
  }
});
export type TimeSeriesResult = z.infer<typeof timeSeriesResultSchema>;

/* ------------------------------------------------------- decision & event -- */

export const emsDecisionSchema = z.object({
  atSeconds: z.number().min(0),
  /** What the policy could see when it decided. */
  observed: z.record(z.string(), z.number()),
  policyVersion: z.string().min(1),
  /** What it asked for, signed. */
  requestedPowerW: z.number(),
  /** What the limits below it allowed, and what actually happened. */
  appliedLimits: z.array(z.object({ by: z.string(), limitW: z.number(), reason: z.string() })),
  achievedPowerW: z.number(),
  /** The explanation shown to the reader. §14.1: it must resolve to the values above. */
  explanation: z.string().min(1),
}).strict();
export type EmsDecision = z.infer<typeof emsDecisionSchema>;

export const emsDecisionLogSchema = z.object({
  ...base, kind: z.literal('EMSDecisionLog'), runId: id(),
  decisions: z.array(emsDecisionSchema),
}).strict();
export type EmsDecisionLog = z.infer<typeof emsDecisionLogSchema>;

export const eventSeverities = ['info', 'limit', 'alarm', 'trip'] as const;
export const simEventSchema = z.object({
  atSeconds: z.number().min(0),
  /** Which subsystem owns this transition. §12.3 requires the owner to be identified. */
  owner: z.enum(['PCS', 'BMS', 'EMS', 'grid', 'thermal']),
  severity: z.enum(eventSeverities),
  code: z.string().min(1).max(60),
  message: z.string().min(1),
  /** Whether it latched, and what would clear it. */
  latched: z.boolean().default(false),
  clearsWhen: z.string().default(''),
}).strict();
export type SimEvent = z.infer<typeof simEventSchema>;

export const eventLogSchema = z.object({
  ...base, kind: z.literal('EventLog'), runId: id(), events: z.array(simEventSchema),
}).strict();
export type EventLog = z.infer<typeof eventLogSchema>;

/* -------------------------------------------------------- validation ------- */

export const validationReportSchema = z.object({
  ...base,
  kind: z.literal('ValidationReport'),
  fixtureId: z.string().min(1).max(20),
  /** Stated before the run, per §18. */
  expected: z.string().min(1),
  tolerance: z.string().min(1),
  observed: z.string().min(1),
  passed: z.boolean(),
  engineVersion: z.string().min(1),
  ranAt: isoDate(),
}).strict();
export type ValidationReport = z.infer<typeof validationReportSchema>;

/* -------------------------------------------------------------- sealing ---- */

/** Everything that carries a configuration hash. */
export type Hashed = { configHash: string; schemaVersion: number };

/**
 * Stamp a record with the current schema version and its own configuration hash.
 *
 * The hash is taken with the previous hash field removed, so sealing an already-sealed record is
 * idempotent and two records that differ only in a label seal to the same hash.
 */
export function seal<T extends Record<string, unknown>>(record: T): T & Hashed {
  const withVersion = { ...record, schemaVersion: SIM_SCHEMA_VERSION };
  const { configHash: _drop, ...material } = withVersion as Record<string, unknown>;
  return { ...withVersion, configHash: configHash(material) } as T & Hashed;
}

/**
 * Parse first, then seal, then parse again.
 *
 * The order matters and getting it wrong is silent. A schema fills in the fields a record left
 * out — every `.default()` above — so a record sealed before it is parsed is sealed over contents
 * the parse is about to change, and the hash it carries stops matching the moment it is read back.
 * A record only becomes what it is once the contract has finished with it.
 */
export function sealWith<T>(schema: { parse: (v: unknown) => T }, record: unknown): T {
  // A placeholder hash so the first parse has the field it requires; `seal` drops it before
  // hashing, so it can never reach the value it stands in for.
  const primed = { ...(record as object), schemaVersion: SIM_SCHEMA_VERSION, configHash: '0'.repeat(32) };
  const normalised = schema.parse(primed) as Record<string, unknown>;
  return schema.parse(seal(normalised));
}

/** Whether a record's hash still matches what it contains. A false here means it was edited in place. */
export const sealIntact = (record: Hashed & Record<string, unknown>): boolean =>
  seal(record).configHash === record.configHash;

/** The sign convention every run records, so a result can be read without guessing. */
export const runSignConvention = signConvention.activePower;
