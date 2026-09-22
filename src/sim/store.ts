import { z } from 'zod';
import {
  scenarioSchema, simulationRunSchema, timeSeriesResultSchema, emsDecisionLogSchema, eventLogSchema,
  seal, sealIntact, SIM_SCHEMA_VERSION,
  type Scenario, type SimulationRun, type TimeSeriesResult, type EmsDecisionLog, type EventLog,
} from './records';

/**
 * What is stored, and the envelope it is stored in.
 *
 * The record contracts in `records.ts` are strict and know nothing about tenants: a `Scenario` is a
 * scenario whether it came from the catalogue, a file or a database. Persistence needs three more
 * things on every document — which organization it belongs to, who owns it, and when it last
 * changed — and those go in an envelope around the record rather than inside it, so that the
 * contract cannot drift into carrying storage concerns and the security rules have the fields they
 * need at the top level where a rule can read them without a nested lookup.
 *
 * Two collections, because they have opposite lifecycles:
 *
 *   - **`simScenarios`** is what a person edits. It changes.
 *   - **`simRuns`** is what happened. §17.2 requires immutable run snapshots, so a run is written
 *     once and never updated — enforced in `firestore.rules`, not only here.
 */

const envelope = {
  id: z.string().min(1).max(120),
  orgId: z.string().min(1).max(120),
  ownerUid: z.string().min(1).max(160),
  updatedAt: z.string().min(4).max(40),
};

export const storedScenarioSchema = z.object({
  ...envelope,
  kind: z.literal('Scenario'),
  record: scenarioSchema,
}).strict();
export type StoredScenario = z.infer<typeof storedScenarioSchema>;

/**
 * A run and everything it produced, in one document.
 *
 * Together because they are written once, read together and never edited apart: splitting them
 * would buy nothing and cost a second rule path and a way for the two halves to disagree.
 */
export const storedRunSchema = z.object({
  ...envelope,
  kind: z.literal('SimulationRun'),
  record: simulationRunSchema,
  series: timeSeriesResultSchema,
  decisions: emsDecisionLogSchema,
  events: eventLogSchema,
}).strict();
export type StoredRun = z.infer<typeof storedRunSchema>;

/* ------------------------------------------------------------ rounding ---- */

/**
 * Series are rounded to six significant figures before they are stored.
 *
 * A document has a size limit and a day at one-minute steps is over twenty thousand numbers; at
 * full double precision most of the characters carry no information anybody will ever read off a
 * chart. Six figures is well below the numerical tolerance of the model and well above the
 * precision of any parameter feeding it.
 */
export const STORED_SIGNIFICANT_FIGURES = 6;
export const roundForStorage = (n: number): number =>
  (Number.isFinite(n) ? Number(n.toPrecision(STORED_SIGNIFICANT_FIGURES)) : 0);

const roundSeries = (s: TimeSeriesResult): TimeSeriesResult => {
  const out = { ...s } as Record<string, unknown>;
  for (const [key, value] of Object.entries(s)) {
    if (Array.isArray(value) && typeof value[0] === 'number') out[key] = (value as number[]).map(roundForStorage);
  }
  return out as TimeSeriesResult;
};

/* ------------------------------------------------------------- sealing ---- */

export const sealScenario = (s: Scenario): Scenario => seal(s) as Scenario;

/** A run, its series and its logs, sealed and rounded, ready to be written once. */
export function sealRun(args: {
  orgId: string; ownerUid: string; at: string;
  run: SimulationRun; series: TimeSeriesResult; decisions: EmsDecisionLog; events: EventLog;
}): StoredRun {
  const record = seal({ ...args.run, schemaVersion: SIM_SCHEMA_VERSION }) as SimulationRun;
  return storedRunSchema.parse({
    id: record.id, orgId: args.orgId, ownerUid: args.ownerUid, updatedAt: args.at,
    kind: 'SimulationRun', record,
    series: roundSeries(args.series), decisions: args.decisions, events: args.events,
  });
}

export function storeScenario(args: { orgId: string; ownerUid: string; at: string; scenario: Scenario }): StoredScenario {
  return storedScenarioSchema.parse({
    id: args.scenario.id, orgId: args.orgId, ownerUid: args.ownerUid, updatedAt: args.at,
    kind: 'Scenario', record: sealScenario(args.scenario),
  });
}

/* ------------------------------------------------------- round tripping ---- */

/**
 * Out to storage and back.
 *
 * Firestore stores JSON, and a value that does not survive `JSON.parse(JSON.stringify(x))`
 * unchanged is a value that will come back different from how it went in. These two functions are
 * the only sanctioned crossing, and the round-trip test drives them rather than the schemas alone.
 */
export const encode = (value: StoredScenario | StoredRun): string => JSON.stringify(value);

export function decodeScenario(text: string): StoredScenario {
  const parsed = storedScenarioSchema.parse(JSON.parse(text));
  if (!sealIntact(parsed.record)) throw new Error(`Scenario ${parsed.id} was edited after it was sealed: its configuration hash no longer matches its contents.`);
  return parsed;
}

export function decodeRun(text: string): StoredRun {
  const parsed = storedRunSchema.parse(JSON.parse(text));
  if (!sealIntact(parsed.record)) throw new Error(`Run ${parsed.id} was edited after it was sealed: its configuration hash no longer matches its contents.`);
  return parsed;
}

/**
 * Whether a stored run already answers this configuration.
 *
 * The cache question, asked exactly once and in one place. A run answers a configuration when
 * every one of the four hashes it recorded matches, which is why it records four rather than one:
 * a scenario that names a different plant is a different question even if the scenario itself is
 * unchanged.
 */
export const answersConfiguration = (run: SimulationRun, want: {
  scenarioHash: string; plantHash: string; policyHash: string; parameterSetHash: string;
}): boolean =>
  run.status === 'complete'
  && run.scenarioHash === want.scenarioHash
  && run.plantHash === want.plantHash
  && run.policyHash === want.policyHash
  && run.parameterSetHash === want.parameterSetHash;
