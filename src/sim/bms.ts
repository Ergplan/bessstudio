import type { CellParameters, SimEvent } from './records';

/**
 * The battery management system.
 *
 * §12.4 asks for an explicit supervisory state machine, and names what a user must come away
 * understanding. Three things, and each one shapes the model:
 *
 *   - **Why a healthy average pack state of charge does not override one limiting cell.** So the
 *     protections read *extrema*, never averages. A pack at 60% with one cell at 8% is a pack that
 *     stops discharging, and the reason the interface gives is that one cell.
 *   - **Why balancing is slow.** So the balancing current is modelled at its real order of
 *     magnitude — tens or hundreds of milliamps against a cell that passes a hundred and fifty
 *     amps — and the time to close a spread falls out of that rather than being asserted.
 *   - **Why a battery management system reduces power *before* it trips.** So every protection has
 *     a band it derates across before it has a limit it trips at, and a trip needs the limit to be
 *     held past for a stated time rather than touched once.
 *
 * Thresholds, delays, hysteresis and latching are all data, with the provenance of each stated,
 * because §12.4 requires them to be configurable and because a protection whose numbers are buried
 * in a conditional cannot be reviewed by the person whose equipment it claims to describe.
 *
 * What this is not: vendor firmware, and not a safety certification. §12.4 says so and so does the
 * badge on every result that carries it.
 */

export type ProtectionSignal =
  | 'cellVoltageMax' | 'cellVoltageMin' | 'cellTempMax' | 'cellTempMin'
  | 'chargeCurrent' | 'dischargeCurrent' | 'communication' | 'insulation' | 'contactor';

export type Protection = {
  code: string;
  label: string;
  signal: ProtectionSignal;
  /** Whether the fault is the signal going above the numbers below, or below them. */
  direction: 'above' | 'below';
  /** Derating begins here and reaches nothing at `derateTo`. This is the "before it trips" part. */
  derateFrom: number;
  derateTo: number;
  /** The hard limit, and how long it has to be held past before the contactors open. */
  tripAt: number;
  tripAfterSeconds: number;
  /** How far back the signal must come before the alarm clears. The hysteresis band. */
  resetAt: number;
  /** A latching fault stays raised after the signal recovers, until it is reset deliberately. */
  latching: boolean;
  /** Which direction of current it restrains. An overvoltage stops charging, not discharging. */
  restrains: 'charge' | 'discharge' | 'both';
  /** Where the numbers came from. Required, because a threshold with no provenance is a guess. */
  provenance: string;
};

export const bmsStates = ['normal', 'warning', 'derating', 'alarm', 'tripped'] as const;
export type BmsState = (typeof bmsStates)[number];

/** What each state means to somebody reading it off a screen, in the words §12.4 asks for. */
export const bmsStateMeaning: Record<BmsState, string> = {
  normal: 'Every measured signal is inside its band. Nothing is being held back.',
  warning: 'A signal has entered the band where the management system starts watching it, but the permitted current is unchanged.',
  derating: 'A signal is far enough out that the permitted current is being reduced in proportion. The plant still runs, below what was asked.',
  alarm: 'A signal is past its trip point. The permitted current is nothing, and the contactors open if it stays there.',
  tripped: 'The contactors are open. Nothing flows in either direction until the fault clears and, if it latched, until it is reset.',
};

/** Escalation order, so a pack with two things wrong reports the worse one. */
const severityRank: Record<BmsState, number> = { normal: 0, warning: 1, derating: 2, alarm: 3, tripped: 4 };

export type PackSignals = {
  /** Extrema across the cells, never averages. This is the point. */
  cellVoltageMax: number;
  cellVoltageMin: number;
  cellTempMax: number;
  cellTempMin: number;
  /** Signed, positive on discharge, per the application convention. Per cell. */
  cellCurrentA: number;
  /** False while the plant is not hearing from the management system. */
  communicationOk: boolean;
  insulationOk: boolean;
  contactorOk: boolean;
};

/** What the management system remembers between one evaluation and the next. */
export type BmsMemory = {
  /** Seconds each protection has been held past its trip point. */
  heldSeconds: Record<string, number>;
  /** Faults that have latched and will not clear on their own. */
  latched: Record<string, boolean>;
  /** Protections currently raised, so the hysteresis band can be applied on the way back. */
  raised: Record<string, boolean>;
  /** Charge moved by balancing, in amp-hours, and what it cost. */
  balancedAh: number;
  balancingLossWh: number;
  /** Drift accumulated by the counted state of charge against the true one. */
  countingDriftSoc: number;
  /** Which protections were tripped when the last evaluation finished, so a trip is announced once. */
  trippedLast?: Record<string, boolean>;
};

export const newMemory = (): BmsMemory => ({
  heldSeconds: {}, latched: {}, raised: {}, balancedAh: 0, balancingLossWh: 0, countingDriftSoc: 0,
});

export type BmsVerdict = {
  state: BmsState;
  /** Multipliers on the permitted current in each direction, between nothing and everything. */
  chargeFactor: number;
  dischargeFactor: number;
  /** True when the contactors are open. Nothing flows in either direction. */
  open: boolean;
  /** The protection doing the restraining, where one is. */
  binding: Protection | null;
  events: SimEvent[];
};

const signalOf = (s: PackSignals, signal: ProtectionSignal): number => {
  switch (signal) {
    case 'cellVoltageMax': return s.cellVoltageMax;
    case 'cellVoltageMin': return s.cellVoltageMin;
    case 'cellTempMax': return s.cellTempMax;
    case 'cellTempMin': return s.cellTempMin;
    case 'chargeCurrent': return Math.max(0, -s.cellCurrentA);
    case 'dischargeCurrent': return Math.max(0, s.cellCurrentA);
    case 'communication': return s.communicationOk ? 0 : 1;
    case 'insulation': return s.insulationOk ? 0 : 1;
    case 'contactor': return s.contactorOk ? 0 : 1;
  }
};

/** How much of the permitted current survives this protection, between one and nothing. */
function factorFor(p: Protection, value: number): number {
  const beyond = p.direction === 'above' ? value - p.derateFrom : p.derateFrom - value;
  if (beyond <= 0) return 1;
  const span = Math.abs(p.derateTo - p.derateFrom);
  if (span <= 0) return 0;
  return Math.max(0, 1 - beyond / span);
}

const past = (p: Protection, value: number, threshold: number) =>
  (p.direction === 'above' ? value >= threshold : value <= threshold);

/**
 * Evaluate every protection against the signals, and say what the plant is allowed to do.
 *
 * The memory is updated in place, because it is the state machine's state and threading it through
 * a return value would only invite a caller to forget it. Events come out ordered — worst first,
 * then by code — so that a pack with a high cell and a hot cell in the same step always reports
 * them the same way round. §17.2 asks for event ordering to be tested and an order that depends on
 * the iteration order of an object is not one.
 */
export function evaluate(
  protections: Protection[], signals: PackSignals, memory: BmsMemory, seconds: number, atSeconds: number,
): BmsVerdict {
  let state: BmsState = 'normal';
  let chargeFactor = 1, dischargeFactor = 1;
  let open = false;
  let binding: Protection | null = null;
  let bindingFactor = 1;
  const events: SimEvent[] = [];
  const tripping = new Set<string>();
  const raise = (s: BmsState) => { if (severityRank[s] > severityRank[state]) state = s; };

  for (const p of protections) {
    const value = signalOf(signals, p.signal);
    const wasRaised = memory.raised[p.code] ?? false;
    const wasLatched = memory.latched[p.code] ?? false;

    // Hysteresis: a protection that has been raised stays raised until the signal comes back past
    // its *reset* point, which sits further back than the point that raised it. Without that band
    // a signal sitting on a threshold chatters, raising and clearing every step.
    memory.raised[p.code] = wasRaised ? !hasRecovered(p, value) : past(p, value, p.derateFrom);

    // Delay: a limit touched once is not a trip. It has to be held past for the stated time, and
    // the clock only resets once the signal has come back past the reset point.
    const beyond = past(p, value, p.tripAt);
    if (beyond) memory.heldSeconds[p.code] = (memory.heldSeconds[p.code] ?? 0) + seconds;
    else if (hasRecovered(p, value)) memory.heldSeconds[p.code] = 0;

    if (beyond && (memory.heldSeconds[p.code] ?? 0) >= p.tripAfterSeconds && p.latching) memory.latched[p.code] = true;
    // A latching fault stays tripped until it is reset deliberately; a non-latching one lets go
    // as soon as its signal recovers.
    const tripped = p.latching
      ? (memory.latched[p.code] ?? false)
      : beyond && (memory.heldSeconds[p.code] ?? 0) >= p.tripAfterSeconds;
    const newlyTripped = tripped && !wasLatched && !(wasRaised && !p.latching && severityWasTrip(memory, p.code));

    const factor = tripped ? 0 : factorFor(p, value);

    if (tripped) {
      tripping.add(p.code);
      open = true;
      raise('tripped');
      if (newlyTripped) events.push(event(p, atSeconds, 'trip', `${p.label} tripped: the limit of ${p.tripAt} was held past for ${p.tripAfterSeconds} s. ${contactorNote(p)}`));
    } else if (factor <= 0) {
      raise('alarm');
      if (!wasRaised) events.push(event(p, atSeconds, 'alarm', `${p.label} has reached ${format(value)} and permits nothing in this direction. ${p.provenance}`));
    } else if (factor < 1) {
      raise('derating');
      if (!wasRaised) events.push(event(p, atSeconds, 'limit', `${p.label} is at ${format(value)} and the permitted current is being reduced to ${(factor * 100).toFixed(0)}% before anything trips. ${p.provenance}`));
    } else if (wasRaised) {
      raise('warning');
      events.push(event(p, atSeconds, 'info', `${p.label} has recovered to ${format(value)}, past its reset point of ${p.resetAt}.`));
    }

    if (p.restrains !== 'discharge') chargeFactor = Math.min(chargeFactor, factor);
    if (p.restrains !== 'charge') dischargeFactor = Math.min(dischargeFactor, factor);
    if (factor < bindingFactor) { bindingFactor = factor; binding = p; }
  }

  // Worst first, then by code, so the same pack always reports the same order. §17.2 asks for
  // event ordering to be tested, and an order that depends on how an object iterates is not one.
  const rank = { trip: 0, alarm: 1, limit: 2, info: 3 } as const;
  events.sort((a, b) => rank[a.severity] - rank[b.severity] || a.code.localeCompare(b.code));
  memory.trippedLast = Object.fromEntries(protections.map(p => [p.code, tripping.has(p.code)]));
  return { state, chargeFactor, dischargeFactor, open, binding, events };
}

/** Whether this protection was already tripped when the last evaluation finished. */
const severityWasTrip = (memory: BmsMemory, code: string) => (memory.trippedLast?.[code] ?? false);

const hasRecovered = (p: Protection, value: number) =>
  (p.direction === 'above' ? value < p.resetAt : value > p.resetAt);

const format = (n: number) => (Math.abs(n) >= 100 ? n.toFixed(0) : n.toFixed(3));

const contactorNote = (p: Protection) =>
  (p.latching ? 'The contactors are open and stay open until the fault is cleared and reset deliberately.' : 'The contactors are open and will close again once the signal recovers.');

const event = (p: Protection, atSeconds: number, severity: SimEvent['severity'], message: string): SimEvent => ({
  atSeconds, owner: 'BMS', severity, code: p.code, message,
  latched: p.latching && severity === 'trip',
  clearsWhen: p.latching
    ? `${p.label} comes back past ${p.resetAt} and the fault is reset.`
    : `${p.label} comes back past ${p.resetAt}.`,
});

/** Reset every latched fault whose signal has recovered. What a person does after a trip. */
export function reset(protections: Protection[], signals: PackSignals, memory: BmsMemory): string[] {
  const cleared: string[] = [];
  for (const p of protections) {
    if (!memory.latched[p.code]) continue;
    if (hasRecovered(p, signalOf(signals, p.signal))) {
      memory.latched[p.code] = false; memory.heldSeconds[p.code] = 0; memory.raised[p.code] = false;
      if (memory.trippedLast) memory.trippedLast[p.code] = false;
      cleared.push(p.label);
    }
  }
  return cleared;
}

/* ------------------------------------------------------------ balancing --- */

export type Balancing = {
  kind: 'passive' | 'active';
  /** What one balancing channel can move or burn. Milliamps, against a cell that passes hundreds of amps. */
  currentA: number;
  /** Balancing only runs above this state of charge, where the voltage curve is steep enough to read. */
  aboveSoc: number;
  /** And only when the cells are further apart than this. */
  spreadV: number;
  provenance: string;
};

/**
 * What balancing does in one step, and what it costs.
 *
 * Passive balancing burns the surplus in a resistor, so the energy is gone and the pack gets
 * slightly warmer. Active balancing moves it to another cell, so most of it survives. Either way
 * the current is two or three orders of magnitude below the working current, which is the whole
 * answer to "why is it taking so long".
 */
export function balance(b: Balancing, args: { soc: number; spreadV: number; cellV: number; seconds: number }, memory: BmsMemory) {
  const running = args.soc >= b.aboveSoc && args.spreadV >= b.spreadV;
  if (!running) return { running, movedAh: 0, lossWh: 0 };
  const movedAh = b.currentA * args.seconds / 3600;
  const lossWh = b.kind === 'passive' ? movedAh * args.cellV : movedAh * args.cellV * 0.2;
  memory.balancedAh += movedAh;
  memory.balancingLossWh += lossWh;
  return { running, movedAh, lossWh };
}

/** How long it would take to close a spread at this balancing current. The answer to "why so slow". */
export const hoursToBalance = (b: Balancing, spreadAh: number): number =>
  (b.currentA > 0 ? spreadAh / b.currentA : Number.POSITIVE_INFINITY);

/* ------------------------------------------------- counted against true --- */

/**
 * The state of charge the management system *believes*, against the one the model knows.
 *
 * §12.4 asks for coulomb counting with its drift explained, and for the limitation of inferring
 * LFP state of charge from voltage alone to be stated as the limitation it is. Both are here: the
 * count drifts at the sensor's offset, and it can only be re-anchored where the voltage curve is
 * steep enough to read — which on LFP means near empty or near full and nowhere in between.
 */
export type CountingError = {
  /** A current-sensor offset, in amps. Small, constant, and it integrates. */
  sensorOffsetA: number;
  /** Where the open-circuit curve is steep enough to re-anchor the count against. */
  anchorBelowSoc: number;
  anchorAboveSoc: number;
  provenance: string;
};

export function countedSoc(e: CountingError, args: { trueSoc: number; capacityAh: number; seconds: number }, memory: BmsMemory) {
  const canAnchor = args.trueSoc <= e.anchorBelowSoc || args.trueSoc >= e.anchorAboveSoc;
  if (canAnchor) memory.countingDriftSoc = 0;
  else memory.countingDriftSoc += e.sensorOffsetA * args.seconds / 3600 / args.capacityAh;
  return {
    counted: Math.min(1, Math.max(0, args.trueSoc + memory.countingDriftSoc)),
    driftSoc: memory.countingDriftSoc,
    anchored: canAnchor,
    why: canAnchor
      ? 'The count has been re-anchored: near this state of charge the cell voltage moves enough to read a state of charge off it.'
      : 'The count is drifting. Across the flat middle of an LFP curve the voltage says almost nothing about the state of charge, so there is nothing to correct it against.',
  };
}

/* ------------------------------------------------- the default protections */

/**
 * The protections the teaching plant runs with.
 *
 * Every number is an illustrative teaching value chosen to sit sensibly inside the cell's own
 * limits, and every one says so. A real installation's thresholds come from its own commissioning
 * documents, and this is not that.
 */
export function defaultProtections(cell: CellParameters): Protection[] {
  const illustrative = 'Illustrative threshold, set inside the cell’s stated limits. Not a commissioning document.';
  return [
    {
      code: 'cell-overvoltage', label: 'Cell overvoltage', signal: 'cellVoltageMax', direction: 'above',
      derateFrom: cell.maxV - 0.08, derateTo: cell.maxV, tripAt: cell.maxV + 0.05, tripAfterSeconds: 2,
      resetAt: cell.maxV - 0.15, latching: true, restrains: 'charge', provenance: illustrative,
    },
    {
      code: 'cell-undervoltage', label: 'Cell undervoltage', signal: 'cellVoltageMin', direction: 'below',
      derateFrom: cell.minV + 0.15, derateTo: cell.minV, tripAt: cell.minV - 0.05, tripAfterSeconds: 2,
      resetAt: cell.minV + 0.25, latching: true, restrains: 'discharge', provenance: illustrative,
    },
    {
      code: 'cell-overtemperature', label: 'Cell over-temperature', signal: 'cellTempMax', direction: 'above',
      derateFrom: cell.limits.dischargeTempC[1] - 10, derateTo: cell.limits.dischargeTempC[1],
      tripAt: cell.limits.dischargeTempC[1] + 3, tripAfterSeconds: 30,
      resetAt: cell.limits.dischargeTempC[1] - 15, latching: false, restrains: 'both', provenance: illustrative,
    },
    {
      code: 'cell-undertemperature', label: 'Cell under-temperature', signal: 'cellTempMin', direction: 'below',
      derateFrom: cell.limits.chargeTempC[0] + 5, derateTo: cell.limits.chargeTempC[0],
      tripAt: cell.limits.chargeTempC[0] - 5, tripAfterSeconds: 30,
      resetAt: cell.limits.chargeTempC[0] + 8, latching: false, restrains: 'charge', provenance: illustrative,
    },
    // The overcurrent protections are a **backstop above the permitted current**, not a second
    // opinion about it. The cell's stated continuous limit is what the plant is allowed to run at,
    // so a derate band that began below it would derate a plant working exactly as intended — and
    // then chatter, because reducing the current would clear the condition that reduced it.
    {
      code: 'charge-overcurrent', label: 'Charge overcurrent', signal: 'chargeCurrent', direction: 'above',
      derateFrom: cell.limits.chargeCurrentMaxA * 1.05, derateTo: cell.limits.chargeCurrentMaxA * 1.15,
      tripAt: cell.limits.chargeCurrentMaxA * 1.25, tripAfterSeconds: 1,
      resetAt: cell.limits.chargeCurrentMaxA, latching: false, restrains: 'charge', provenance: illustrative,
    },
    {
      code: 'discharge-overcurrent', label: 'Discharge overcurrent', signal: 'dischargeCurrent', direction: 'above',
      derateFrom: cell.limits.dischargeCurrentMaxA * 1.05, derateTo: cell.limits.dischargeCurrentMaxA * 1.15,
      tripAt: cell.limits.dischargeCurrentMaxA * 1.25, tripAfterSeconds: 1,
      resetAt: cell.limits.dischargeCurrentMaxA, latching: false, restrains: 'discharge', provenance: illustrative,
    },
    {
      code: 'communication-lost', label: 'Communication with the management system', signal: 'communication', direction: 'above',
      derateFrom: 0.5, derateTo: 1, tripAt: 1, tripAfterSeconds: 5, resetAt: 0.5,
      latching: false, restrains: 'both',
      provenance: 'A plant that cannot hear its battery management system stops dispatching. Illustrative delay.',
    },
    {
      code: 'insulation-alarm', label: 'Insulation monitor', signal: 'insulation', direction: 'above',
      derateFrom: 0.5, derateTo: 1, tripAt: 1, tripAfterSeconds: 0, resetAt: 0.5,
      latching: true, restrains: 'both',
      provenance: 'An insulation fault is not a thing to ride through. Illustrative; a real threshold is in ohms per volt.',
    },
    {
      code: 'contactor-fault', label: 'Contactor feedback', signal: 'contactor', direction: 'above',
      derateFrom: 0.5, derateTo: 1, tripAt: 1, tripAfterSeconds: 0, resetAt: 0.5,
      latching: true, restrains: 'both',
      provenance: 'A contactor that does not report the state it was commanded to is a fault, not a delay.',
    },
  ];
}

export const defaultBalancing = (): Balancing => ({
  kind: 'passive', currentA: 0.15, aboveSoc: 0.9, spreadV: 0.03,
  provenance: 'A hundred and fifty milliamps against a cell that passes a hundred and fifty amps: three orders of magnitude, which is why balancing is measured in days. Illustrative.',
});

export const defaultCountingError = (): CountingError => ({
  sensorOffsetA: 0.05, anchorBelowSoc: 0.08, anchorAboveSoc: 0.95,
  provenance: 'A small constant current-sensor offset. Illustrative; a real one depends on the sensor and its temperature.',
});
