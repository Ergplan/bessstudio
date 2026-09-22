import type { EmsPolicy } from './records';

/**
 * The supervisory policy: what the plant is asked to do, and why.
 *
 * §11.3 requires the decision to be visible, and §14.1 requires every explanation to resolve to
 * the recorded inputs and the active rules at the selected timestamp. So a policy here returns an
 * explanation alongside its request, built from the same numbers it decided on, rather than a
 * sentence written separately and hoped to be true.
 *
 * The policy is **not** authoritative over what happens. It asks; the converter and the battery
 * management system decide what is allowed, and they are the ones that answer. §11.2 is explicit
 * that no-break control may never depend on this layer, and the engine enforces that by
 * construction: the policy's output is a request, and every limit is applied downstream of it.
 */

export type EmsObservation = {
  atSeconds: number;
  soc: number;
  /** What the site is drawing, before the plant does anything. Null where the scenario has no load. */
  siteLoadW: number | null;
  generationW: number | null;
  pricePerMWh: number | null;
  islanded: boolean;
  /** The learner's own setting, where the policy is manual. Signed: positive is discharge. */
  manualRequestW: number;
};

export type EmsRequest = {
  /** Signed AC power at the converter terminals, positive for discharge. */
  requestedW: number;
  explanation: string;
  /** The values the explanation is built from, recorded so it can be checked rather than believed. */
  observed: Record<string, number>;
};

/** Policies that have not been built yet say so, rather than quietly doing nothing. */
export const policyAvailability: Record<EmsPolicy['policy'], string | null> = {
  manual: null,
  'peak-shaving': 'Arrives with lesson 2.',
  'self-consumption': 'Arrives with lesson 3.',
  'backup-reserve': 'Arrives with lesson 4.',
  'price-schedule': 'Arrives with lesson 5.',
};

export const policyAvailable = (policy: EmsPolicy['policy']) => policyAvailability[policy] === null;

/**
 * What the policy asks for this step.
 *
 * The manual policy relays the learner's request unchanged except for the reserve, which it will
 * not discharge below under normal economics — §15 lesson 4 is built on that distinction, and
 * lesson 1 needs it visible from the start so the learner is never surprised by it later.
 */
export function decide(policy: EmsPolicy, o: EmsObservation): EmsRequest {
  const observed: Record<string, number> = {
    soc: o.soc, reserveSoc: policy.reserveSoc, manualRequestW: o.manualRequestW, islanded: o.islanded ? 1 : 0,
  };
  if (o.siteLoadW !== null) observed.siteLoadW = o.siteLoadW;
  if (o.generationW !== null) observed.generationW = o.generationW;
  if (o.pricePerMWh !== null) observed.pricePerMWh = o.pricePerMWh;

  const floor = o.islanded ? policy.emergencyReserveSoc : policy.reserveSoc;
  observed.floorSoc = floor;

  if (!policyAvailable(policy.policy)) {
    return {
      requestedW: 0,
      explanation: `The ${policy.policy} policy is not built yet. ${policyAvailability[policy.policy]} Until then it asks for nothing rather than pretending to dispatch.`,
      observed,
    };
  }

  const wanted = o.manualRequestW;
  if (wanted > 0 && o.soc <= floor) {
    return {
      requestedW: 0,
      explanation: `Holding: the charge is at ${(o.soc * 100).toFixed(1)}%, which is ${o.islanded ? 'the emergency floor' : 'the reserve'} of ${(floor * 100).toFixed(0)}%. ${o.islanded ? 'Even in an outage there is a floor below which the battery is not taken.' : 'Discharging past the reserve is what an outage is for.'}`,
      observed,
    };
  }
  if (wanted === 0) {
    return { requestedW: 0, explanation: 'Idle: nothing has been asked of the plant.', observed };
  }
  return {
    requestedW: wanted,
    explanation: `Relaying the request for ${Math.abs(wanted / 1e3).toFixed(0)} kW ${wanted > 0 ? 'out of' : 'into'} the battery. The converter and the battery management system decide what of it is possible.`,
    observed,
  };
}
