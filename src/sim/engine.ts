import { idealise, ocv, resistanceAt, socAfter, tempAfter, terminalVoltage, heatW } from './battery';
import {
  balance, countedSoc, defaultBalancing, defaultCountingError, defaultProtections,
  evaluate as evaluateBms, newMemory, type BmsMemory, type PackSignals,
} from './bms';
import { activePowerCeiling, pcsState } from './pcs';
import { decide, type EmsObservation } from './ems';
import { binding, limitsFor, plantShape, type Limit } from './limits';
import { signConvention } from './signs';
import {
  ENGINE_VERSION, SIM_SCHEMA_VERSION, sealWith, simulationRunSchema,
  emsPolicySchema, equipmentParameterSetSchema, plantConfigurationSchema, scenarioSchema,
  type EmsDecision, type EmsDecisionLog, type EmsPolicy, type EquipmentParameterSet, type EventLog,
  type PlantConfiguration, type Scenario, type SimEvent, type SimulationRun, type SolverSettings,
  type TimeSeriesResult,
} from './records';
import { claimableBadge } from './provenance';

/**
 * The engine.
 *
 * One step at a time: the policy asks, the converter and the battery management system decide what
 * is allowed, the battery does what it is left with, and the result records which of them set the
 * answer. Nothing here knows what a lesson is.
 *
 * **Sub-stepping and constant power.** §12.2 asks the discharge lesson to show current rising as
 * voltage falls under constant power. That only happens if the current is recomputed as the cell
 * empties, so each scenario step is integrated in `solver.subSteps` pieces with the *power* held
 * and the current found afresh each time. The step's reported power, current and losses are the
 * averages over those pieces, which is what makes the energy accounting close exactly; the state
 * reported is where the step ended.
 *
 * **Limits at every piece, not every step.** §13.1 names the failure this avoids: a solver that
 * steps past a protection limit and returns a legal-looking endpoint. Every ceiling is re-evaluated
 * at every sub-step, and the state-of-charge ceiling is computed from where the piece would end.
 *
 * **Boundaries.** §14.1 requires auxiliaries and conversion losses to be counted exactly once. The
 * chain, in one direction and then the other:
 *
 * ```
 * discharge   store → (I²R) → DC terminals → (converter loss) → AC → (auxiliaries) → connection
 * charge      connection → (auxiliaries) → AC → (converter loss) → DC terminals → (I²R) → store
 * ```
 *
 * Every figure in the result names which of those points it was measured at.
 */

export type RunInput = {
  scenario: Scenario;
  plant: PlantConfiguration;
  policy: EmsPolicy;
  parameters: EquipmentParameterSet;
  solver?: Partial<SolverSettings>;
  /** The learner's request, signed, positive for discharge. Used where the policy is manual. */
  manualRequestW?: number;
  /** Identity for the run record. Deterministic so an unchanged configuration produces one run. */
  runId?: string;
  at?: string;
};

export type RunOutput = {
  run: SimulationRun;
  series: TimeSeriesResult;
  decisions: EmsDecisionLog;
  events: EventLog;
};

export const defaultSolver = (): SolverSettings => ({
  integrator: 'explicit-euler', subSteps: 10, toleranceFraction: 0.001, maxIterations: 20,
  maxSubStepSeconds: 10, idealised: false,
});

/** The most pieces any one run may be advanced in, so a careless scenario cannot hang a browser. */
const MAX_TOTAL_SUBSTEPS = 2_000_000;

/**
 * How finely to advance the state under one reporting step.
 *
 * At least `subSteps` pieces, and enough of them that none is longer than `maxSubStepSeconds`.
 * That is what makes the answer independent of how often the learner wanted a sample: asking for
 * a chart point every ten minutes instead of every minute now changes the chart and nothing else.
 */
export const subStepsFor = (stepSeconds: number, solver: SolverSettings): number =>
  Math.max(solver.subSteps, Math.ceil(stepSeconds / solver.maxSubStepSeconds));

const at = (profile: { samples: number[] } | null, index: number): number | null =>
  (profile ? profile.samples[Math.min(index, profile.samples.length - 1)] ?? null : null);

/**
 * The plant with every loss removed, for the fixture mode.
 *
 * The idealised cell is built in `battery.ts`; this is the rest of it — a lossless converter, no
 * standby, no auxiliaries, no derating. Nothing else in the engine special-cases the mode.
 */
const idealisePlant = (plant: PlantConfiguration): PlantConfiguration => ({
  ...plant, auxiliaryW: 0,
  converter: { ...plant.converter, chargeEfficiency: 1, dischargeEfficiency: 1, standbyW: 0, deratingPerC: 0 },
});

/**
 * The DC power the battery must supply or accept for a given AC power at the converter terminals.
 *
 * Discharge divides and charge multiplies, and they are written separately because §18 F02 exists
 * to catch the bug where the discharge formula is reused blindly on charge. On discharge the
 * battery must give more than the converter delivers; on charge it receives less than the
 * converter draws.
 */
const dcForAc = (acW: number, plant: PlantConfiguration): number =>
  (acW > 0 ? acW / plant.converter.dischargeEfficiency : acW * plant.converter.chargeEfficiency);

/** The AC power at the converter terminals for a given DC power. The inverse, and not the same formula. */
const acForDc = (dcW: number, plant: PlantConfiguration): number =>
  (dcW > 0 ? dcW * plant.converter.dischargeEfficiency : dcW / plant.converter.chargeEfficiency);

/**
 * Everything wrong with the inputs, in the words the interface shows.
 *
 * §17.2 asks that an invalid configuration display honestly, which means it is checked before
 * anything is computed and reported as a refusal rather than as a result. The contracts already
 * know what valid means; this asks them, and turns what they say into sentences.
 */
export function problemsWith(input: RunInput): string[] {
  const named: [string, { safeParse: (v: unknown) => { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } } }, unknown][] = [
    ['scenario', scenarioSchema, input.scenario],
    ['plant configuration', plantConfigurationSchema, input.plant],
    ['policy', emsPolicySchema, input.policy],
    ['parameter set', equipmentParameterSetSchema, input.parameters],
  ];
  const out: string[] = [];
  for (const [what, schema, value] of named) {
    const parsed = schema.safeParse(value);
    if (!parsed.success) {
      for (const issue of parsed.error?.issues ?? []) {
        out.push(`The ${what} is not usable: ${issue.path.join('.') || what} — ${issue.message}`);
      }
    }
  }
  if (input.scenario?.plantId && input.plant?.id && input.scenario.plantId !== input.plant.id) {
    out.push(`The scenario names plant ${input.scenario.plantId} but was handed ${input.plant.id}.`);
  }
  if (input.scenario?.policyId && input.policy?.id && input.scenario.policyId !== input.policy.id) {
    out.push(`The scenario names policy ${input.scenario.policyId} but was handed ${input.policy.id}.`);
  }
  if (input.plant?.parameterSetId && input.parameters?.id && input.plant.parameterSetId !== input.parameters.id) {
    out.push(`The plant names parameter set ${input.plant.parameterSetId} but was handed ${input.parameters.id}.`);
  }
  return out;
}

export function simulate(input: RunInput): RunOutput {
  const solver: SolverSettings = { ...defaultSolver(), ...input.solver };
  const invalid = problemsWith(input);
  // Run against the parsed records rather than whatever was handed in, so the defaults a schema
  // fills in are the ones the engine sees. A scenario stored before a field existed reads back
  // without it, and a model that then trips over `undefined` is a model that cannot be upgraded.
  const scenario = invalid.length ? input.scenario : scenarioSchema.parse(input.scenario);
  const policy = invalid.length ? input.policy : emsPolicySchema.parse(input.policy);
  const parameters = invalid.length ? input.parameters : equipmentParameterSetSchema.parse(input.parameters);
  const parsedPlant = invalid.length ? input.plant : plantConfigurationSchema.parse(input.plant);
  // A scenario may put the same plant somewhere warmer or colder than it was designed for.
  const sited = scenario?.ambientC == null ? parsedPlant : { ...parsedPlant, ambientC: scenario.ambientC };
  const plant = solver.idealised ? idealisePlant(sited) : sited;
  const cell = solver.idealised ? idealise(parameters.cell) : parameters.cell;
  const shape = plantShape(plant);
  const steps = Math.round(scenario.durationSeconds / scenario.stepSeconds);
  const subSteps = subStepsFor(scenario.stepSeconds, solver);
  const subSeconds = scenario.stepSeconds / subSteps;
  const startedAt = input.at ?? new Date(0).toISOString();

  const series: Record<string, number[]> = {
    timeSeconds: [], requestedPowerW: [], achievedPowerW: [], gridPowerW: [], dcPowerW: [],
    packVoltageV: [], packCurrentA: [], cellVoltageV: [], cellVoltageMaxV: [], cellVoltageMinV: [],
    soc: [], countedSoc: [], cellTempC: [], cellTempMaxC: [],
    converterLossW: [], batteryLossW: [], auxiliaryW: [], unservedLoadW: [],
  };
  const bindingConstraint: string[] = [];
  const pcsStates: string[] = [];
  const bmsStates: string[] = [];

  // The battery management system, and the spread it is watching. §12.4 reads extrema rather than
  // averages, which needs at least two cells to have extrema of.
  const protections = defaultProtections(cell);
  const balancing = defaultBalancing();
  const counting = defaultCountingError();
  const memory: BmsMemory = newMemory();
  const weak = scenario.injected?.weakCell ?? null;
  const weakCell = weak ? { ...cell, capacityAh: cell.capacityAh * weak.capacityFraction, resistanceOhm: cell.resistanceOhm * weak.resistanceMultiple } : null;
  const decisions: EmsDecision[] = [];
  const events: SimEvent[] = [];
  const seen = new Set<string>();
  const note = (e: SimEvent) => { const key = `${e.code}:${e.latched}`; if (!seen.has(key)) { seen.add(key); events.push(e); } };

  let soc = scenario.initialSoc;
  let tempC = scenario.initialCellTempC;
  let weakSoc = Math.min(1, Math.max(0, scenario.initialSoc + (weak?.socOffset ?? 0)));
  let weakTempC = scenario.initialCellTempC + (weak?.tempOffsetC ?? 0);
  let now = 0;

  /**
   * What the management system can see.
   *
   * Extrema across the cells, never averages — that is the whole point of §12.4's "why a healthy
   * average state of charge does not override one limiting cell". With no spread injected the two
   * cells are the same cell and the extrema coincide, which is the honest answer rather than a
   * fabricated distribution.
   */
  const packSignals = (): PackSignals => {
    // Terminal voltage, not open-circuit: a management system measures what is on the terminals,
    // and under load that is where a weak cell shows itself. It reads the current that has just
    // flowed rather than the one about to, which is both how a supervisory system works and what
    // keeps this from depending on the decision it is about to inform.
    const repV = terminalVoltage(cell, soc, lastCellCurrent, tempC);
    const wV = weakCell ? terminalVoltage(weakCell, weakSoc, lastCellCurrent, weakTempC) : repV;
    const wT = weakCell ? weakTempC : tempC;
    const lost = scenario.injected?.communicationLostAtSeconds ?? null;
    return {
      cellVoltageMax: Math.max(repV, wV), cellVoltageMin: Math.min(repV, wV),
      cellTempMax: Math.max(tempC, wT), cellTempMin: Math.min(tempC, wT),
      cellCurrentA: lastCellCurrent,
      communicationOk: lost === null || now < lost,
      insulationOk: true, contactorOk: true,
    };
  };
  let lastCellCurrent = 0;

  /**
   * The thermal resistance from a cell to its coolant.
   *
   * §12.5 asks a cooling failure to demonstrate the modelled temperature and derating response and
   * nothing else. A stopped loop is exactly that: the path out of the cell gets much worse, the
   * cell heats, the protections derate and then trip. No propagation is modelled and none is
   * claimed.
   */
  const coolingFailed = (atSeconds: number) => {
    const fails = scenario.injected?.coolingFailsAtSeconds ?? null;
    return fails !== null && atSeconds >= fails;
  };
  /**
   * What the cell sheds its heat to.
   *
   * While the loop is moving, the coolant. Once it has stopped there is nothing carrying heat out
   * of the enclosure at all, so the cells warm their surroundings and then themselves: the
   * coolant sits at the cell's own temperature and the cell heats adiabatically. That is also why
   * the temperature does not come back down when the plant stops dispatching — a detail worth
   * more than the rise itself.
   */
  const coolantFor = (atSeconds: number, cellTempC: number) => (coolingFailed(atSeconds) ? cellTempC : plant.ambientC);

  /** The cell current that would move this much AC power, for comparing a converter ceiling. */
  const cellCurrentForAcPower = (acW: number, direction: 'charge' | 'discharge') => {
    const perCellW = dcForAc(direction === 'discharge' ? acW : -acW, plant) / shape.totalCells;
    const v0 = ocv(cell, soc), r = resistanceAt(cell, tempC);
    if (r <= 0) return perCellW / v0;
    const d = v0 * v0 - 4 * r * perCellW;
    return d < 0 ? Number.POSITIVE_INFINITY : (v0 - Math.sqrt(d)) / (2 * r);
  };

  /** Time passing with nothing dispatched: the cells still cool, or fail to. */
  const advanceIdle = (seconds: number) => {
    lastCellCurrent = 0;
    if (solver.idealised) return;
    tempC = tempAfter(cell, tempC, 0, coolantFor(now, tempC), 1, seconds);
    if (weakCell) weakTempC = tempAfter(weakCell, weakTempC, 0, coolantFor(now, weakTempC), 1, seconds);
  };
  let failure: string | null = invalid.length ? invalid.join(' ') : null;

  for (let step = 0; step < steps && failure === null; step++) {
    const t = step * scenario.stepSeconds;
    now = t;
    const islanded = !!scenario.outage && t >= scenario.outage.fromSeconds && t < scenario.outage.toSeconds;
    const siteLoadW = at(scenario.siteLoad, step);
    const observation: EmsObservation = {
      atSeconds: t, soc, siteLoadW, generationW: at(scenario.generation, step),
      pricePerMWh: at(scenario.price, step), islanded, manualRequestW: input.manualRequestW ?? 0,
    };
    const asked = decide(policy, observation);

    // Auxiliaries and converter standby run whenever the plant is energised, in either direction
    // and whether or not it is dispatching. They are counted here, once.
    const auxW = plant.auxiliaryW + plant.converter.standbyW;

    const startSoc = soc, startTemp = tempC, startVoltage = ocv(cell, soc);
    const startWeakV = weakCell ? ocv(weakCell, weakSoc) : startVoltage;
    const measured = packSignals();
    const startWeakTemp = weakCell ? weakTempC : startTemp;
    let sumDc = 0, sumAc = 0, sumCellI = 0, sumCellV = 0, sumConvLoss = 0, sumBattLoss = 0;
    let appliedLimits: { by: string; limitW: number; reason: string }[] = [];
    /** The tightest any ceiling held this step, across every piece of it. */
    let worst: { name: string; ratio: number } | null = null;
    // A policy that asks for nothing while the learner asked for something is itself the binding
    // constraint, and the EMS is the one that decided it. Without this the plant sits in standby
    // with no constraint named and no event logged, which is exactly the silence §11.3 forbids.
    let bindName = asked.requestedW === 0 ? (asked.hold ?? '') : 'Request met in full';
    if (asked.hold && (input.manualRequestW ?? 0) !== 0) {
      note({
        atSeconds: t, owner: 'EMS', severity: 'limit',
        code: asked.hold.toLowerCase().replace(/[^a-z]+/g, '-'),
        message: `${asked.hold}: the policy asked for nothing. ${asked.explanation}`,
        latched: false, clearsWhen: 'The policy relays a request again.',
      });
    }
    let bms = evaluateBms(protections, packSignals(), memory, 0, t);
    const stepEvents: SimEvent[] = [];

    for (let piece = 0; piece < subSteps; piece++) {
      const direction = asked.requestedW > 0 ? 'discharge' : asked.requestedW < 0 ? 'charge' : null;
      // The management system is evaluated whether or not anything is being asked of the plant: a
      // cell cooking on a stopped coolant loop is a fault at idle exactly as it is under load.
      bms = evaluateBms(protections, packSignals(), memory, subSeconds, t);
      stepEvents.push(...bms.events);
      if (direction === null) {
        sumCellV += ocv(cell, soc);
        advanceIdle(subSeconds);
        continue;
      }

      // Which cell binds depends on the direction: discharging, it is the emptiest; charging, the
      // fullest. With no spread injected both are the representative cell and this is a no-op.
      const limiting = weakCell
        ? (direction === 'discharge'
          ? (weakSoc <= soc ? { cell: weakCell, soc: weakSoc, tempC: weakTempC } : { cell, soc, tempC })
          : (weakSoc >= soc ? { cell: weakCell, soc: weakSoc, tempC: weakTempC } : { cell, soc, tempC }))
        : undefined;
      const limits = limitsFor({
        plant, cell, shape, soc, tempC, limiting, stepSeconds: subSeconds,
        // An outage lowers the reserve the policy keeps in hand; it never lowers the hard floor.
        reserveSoc: islanded ? policy.emergencyReserveSoc : policy.reserveSoc,
        socFloor: 0, socCeiling: 1, islanded, idealised: solver.idealised,
      }, direction);
      const { limit, ordered } = binding(limits);

      // What the request itself would take, in one cell's amps.
      const wantedDcW = dcForAc(asked.requestedW, plant);
      const perCellW = wantedDcW / shape.totalCells;
      const v0 = ocv(cell, soc), r = resistanceAt(cell, tempC);
      const disc = v0 * v0 - 4 * r * perCellW;
      const wantedCellI = r > 0
        ? (disc < 0 ? Number.POSITIVE_INFINITY : (v0 - Math.sqrt(disc)) / (2 * r))
        : perCellW / v0;

      // The converter's own ceiling, which the capability circle alone cannot answer. §12.3.
      const dcVoltageNow = (v0 - 0) * shape.seriesCells;
      const pcsCeiling = activePowerCeiling(plant.converter, {
        reactiveVar: scenario.reactiveVar ?? 0, dcVoltageV: dcVoltageNow, tempC, direction,
      }).ceiling;
      const pcsCellI = Math.abs(cellCurrentForAcPower(pcsCeiling.activeW, direction));

      // And the management system's veto, which multiplies whatever survived everything else.
      const bmsFactor = direction === 'discharge' ? bms.dischargeFactor : bms.chargeFactor;

      const ceilings: { name: string; value: number }[] = [
        { name: limit.name, value: limit.cellCurrentA },
        { name: pcsCeiling.name, value: pcsCellI },
        { name: bms.binding ? bms.binding.label : 'Battery management system', value: limit.cellCurrentA * bmsFactor },
      ];
      const tightest = ceilings.reduce((a, b) => (b.value < a.value ? b : a));
      const allowed = Math.min(Math.abs(wantedCellI), tightest.value);
      if (!Number.isFinite(allowed)) { failure = `The requested power is beyond what this battery can deliver at ${(soc * 100).toFixed(0)}% charge, at any current.`; break; }
      const cellI = direction === 'discharge' ? allowed : -allowed;
      lastCellCurrent = cellI;

      const vCell = v0 - cellI * r;
      const cellW = vCell * cellI;
      const dcW = cellW * shape.totalCells;
      const acW = acForDc(dcW, plant);
      const battLoss = heatW(cell, soc, cellI, tempC) * shape.totalCells;

      sumDc += dcW; sumAc += acW; sumCellI += cellI; sumCellV += vCell;
      sumConvLoss += Math.abs(dcW - acW); sumBattLoss += battLoss;

      if (piece === 0) {
        // The four tightest ceilings, each restated as the AC power it corresponds to, so the
        // decision log can be read without converting anything by hand.
        appliedLimits = ordered.slice(0, 4).map(l => {
          const i = Math.min(l.cellCurrentA, 1e6);
          const dc = i * (v0 - i * r) * shape.totalCells * (direction === 'discharge' ? 1 : -1);
          return { by: l.by, limitW: Math.abs(acForDc(dc, plant)), reason: `${l.name}: ${l.reason}` };
        });
      }
      // Which limit bound is asked of every piece, not only the first. A step is reported by the
      // average power across it, so a ceiling that engages half way through still shows up in the
      // reported power — and if the constraint were read from the first piece alone, that step
      // would report a shortfall with nothing named as its cause.
      if (allowed < Math.abs(wantedCellI) - 1e-9) {
        const ratio = allowed / Math.abs(wantedCellI);
        if (worst === null || ratio < worst.ratio) worst = { name: tightest.name, ratio };
        if (tightest.name === limit.name) recordLimitEvent(note, limit, t + piece * subSeconds, direction);
      }

      soc = socAfter(cell, soc, cellI, subSeconds);
      tempC = solver.idealised ? tempC : tempAfter(cell, tempC, heatW(cell, soc, cellI, tempC), coolantFor(t, tempC), 1, subSeconds);
      if (weakCell) {
        weakSoc = socAfter(weakCell, weakSoc, cellI, subSeconds);
        weakTempC = solver.idealised ? weakTempC
          : tempAfter(weakCell, weakTempC, heatW(weakCell, weakSoc, cellI, weakTempC), coolantFor(t, weakTempC), 1, subSeconds);
      }
      // Balancing, and the count the management system is keeping against what is true.
      balance(balancing, { soc, spreadV: Math.abs(ocv(cell, soc) - (weakCell ? ocv(weakCell, weakSoc) : ocv(cell, soc))), cellV: ocv(cell, soc), seconds: subSeconds }, memory);
      countedSoc(counting, { trueSoc: soc, capacityAh: cell.capacityAh, seconds: subSeconds }, memory);
    }
    if (failure !== null) break;
    if (worst) bindName = worst.name;

    const n = subSteps;
    const dcW = sumDc / n, acW = sumAc / n, cellI = sumCellI / n;
    // At the connection point: what the converter produced, less what the plant consumed itself.
    // On charge `acW` is already negative, so the same subtraction deepens the import — which is
    // right, because the auxiliaries are drawn from the same connection in both directions.
    const gridW = acW - auxW;
    // The grid covers any shortfall unless there is no grid. Only in an outage can a load go
    // unserved, and then only by however much the plant could not produce.
    const unserved = islanded && siteLoadW !== null ? Math.max(0, siteLoadW - Math.max(0, gridW)) : 0;

    // The state as it was at the start of this interval, and the power averaged across it. The
    // state has already been advanced by the loop above, so the values pushed here are the ones
    // captured before it ran.
    series.timeSeconds.push(t);
    series.requestedPowerW.push(asked.requestedW);
    series.achievedPowerW.push(acW);
    series.gridPowerW.push(gridW);
    series.dcPowerW.push(dcW);
    // The loaded terminal voltage, which is what a meter on the string reads, not the open-circuit
    // voltage it would relax to. §12.2 wants the fall under load to be visible.
    const measuredV = terminalVoltage(cell, startSoc, lastCellCurrent, startTemp);
    series.packVoltageV.push(measuredV * shape.seriesCells);
    series.packCurrentA.push(cellI * shape.parallelStrings);
    series.cellVoltageV.push(measuredV);
    // What the protections read: the terminal voltages, with the load on them.
    series.cellVoltageMaxV.push(measured.cellVoltageMax);
    series.cellVoltageMinV.push(measured.cellVoltageMin);
    series.soc.push(startSoc);
    series.countedSoc.push(Math.min(1, Math.max(0, startSoc + memory.countingDriftSoc)));
    series.cellTempC.push(startTemp);
    series.cellTempMaxC.push(Math.max(startTemp, startWeakTemp));
    series.converterLossW.push(sumConvLoss / n);
    series.batteryLossW.push(sumBattLoss / n);
    series.auxiliaryW.push(auxW);
    series.unservedLoadW.push(unserved);
    bindingConstraint.push(bindName);
    // The same tolerance the solver is held to, so the state and the named constraint cannot
    // disagree: a converter reported as discharging while a limit is named as holding it back is
    // two readings of one moment that contradict each other, and the learner has no way to tell
    // which is the lie.
    pcsStates.push(pcsState({
      requestedW: asked.requestedW, achievedW: acW, vetoed: bms.open,
      elapsedSeconds: t, prechargeSeconds: 0, tolerance: solver.toleranceFraction,
    }));
    bmsStates.push(bms.state);
    for (const e of stepEvents) note(e);

    decisions.push({
      atSeconds: t, observed: asked.observed, policyVersion: policy.policyVersion,
      requestedPowerW: asked.requestedW, appliedLimits, achievedPowerW: acW,
      explanation: bindName && bindName !== 'Request met in full'
        ? `${asked.explanation} The ${bindName.toLowerCase()} held it to ${Math.abs(acW / 1e3).toFixed(0)} kW.`
        : asked.explanation,
    });
  }

  // One last sample, carrying the state the run ended in and no power, so a chart shows where it
  // finished and the energy sums are unchanged.
  if (!failure && series.timeSeconds.length) {
    series.timeSeconds.push(steps * scenario.stepSeconds);
    for (const key of ['requestedPowerW', 'achievedPowerW', 'gridPowerW', 'dcPowerW', 'packCurrentA',
      'converterLossW', 'batteryLossW', 'auxiliaryW', 'unservedLoadW']) series[key].push(0);
    series.packVoltageV.push(ocv(cell, soc) * shape.seriesCells);
    series.cellVoltageV.push(ocv(cell, soc));
    series.cellVoltageMaxV.push(packSignals().cellVoltageMax);
    series.cellVoltageMinV.push(packSignals().cellVoltageMin);
    series.soc.push(soc);
    series.countedSoc.push(Math.min(1, Math.max(0, soc + memory.countingDriftSoc)));
    series.cellTempC.push(tempC);
    series.cellTempMaxC.push(Math.max(tempC, weakCell ? weakTempC : tempC));
    bindingConstraint.push('');
    pcsStates.push('standby');
    bmsStates.push(bmsStates.at(-1) ?? 'normal');
  }

  const runId = input.runId ?? `run_${scenario.configHash.slice(0, 12)}`;
  const run = sealWith(simulationRunSchema, {
    id: runId, label: scenario.label, kind: 'SimulationRun' as const,
    scenarioHash: scenario.configHash, plantHash: plant.configHash,
    policyHash: policy.configHash, parameterSetHash: parameters.configHash,
    engine: 'bess-studio-ts', engineVersion: ENGINE_VERSION, solver,
    seed: null, signConvention: signConvention.activePower,
    status: failure ? 'failed' : 'complete',
    startedAt, finishedAt: failure ? null : startedAt, failure,
    badge: claimableBadge([parameters.provenance.badge, plant.converter.provenance.badge], []),
    schemaVersion: SIM_SCHEMA_VERSION,
  });

  return {
    run,
    series: {
      id: `series_${runId}`, label: scenario.label, kind: 'TimeSeriesResult', schemaVersion: SIM_SCHEMA_VERSION,
      runId, stepSeconds: scenario.stepSeconds, bindingConstraint,
      pcsState: pcsStates, bmsState: bmsStates, ...series,
    } as unknown as TimeSeriesResult,
    decisions: { id: `dec_${runId}`, label: scenario.label, kind: 'EMSDecisionLog', schemaVersion: SIM_SCHEMA_VERSION, runId, decisions } as EmsDecisionLog,
    events: { id: `evt_${runId}`, label: scenario.label, kind: 'EventLog', schemaVersion: SIM_SCHEMA_VERSION, runId, events } as EventLog,
  };
}

function recordLimitEvent(note: (e: SimEvent) => void, limit: Limit, atSeconds: number, direction: 'charge' | 'discharge') {
  // A ceiling is a limit whatever its value. A full battery that will accept nothing more is not
  // an alarm — the alarm severities belong to the protections in §12.4, which raise their own
  // events when a measured signal passes a trip point. Confusing the two makes both meaningless.
  const stopped = limit.cellCurrentA <= 1e-9;
  note({
    atSeconds, owner: limit.by === 'battery' ? 'BMS' : limit.by === 'EMS' ? 'EMS' : limit.by,
    severity: 'limit', code: limit.name.toLowerCase().replace(/[^a-z]+/g, '-').replace(/^-|-$/g, ''),
    message: `${limit.name} — the ${direction} is held ${stopped ? 'to nothing' : 'below what was asked'}. ${limit.reason}`,
    latched: false,
    clearsWhen: 'The condition that caused it no longer applies.',
  });
}

/* ------------------------------------------------------------ accounting -- */

/**
 * The energy that crossed each boundary over a whole run, in watt-hours.
 *
 * Every figure names where it was measured, because §12.2 requires it and because "150 MWh" with
 * no boundary is the ambiguity the lesson exists to dispel. Discharge and charge are reported
 * separately and unsigned; a signed total would hide the thing being taught.
 */
export function accounting(series: TimeSeriesResult) {
  const h = series.stepSeconds / 3600;
  const sum = (arr: number[], pick: (v: number) => number) => arr.reduce((t, v) => t + pick(v) * h, 0);
  return {
    /** At the battery's own terminals. */
    dischargedDcWh: sum(series.dcPowerW, v => Math.max(0, v)),
    chargedDcWh: sum(series.dcPowerW, v => Math.max(0, -v)),
    /** At the converter's AC terminals. */
    deliveredAcWh: sum(series.achievedPowerW, v => Math.max(0, v)),
    drawnAcWh: sum(series.achievedPowerW, v => Math.max(0, -v)),
    /** At the point of connection, after the plant has fed itself. */
    exportedWh: sum(series.gridPowerW, v => Math.max(0, v)),
    importedWh: sum(series.gridPowerW, v => Math.max(0, -v)),
    /** Counted once each. */
    converterLossWh: sum(series.converterLossW, v => v),
    batteryLossWh: sum(series.batteryLossW, v => v),
    auxiliaryWh: sum(series.auxiliaryW, v => v),
    unservedWh: sum(series.unservedLoadW, v => v),
  };
}

/**
 * Round-trip efficiency, reported **only** from a complete controlled cycle.
 *
 * §14 is explicit: an efficiency computed from an arbitrary partial discharge is meaningless
 * without stating the accounting, and will not be shown as though it were not. So this returns
 * null unless the run ended close to where it started, and says why when it does.
 */
export function roundTrip(series: TimeSeriesResult, toleranceSoc = 0.01): { value: number | null; why: string } {
  const startSoc = series.soc.length ? series.soc[0] : 0;
  const endSoc = series.soc.length ? series.soc[series.soc.length - 1] : 0;
  const a = accounting(series);
  if (Math.abs(endSoc - startSoc) > toleranceSoc) {
    return { value: null, why: `The run ended at ${(endSoc * 100).toFixed(1)}% against ${(startSoc * 100).toFixed(1)}% at the start. A round-trip efficiency across a partial cycle would not mean anything, so none is reported.` };
  }
  if (a.drawnAcWh <= 0) return { value: null, why: 'Nothing was charged, so there is no round trip to report.' };
  return {
    value: a.deliveredAcWh / a.drawnAcWh,
    why: `${(a.deliveredAcWh / 1000).toFixed(1)} kWh delivered at the converter's AC terminals against ${(a.drawnAcWh / 1000).toFixed(1)} kWh drawn there, over a cycle that ended where it started.`,
  };
}
