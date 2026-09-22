import { simulate, type RunInput } from './engine';
import { configHash } from './hash';
import { plantShape } from './limits';
import { scenarioSchema, sealWith, type EmsPolicy, type Scenario, type TimeSeriesResult } from './records';

/**
 * Two policies, one day, and an honest account of the difference.
 *
 * §11.4 is unusually specific about what this may and may not do, because it is the part of an EMS
 * demonstration that is most often rigged. There is no "EMS off" baseline that disables safety or
 * invents irrational dispatch: both runs keep every converter limit and every battery protection,
 * and the baseline is a fixed schedule, which is how a great many plants are actually run.
 *
 * The one thing that makes or breaks the comparison is the ending state of charge. A policy that
 * finishes with a fuller battery has not saved money; it has deferred spending it. So the ending
 * charge is disclosed whether or not anybody asked, the stored energy is valued at the price in
 * force when the run ended, and the cost difference is restated with that value carried across
 * before any benefit is attributed to anything.
 */

export type PolicyOutcome = {
  policyId: string;
  policyLabel: string;
  policyVersion: string;
  /** The highest the site drew from the grid at any sample. The number a demand charge is set by. */
  peakGridImportW: number;
  importedWh: number;
  exportedWh: number;
  /** Generation that stayed on the site, either used directly or stored. */
  selfConsumedWh: number;
  /** Generation that could neither be used, stored nor exported. */
  curtailedWh: number;
  /** Out of the plant's AC terminals, and into them. */
  deliveredWh: number;
  storedWh: number;
  endingSoc: number;
  /** Import less export at the scenario's own prices. Illustrative: the prices are. */
  illustrativeCost: number;
  /** Load the site asked for and did not get. Any at all makes the run incomparable. */
  unservedWh: number;
  complete: boolean;
};

export type PolicyComparison = {
  /**
   * Proof the two runs saw the same day.
   *
   * A scenario names the policy it was written for, so the two runs cannot carry byte-identical
   * scenario records — one names each policy. This hash is taken over the scenario with that one
   * pointer normalised away, so it covers every material thing about the day: the load, the
   * generation, the prices, the outage, the starting state, the timestep. If it matches, the only
   * difference between the two runs is which policy was in charge.
   */
  scenarioHash: string;
  plantHash: string;
  parameterSetHash: string;
  baseline: PolicyOutcome;
  candidate: PolicyOutcome;
  /** Candidate minus baseline. Positive means the candidate finished with more charge in hand. */
  endingSocDelta: number;
  /** What that difference is worth at the price in force when the run ended. */
  storedEnergyValue: number;
  /** The raw cost difference, and the same difference with the stored energy carried across. */
  costDelta: number;
  reconciledCostDelta: number;
  /** False where something about the pair makes the comparison meaningless, with the reason. */
  comparable: boolean;
  disclosures: string[];
};

const hoursPerSample = (s: TimeSeriesResult) => s.stepSeconds / 3600;

/** Everything §11.4 asks to be compared, read off one run. */
export function outcomeOf(policy: EmsPolicy, series: TimeSeriesResult, price: number[], complete: boolean): PolicyOutcome {
  const h = hoursPerSample(series);
  let peak = 0, imported = 0, exported = 0, selfConsumed = 0, curtailed = 0;
  let delivered = 0, stored = 0, cost = 0, unserved = 0;
  // The closing sample carries no power, so summing every sample counts each interval exactly once.
  for (let i = 0; i < series.timeSeconds.length; i++) {
    const imp = series.gridImportW[i], exp = series.gridExportW[i], gen = series.generationW[i];
    peak = Math.max(peak, imp);
    imported += imp * h;
    exported += exp * h;
    curtailed += series.curtailedW[i] * h;
    // Only generation that actually left the site counts against self-consumption; energy the
    // battery exported later is not the array's, and netting the two would flatter every policy.
    selfConsumed += Math.max(0, gen - Math.min(exp, gen) - series.curtailedW[i]) * h;
    delivered += Math.max(0, series.achievedPowerW[i]) * h;
    stored += Math.max(0, -series.achievedPowerW[i]) * h;
    unserved += series.unservedLoadW[i] * h;
    const p = price[Math.min(i, price.length - 1)] ?? 0;
    cost += ((imp - exp) * h / 1e6) * p;
  }
  return {
    policyId: policy.id, policyLabel: policy.label, policyVersion: policy.policyVersion,
    peakGridImportW: peak, importedWh: imported, exportedWh: exported, selfConsumedWh: selfConsumed,
    curtailedWh: curtailed, deliveredWh: delivered, storedWh: stored,
    endingSoc: series.soc[series.soc.length - 1], illustrativeCost: cost, unservedWh: unserved, complete,
  };
}

/** The hash of everything about a day except which policy was pointed at it. */
export const dayHash = (scenario: Scenario) => configHash({ ...scenario, policyId: 'compared' });

/** The energy one full cycle of this plant represents, used to value a difference in ending charge. */
export const nominalEnergyWh = (input: Pick<RunInput, 'plant' | 'parameters'>) => {
  const shape = plantShape(input.plant);
  return shape.totalCells * input.parameters.cell.nominalV * input.parameters.cell.capacityAh;
};

/**
 * Run two policies over the same scenario and report the difference honestly.
 *
 * Both runs are given the same scenario record, the same plant and the same parameters — not
 * equivalent ones, the same ones — and the hashes of all three are carried into the result so a
 * reader can check that rather than take it on trust.
 */
export function comparePolicies(
  base: Omit<RunInput, 'policy'> & { scenario: Scenario },
  baseline: EmsPolicy,
  candidate: EmsPolicy,
): PolicyComparison {
  // Each run gets the scenario pointing at its own policy, because the engine refuses a scenario
  // that names one policy and is handed another — and it is right to.
  const forPolicy = (p: EmsPolicy) => sealWith(scenarioSchema, { ...base.scenario, policyId: p.id });
  const a = simulate({ ...base, scenario: forPolicy(baseline), policy: baseline });
  const b = simulate({ ...base, scenario: forPolicy(candidate), policy: candidate });
  const price = base.scenario.price?.samples ?? [];
  const outA = outcomeOf(baseline, a.series, price, a.run.status === 'complete');
  const outB = outcomeOf(candidate, b.series, price, b.run.status === 'complete');

  const endingSocDelta = outB.endingSoc - outA.endingSoc;
  const endPrice = price.length ? price[price.length - 1] : 0;
  const storedEnergyValue = (endingSocDelta * nominalEnergyWh(base) / 1e6) * endPrice;
  const costDelta = outB.illustrativeCost - outA.illustrativeCost;
  const reconciledCostDelta = costDelta - storedEnergyValue;

  const disclosures: string[] = [];
  if (Math.abs(endingSocDelta) > 0.001) {
    disclosures.push(
      `The two runs did not finish in the same state: ${outA.policyLabel} ended at ${(outA.endingSoc * 100).toFixed(1)}% and ${outB.policyLabel} at ${(outB.endingSoc * 100).toFixed(1)}%. That difference is worth about ${Math.abs(storedEnergyValue).toFixed(0)} at the closing price, and the reconciled figure is the one to read.`,
    );
  } else {
    disclosures.push(`Both runs finished at ${(outA.endingSoc * 100).toFixed(1)}% charge, so the cost difference needs no reconciliation.`);
  }
  if (outA.unservedWh > 0 || outB.unservedWh > 0) {
    disclosures.push('One of the runs left load unserved. A policy that does not keep the site up is not cheaper; it is a different service.');
  }
  if (!outA.complete || !outB.complete) disclosures.push('One of the runs did not complete, so there is nothing to compare.');
  if (reconciledCostDelta > 0) {
    disclosures.push(`On these figures the ${outB.policyLabel} policy cost more, not less, once the ending charge is carried across. Reported as it came out.`);
  }
  disclosures.push('Prices are illustrative and no commercial saving is promised. This is the educational policy, not the production ergOS algorithm.');

  return {
    scenarioHash: dayHash(base.scenario), plantHash: base.plant.configHash,
    parameterSetHash: base.parameters.configHash,
    baseline: outA, candidate: outB,
    endingSocDelta, storedEnergyValue, costDelta, reconciledCostDelta,
    comparable: outA.complete && outB.complete && outA.unservedWh === 0 && outB.unservedWh === 0,
    disclosures,
  };
}
