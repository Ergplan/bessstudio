import type { EmsPolicy } from './records';

/**
 * The supervisory policy: what the plant is asked to do, and why.
 *
 * §11.3 requires the decision to be visible, and §14.1 requires every explanation to resolve to
 * the recorded inputs and the active rules at the selected timestamp. So a policy here returns an
 * explanation alongside its request, built from the same numbers it decided on, rather than a
 * sentence written separately and hoped to be true. Each one also names the rule that fired, so
 * "Why?" opens something real rather than restating the sentence in different words.
 *
 * The policy is **not** authoritative over what happens. It asks; the converter and the battery
 * management system decide what is allowed, and they are the ones that answer. §11.2 is explicit
 * that no-break control may never depend on this layer, and the engine enforces that by
 * construction: while the plant is running its own island the policy is not in command at all,
 * and every limit is applied downstream of whatever it asked for.
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
  /** The most the plant could be asked for in either direction, so a policy cannot ask for absurdities. */
  plantRatedW: number;
  /** How old the site telemetry is. Zero while it is arriving. */
  telemetryAgeSeconds: number;
  /** What the policy asked for last time, which is what a hold-last-setpoint fallback holds. */
  lastSetpointW: number;
};

export type EmsAction = 'charge' | 'discharge' | 'hold' | 'reduce';

export type EmsRequest = {
  /** Signed AC power at the converter terminals, positive for discharge. */
  requestedW: number;
  explanation: string;
  /** The values the explanation is built from, recorded so it can be checked rather than believed. */
  observed: Record<string, number>;
  /**
   * Why the policy is asking for nothing although something was asked of it, in the same words the
   * limit chain uses for its own ceilings. Null whenever the policy is relaying a request, or when
   * nothing was asked in the first place — a plant nobody has asked anything of is idle, not held.
   *
   * §11.3 requires the decision to be visible. A policy that quietly returns zero is the one thing
   * a learner cannot see, so the engine takes this name as the binding constraint for the step and
   * logs it against the EMS, which is who actually decided.
   */
  hold: string | null;
  /** What this policy is for, in one line. The "Goal" row of §11.3's card. */
  goal: string;
  action: EmsAction;
  /** The rule that fired, as an identifier a reader can look up. The "Why?" behind the reason. */
  rule: string;
  /** True where the telemetry was too old to decide on and the documented fallback applied. */
  usedFallback: boolean;
  /**
   * What was asked for before the policy reduced it to something the plant could actually do, or
   * null where nothing was reduced. §11.3 lists "reduce the request" as one of the four actions a
   * policy may take, and a reduction nobody is told about is indistinguishable from a plant that
   * quietly under-performs.
   */
  reducedFromW: number | null;
};

/** Policies that have not been built yet say so, rather than quietly doing nothing. */
export const policyAvailability: Record<EmsPolicy['policy'], string | null> = {
  manual: null, 'peak-shaving': null, 'self-consumption': null, 'backup-reserve': null, 'price-schedule': null,
};

export const policyAvailable = (policy: EmsPolicy['policy']) => policyAvailability[policy] === null;

/** What each policy is for. The goal row is the same for every decision a policy makes. */
export const policyGoals: Record<EmsPolicy['policy'], string> = {
  manual: 'Do what the learner asks, so the layers below it can be seen deciding what is possible.',
  'peak-shaving': 'Hold the site’s grid import below its target, and refill only in the room left under it.',
  'self-consumption': 'Store generation that would otherwise be exported, and spend it on the site’s own load.',
  'backup-reserve': 'Keep enough charge in hand to ride through an outage, and spend nothing that is protected.',
  'price-schedule': 'Buy energy in the cheap windows and sell it in the dear ones, on a schedule set in advance.',
};

const kW = (w: number) => Math.abs(w / 1e3).toFixed(0);
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

/** The hour of the day a scenario second falls in, so an hour-of-day schedule can be read. */
export const hourOfDay = (atSeconds: number) => (atSeconds / 3600) % 24;

/**
 * What the policy asks for this step.
 *
 * Three things happen before any policy sees the observation, in this order: an unbuilt policy says
 * so, an island takes the decision away from the supervisory layer entirely, and telemetry too old
 * to decide on puts the policy on its documented fallback. Only then does a policy apply its rules.
 */
export function decide(policy: EmsPolicy, o: EmsObservation): EmsRequest {
  const observed: Record<string, number> = {
    soc: o.soc, reserveSoc: policy.reserveSoc, manualRequestW: o.manualRequestW,
    islanded: o.islanded ? 1 : 0, telemetryAgeSeconds: o.telemetryAgeSeconds,
    telemetryTimeoutSeconds: policy.telemetryTimeoutSeconds,
  };
  if (o.siteLoadW !== null) observed.siteLoadW = o.siteLoadW;
  if (o.generationW !== null) observed.generationW = o.generationW;
  if (o.pricePerMWh !== null) observed.pricePerMWh = o.pricePerMWh;

  const floor = o.islanded ? policy.emergencyReserveSoc : policy.reserveSoc;
  observed.floorSoc = floor;
  const goal = policyGoals[policy.policy];
  const cap = (w: number) => Math.max(-o.plantRatedW, Math.min(o.plantRatedW, w));

  if (!policyAvailable(policy.policy)) {
    return {
      requestedW: 0, goal, action: 'hold', rule: 'policy/not-built', usedFallback: false, reducedFromW: null,
      explanation: `The ${policy.policy} policy is not built yet. ${policyAvailability[policy.policy]} Until then it asks for nothing rather than pretending to dispatch.`,
      observed, hold: 'Policy not built yet',
    };
  }

  // Stale telemetry, and the documented fallback. §11.3 puts the timeout and the fallback in the
  // component configuration rather than in the engine, so both are read off the policy here and
  // both are recorded in the decision.
  if (o.telemetryAgeSeconds > policy.telemetryTimeoutSeconds) {
    const held = policy.staleFallback === 'hold-last-setpoint';
    return {
      requestedW: held ? cap(o.lastSetpointW) : 0,
      goal, action: held ? (o.lastSetpointW > 0 ? 'discharge' : o.lastSetpointW < 0 ? 'charge' : 'hold') : 'hold',
      rule: `fallback/${policy.staleFallback}`, usedFallback: true, reducedFromW: null,
      explanation: held
        ? `Telemetry is ${o.telemetryAgeSeconds.toFixed(0)} s old, past the ${policy.telemetryTimeoutSeconds} s timeout. The configured fallback holds the last setpoint of ${kW(o.lastSetpointW)} kW; the limits below it still apply.`
        : `Telemetry is ${o.telemetryAgeSeconds.toFixed(0)} s old, past the ${policy.telemetryTimeoutSeconds} s timeout. The configured fallback stops dispatching rather than deciding on figures it cannot see.`,
      observed, hold: held ? null : 'Telemetry too old to decide on',
    };
  }

  const relay = (w: number, rule: string, explanation: string): EmsRequest => {
    const reduced = Math.abs(w) > o.plantRatedW + 1e-9;
    return {
      requestedW: cap(w), goal, rule, usedFallback: false, observed, hold: null,
      action: reduced ? 'reduce' : w > 0 ? 'discharge' : w < 0 ? 'charge' : 'hold',
      reducedFromW: reduced ? w : null,
      explanation: reduced
        ? `${explanation} Reduced to the converter's ${kW(o.plantRatedW)} kW rating: ${kW(w)} kW was asked for, and asking for more than the plant can do does not make it happen.`
        : explanation,
    };
  };
  const holding = (rule: string, explanation: string, name: string | null = null): EmsRequest =>
    ({ requestedW: 0, goal, action: 'hold', rule, usedFallback: false, explanation, observed, hold: name, reducedFromW: null });

  // Below the floor, nothing discharges. Every policy is subject to this, which is why it is here
  // rather than repeated in four places with four chances to be forgotten.
  const protectedEnergy = (wanted: number) => wanted > 0 && o.soc <= floor;
  const refusal = () => holding(
    `reserve/${o.islanded ? 'emergency-floor' : 'normal'}`,
    `Holding: the charge is at ${pct(o.soc)}, which is ${o.islanded ? 'the emergency floor' : 'the reserve'} of ${(floor * 100).toFixed(0)}%. ${o.islanded ? 'Even in an outage there is a floor below which the battery is not taken.' : 'Discharging past the reserve is what an outage is for.'}`,
    'Reserve held back',
  );

  switch (policy.policy) {
    case 'manual': {
      const wanted = o.manualRequestW;
      if (protectedEnergy(wanted)) return refusal();
      if (wanted === 0) return holding('manual/idle', 'Idle: nothing has been asked of the plant.');
      return relay(wanted, 'manual/relay',
        `Relaying the request for ${kW(wanted)} kW ${wanted > 0 ? 'out of' : 'into'} the battery. The converter and the battery management system decide what of it is possible.`);
    }

    case 'peak-shaving': {
      if (o.siteLoadW === null) {
        return holding('peak-shaving/no-load-telemetry',
          'No site load is being reported, and a target cannot be shaved against a figure that is not there.', 'No site telemetry');
      }
      const target = policy.peakTargetW ?? 0;
      const excess = o.siteLoadW - target;
      if (excess > 0) {
        if (protectedEnergy(excess)) return refusal();
        return relay(excess, 'peak-shaving/above-target',
          `Site demand is ${kW(o.siteLoadW)} kW against a target of ${kW(target)} kW. ergOS requests ${kW(Math.min(excess, o.plantRatedW))} kW of discharge to hold the import at the target.`);
      }
      if (o.soc >= 1) return holding('peak-shaving/full', `Site demand is ${kW(o.siteLoadW)} kW, under the ${kW(target)} kW target, and the battery is full.`);
      const room = -excess;
      return relay(-room, 'peak-shaving/refill-below-target',
        `Site demand is ${kW(o.siteLoadW)} kW, ${kW(room)} kW under the ${kW(target)} kW target. ergOS charges into that room only, so refilling never sets a new peak.`);
    }

    case 'self-consumption': {
      if (o.generationW === null) {
        return holding('self-consumption/no-generation-telemetry',
          'No generation is being reported. Storing surplus needs a surplus that somebody measured.', 'No generation telemetry');
      }
      const load = o.siteLoadW ?? 0;
      const surplus = o.generationW - load;
      if (surplus > 0) {
        if (o.soc >= 1) return holding('self-consumption/full',
          `${kW(surplus)} kW of generation is surplus to the site, but the battery is full; the rest is exported.`);
        return relay(-surplus, 'self-consumption/store-surplus',
          `Generation is ${kW(o.generationW)} kW against a site load of ${kW(load)} kW. ergOS charges with the ${kW(surplus)} kW surplus rather than exporting it, and never imports to do so.`);
      }
      const deficit = -surplus;
      if (deficit === 0) return holding('self-consumption/matched', 'Generation matches the site load exactly; there is nothing to store and nothing to cover.');
      if (protectedEnergy(deficit)) return refusal();
      return relay(deficit, 'self-consumption/cover-deficit',
        `Generation is ${kW(o.generationW)} kW against a site load of ${kW(load)} kW. ergOS discharges ${kW(Math.min(deficit, o.plantRatedW))} kW to cover the shortfall instead of importing it.`);
    }

    case 'backup-reserve': {
      // Readiness first, economics never. This policy exists to be full when it is needed.
      if (o.soc < policy.reserveSoc) {
        return relay(-o.plantRatedW, 'backup-reserve/restore',
          `Charge is at ${pct(o.soc)}, below the ${pct(policy.reserveSoc)} the site keeps for an outage. ergOS charges to restore readiness before anything else is considered.`);
      }
      if (o.manualRequestW > 0 && o.soc <= policy.reserveSoc && !o.islanded) return refusal();
      if (o.manualRequestW !== 0) {
        if (protectedEnergy(o.manualRequestW)) return refusal();
        return relay(o.manualRequestW, 'backup-reserve/spend-surplus',
          `Charge is at ${pct(o.soc)}, above the ${pct(policy.reserveSoc)} reserve. Only what is above the reserve may be spent, and ${kW(o.manualRequestW)} kW was asked for.`);
      }
      return holding('backup-reserve/hold-ready',
        `Charge is at ${pct(o.soc)}, at or above the ${pct(policy.reserveSoc)} reserve. ergOS holds it there and waits.`);
    }

    case 'price-schedule': {
      const hour = hourOfDay(o.atSeconds);
      observed.hourOfDay = hour;
      const window = policy.priceWindows.find(w => hour >= w.fromHour && hour < w.toHour);
      if (!window) return holding('price-schedule/no-window', `Hour ${hour.toFixed(1)} falls outside every declared window, so the schedule asks for nothing.`);
      observed.windowPricePerMWh = window.pricePerMWh;
      if (window.action === 'hold') return holding(`price-schedule/hold@${window.fromHour}`,
        `Hour ${hour.toFixed(1)} is inside the ${window.fromHour}–${window.toHour} window, which is a holding window at ${window.pricePerMWh} per MWh.`);
      const wanted = (window.action === 'discharge' ? o.plantRatedW : -o.plantRatedW) * window.powerFraction;
      observed.windowPowerFraction = window.powerFraction;
      if (protectedEnergy(wanted)) return refusal();
      return relay(wanted, `price-schedule/${window.action}@${window.fromHour}`,
        `Hour ${hour.toFixed(1)} is inside the ${window.fromHour}–${window.toHour} window at ${window.pricePerMWh} per MWh, which the schedule marks for ${window.action === 'discharge' ? 'discharging' : 'charging'} at ${kW(wanted)} kW. Prices are illustrative.`);
    }
  }
}

/**
 * What the plant does when there is no grid, decided locally.
 *
 * §11.2: no-break control may never depend on the supervisory layer or on a cloud response. So an
 * island is not a policy decision at all — the converter forms the island and follows the site
 * load, and this function is what the engine calls instead of the policy while that is true. It
 * takes no telemetry age, no price and no schedule, because it must work when all of those are
 * gone.
 */
export function localIslandControl(o: {
  siteLoadW: number | null; generationW: number | null; auxiliaryW: number; plantRatedW: number;
}): EmsRequest {
  // Everything on the island is on the island: the site's load, its generation, and the plant's own
  // auxiliaries, which nobody else is going to carry once the connection has gone.
  const load = o.siteLoadW ?? 0, gen = o.generationW ?? 0;
  const balance = load + o.auxiliaryW - gen;
  const target = Math.max(-o.plantRatedW, Math.min(o.plantRatedW, balance));
  return {
    requestedW: target, goal: 'Hold the site up while the grid is absent.',
    action: target > 0 ? 'discharge' : target < 0 ? 'charge' : 'hold',
    rule: 'local/island', usedFallback: false, reducedFromW: null,
    explanation: `The grid is absent. The converter is forming the island and following it locally: ${kW(load)} kW of site load and ${kW(o.auxiliaryW)} kW of the plant's own auxiliaries, less ${kW(gen)} kW of generation. No supervisory decision and no network round trip stands between the load and the battery.`,
    observed: { siteLoadW: load, generationW: gen, auxiliaryW: o.auxiliaryW, islandBalanceW: balance, localControl: 1 },
    hold: null,
  };
}
