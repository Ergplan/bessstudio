import type { Converter } from './records';

/**
 * The converter: what it can do, and which bound says so.
 *
 * §12.3 is emphatic on one point and this module exists for it: **the capability circle alone is
 * insufficient.** A converter is rated in apparent power, so reactive power eats into the active
 * power available — that much is the circle. But a real converter is usually bounded tighter than
 * the circle by its own current limit, and at the bottom of its DC window it is bounded tighter
 * still, because the same kilowatts have to arrive as more amps. A model that enforces only
 * `P² + Q² ≤ S²` will confidently promise power the hardware cannot pass.
 *
 * So every bound is computed, the tightest one wins, and the winner is named. That is also what
 * fixture F03 checks: sixty kvar out of a hundred kVA leaves eighty kilowatts, and then a stricter
 * current limit has to take precedence over it.
 */

export type PcsBound = {
  /** The ceiling on active power, in watts, unsigned. */
  activeW: number;
  /** What set it, in the words shown to a reader. */
  name: string;
  reason: string;
};

/** Every ceiling the converter puts on active power at this operating point. */
export function activePowerBounds(c: Converter, args: {
  /** Reactive power being commanded, unsigned — its sign does not change how much room it takes. */
  reactiveVar: number;
  /** The DC voltage the battery is presenting. */
  dcVoltageV: number;
  /** Cell or coolant temperature the converter derates against. */
  tempC: number;
  direction: 'charge' | 'discharge';
}): PcsBound[] {
  const q = Math.abs(args.reactiveVar);
  const out: PcsBound[] = [];

  // 1. The nameplate active rating, derated for temperature.
  const over = Math.max(0, args.tempC - c.deratingStartC);
  const derated = c.ratedW * Math.max(0, 1 - over * c.deratingPerC);
  out.push({
    activeW: derated,
    name: derated < c.ratedW ? 'Converter rating, derated' : 'Converter rating',
    reason: derated < c.ratedW
      ? `Rated ${Math.round(c.ratedW / 1e3)} kW, derated to ${Math.round(derated / 1e3)} kW at ${args.tempC.toFixed(1)} °C.`
      : `Rated ${Math.round(c.ratedW / 1e3)} kW.`,
  });

  // 2. The capability circle. Apparent power is the rating; reactive power takes its share first.
  const circle = q >= c.ratedVA ? 0 : Math.sqrt(c.ratedVA * c.ratedVA - q * q);
  out.push({
    activeW: circle,
    name: 'Apparent power capability',
    reason: q > 0
      ? `${Math.round(c.ratedVA / 1e3)} kVA of capability with ${Math.round(q / 1e3)} kvar commanded leaves ${Math.round(circle / 1e3)} kW of active power.`
      : `${Math.round(c.ratedVA / 1e3)} kVA of capability, none of it taken by reactive power.`,
  });

  // 3. The DC current limit, which is where the circle stops being the whole story. The same
  //    active power costs more amps at a lower DC voltage, so this bound tightens as the battery
  //    empties — and on many converters it is binding long before the circle is.
  const efficiency = args.direction === 'discharge' ? c.dischargeEfficiency : c.chargeEfficiency;
  const dcW = c.dcMaxA * args.dcVoltageV;
  const currentBound = args.direction === 'discharge' ? dcW * efficiency : dcW / efficiency;
  out.push({
    activeW: currentBound,
    name: 'Converter DC current limit',
    reason: `${c.dcMaxA} A at ${Math.round(args.dcVoltageV)} V on the DC side is ${Math.round(currentBound / 1e3)} kW of active power.`,
  });

  // 4. The DC window. Outside it the converter does not operate at all, which is a ceiling of zero
  //    rather than a smaller number.
  const outside = args.dcVoltageV < c.dcMinV || args.dcVoltageV > c.dcMaxV;
  if (outside) {
    out.push({
      activeW: 0,
      name: 'Converter DC window',
      reason: `${Math.round(args.dcVoltageV)} V is outside the ${c.dcMinV}–${c.dcMaxV} V the converter operates in.`,
    });
  }

  return out;
}

/** The tightest of them, with the rest ordered behind it so a reader can see what was close. */
export function activePowerCeiling(c: Converter, args: Parameters<typeof activePowerBounds>[1]) {
  const bounds = activePowerBounds(c, args);
  const ordered = [...bounds].sort((a, b) => a.activeW - b.activeW);
  return { ceiling: ordered[0], ordered };
}

/* ----------------------------------------------------------- the states --- */

/**
 * §12.3 asks for explicit states, each identifying which subsystem owns the transition into it.
 * The owner matters because a converter sitting in `derated` because the battery management system
 * told it to is a different fact from one derating on its own temperature, and a learner asking
 * "why is it only giving me half?" is asking exactly that.
 */
export const pcsStates = ['standby', 'precharge', 'ready', 'charging', 'discharging', 'derated', 'faulted', 'recovery'] as const;
export type PcsState = (typeof pcsStates)[number];

export const pcsStateOwner: Record<PcsState, 'PCS' | 'BMS' | 'EMS'> = {
  standby: 'EMS', precharge: 'PCS', ready: 'PCS', charging: 'EMS', discharging: 'EMS',
  derated: 'PCS', faulted: 'PCS', recovery: 'PCS',
};

export const pcsStateMeaning: Record<PcsState, string> = {
  standby: 'Energised but not dispatching. The auxiliaries and the converter’s own standby draw still run.',
  precharge: 'Bringing the DC link up to the battery’s voltage before the contactors close, so nothing sees an inrush.',
  ready: 'Contactors closed, waiting for a setpoint.',
  charging: 'Taking power from the connection and putting it into the battery.',
  discharging: 'Taking power from the battery and putting it onto the connection.',
  derated: 'Dispatching below what was asked, because a limit is holding it back — at the extreme, to nothing at all.',
  faulted: 'Stopped by a protection. It will not dispatch until the fault clears and is reset.',
  recovery: 'The fault has cleared and the converter is coming back, but is not yet at full output.',
};

export type PcsInput = {
  requestedW: number;
  achievedW: number;
  /** True while the battery management system has opened the contactors or vetoed dispatch. */
  vetoed: boolean;
  /** Seconds the converter has been energised in this run. */
  elapsedSeconds: number;
  prechargeSeconds: number;
  /** How close achieved has to be to requested before it counts as met, as a fraction. */
  tolerance: number;
};

/**
 * The state the converter is in, given what it was asked and what it managed.
 *
 * Deliberately a function of the present rather than a machine holding its own memory: the only
 * history that matters here is how long the converter has been energised, and keeping it that way
 * means a run is reproducible from its inputs without a hidden latch somewhere.
 */
export function pcsState(i: PcsInput): PcsState {
  if (i.vetoed) return 'faulted';
  if (i.elapsedSeconds < i.prechargeSeconds) return 'precharge';
  if (i.requestedW === 0) return i.achievedW === 0 ? 'standby' : 'ready';
  const met = Math.abs(i.achievedW) >= Math.abs(i.requestedW) * (1 - i.tolerance);
  if (!met) return 'derated';
  return i.achievedW > 0 ? 'discharging' : 'charging';
}
