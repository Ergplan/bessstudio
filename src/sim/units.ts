/**
 * Units, and the refusal to mix them.
 *
 * §13.3 of the specification names the trap this module exists to close: never silently mix watts
 * with megawatts, amp-hours with megawatt-hours, or cell parameters with pack parameters. A
 * simulator that gets that wrong produces confident nonsense, and the arithmetic looks fine all
 * the way through.
 *
 * Two defences, and they work together:
 *
 *   1. **One canonical unit per quantity**, carried everywhere inside the engine — watts, watt-
 *      hours, amps, volts, seconds, degrees Celsius. Nothing inside the simulator is ever in
 *      kilowatts or in hours.
 *   2. **A brand on the type**, so a number in watts cannot be assigned where watt-hours are
 *      wanted without the compiler objecting. The brand is erased at runtime; it costs nothing.
 *
 * Values enter through a constructor that names the unit it was given — `kW(2.5)`, `minutes(30)` —
 * and leave through a reader that names the unit it wants — `asMW(p)`, `asHours(t)`. There is no
 * way to spell a bare conversion factor in calling code, which is the point.
 */

declare const quantity: unique symbol;

/** A number that knows which physical quantity it measures. The brand exists only at compile time. */
export type Q<K extends string> = number & { readonly [quantity]: K };

export type Watts = Q<'W'>;
export type WattHours = Q<'Wh'>;
export type Amps = Q<'A'>;
export type AmpHours = Q<'Ah'>;
export type Volts = Q<'V'>;
export type Seconds = Q<'s'>;
export type Celsius = Q<'degC'>;
export type Ohms = Q<'ohm'>;
/** Apparent power. Kept distinct from watts: a converter's S and its P are not interchangeable. */
export type VoltAmperes = Q<'VA'>;
/** Reactive power, likewise. */
export type Vars = Q<'var'>;
/** A dimensionless fraction in [0, 1] — a state of charge, an efficiency, a share. */
export type Fraction = Q<'1'>;

const brand = <K extends string>(n: number): Q<K> => n as Q<K>;

/** The canonical unit each quantity is carried in inside the engine. */
export const canonicalUnit = {
  W: 'W', Wh: 'Wh', A: 'A', Ah: 'Ah', V: 'V', s: 's', degC: '°C', ohm: 'Ω', VA: 'VA', var: 'var', '1': '',
} as const;

/* ---------------------------------------------------------------- power ---- */
export const W = (n: number): Watts => brand(n);
export const kW = (n: number): Watts => brand(n * 1e3);
export const MW = (n: number): Watts => brand(n * 1e6);
export const asW = (p: Watts): number => p;
export const asKW = (p: Watts): number => p / 1e3;
export const asMW = (p: Watts): number => p / 1e6;

export const VA = (n: number): VoltAmperes => brand(n);
export const kVA = (n: number): VoltAmperes => brand(n * 1e3);
export const asKVA = (s: VoltAmperes): number => s / 1e3;

export const VAr = (n: number): Vars => brand(n);
export const kVAr = (n: number): Vars => brand(n * 1e3);
export const asKVAr = (q: Vars): number => q / 1e3;

/* --------------------------------------------------------------- energy ---- */
export const Wh = (n: number): WattHours => brand(n);
export const kWh = (n: number): WattHours => brand(n * 1e3);
export const MWh = (n: number): WattHours => brand(n * 1e6);
export const asWh = (e: WattHours): number => e;
export const asKWh = (e: WattHours): number => e / 1e3;
export const asMWh = (e: WattHours): number => e / 1e6;

/* -------------------------------------------------------------- current ---- */
export const A = (n: number): Amps => brand(n);
export const asA = (i: Amps): number => i;
export const Ah = (n: number): AmpHours => brand(n);
export const asAh = (c: AmpHours): number => c;

/* -------------------------------------------------------------- voltage ---- */
export const V = (n: number): Volts => brand(n);
export const asV = (u: Volts): number => u;

export const ohm = (n: number): Ohms => brand(n);
export const milliohm = (n: number): Ohms => brand(n / 1e3);
export const asOhm = (r: Ohms): number => r;
export const asMilliohm = (r: Ohms): number => r * 1e3;

/* ----------------------------------------------------------------- time ---- */
export const seconds = (n: number): Seconds => brand(n);
export const minutes = (n: number): Seconds => brand(n * 60);
export const hours = (n: number): Seconds => brand(n * 3600);
export const asSeconds = (t: Seconds): number => t;
export const asMinutes = (t: Seconds): number => t / 60;
export const asHours = (t: Seconds): number => t / 3600;

/* ---------------------------------------------------------- temperature ---- */
export const degC = (n: number): Celsius => brand(n);
export const asDegC = (t: Celsius): number => t;
/** Kelvin, for anywhere an Arrhenius term needs an absolute temperature. */
export const asKelvin = (t: Celsius): number => t + 273.15;

/* ------------------------------------------------------------- fraction ---- */
export const fraction = (n: number): Fraction => brand(n);
export const percent = (n: number): Fraction => brand(n / 100);
export const asFraction = (f: Fraction): number => f;
export const asPercent = (f: Fraction): number => f * 100;

/* ------------------------------------------------------- the conversions --- */

/**
 * Energy from power held for a time. The only sanctioned way to turn one into the other, so a
 * stray `* dt` in hours against a power in watts cannot happen.
 */
export const energyOver = (p: Watts, t: Seconds): WattHours => brand((p as number) * (t as number) / 3600);

/** Power that would deliver this energy over this time. Zero time has no answer and says so. */
export const powerOver = (e: WattHours, t: Seconds): Watts => {
  if (!(t > 0)) throw new RangeError('Power over zero time is undefined.');
  return brand((e as number) * 3600 / (t as number));
};

/** Charge drawn at a current for a time. */
export const chargeOver = (i: Amps, t: Seconds): AmpHours => brand((i as number) * (t as number) / 3600);

/**
 * Energy in a store of this charge at this voltage.
 *
 * Amp-hours are not energy, and this is the only place the application is allowed to pretend
 * otherwise — with a voltage named explicitly, so the reader can see which voltage was assumed.
 */
export const energyAt = (c: AmpHours, u: Volts): WattHours => brand((c as number) * (u as number));

/** Charge that this energy represents at this voltage. */
export const chargeAt = (e: WattHours, u: Volts): AmpHours => {
  if (!(u > 0)) throw new RangeError('Charge at zero voltage is undefined.');
  return brand((e as number) / (u as number));
};

/** Power delivered at this voltage and current. */
export const powerAt = (u: Volts, i: Amps): Watts => brand((u as number) * (i as number));

/** Current needed to move this power at this voltage. */
export const currentAt = (p: Watts, u: Volts): Amps => {
  if (!(u > 0)) throw new RangeError('Current at zero voltage is undefined.');
  return brand((p as number) / (u as number));
};

/** Apparent power from active and reactive. */
export const apparent = (p: Watts, q: Vars): VoltAmperes => brand(Math.hypot(p as number, q as number));

/* ------------------------------------------------------ cell against pack -- */

/**
 * Pack quantities from cell quantities, with the topology named.
 *
 * A cell figure used where a pack figure belongs is the other half of the §13.3 trap, and it is
 * harder to catch than a factor of a thousand because the answer looks plausible. These are the
 * only sanctioned way across, and each one states which way the topology multiplies.
 */
export type Topology = { series: number; parallel: number };

export const packVoltage = (cell: Volts, t: Topology): Volts => brand((cell as number) * t.series);
export const packCurrent = (cell: Amps, t: Topology): Amps => brand((cell as number) * t.parallel);
export const packCapacity = (cell: AmpHours, t: Topology): AmpHours => brand((cell as number) * t.parallel);
export const packEnergy = (cell: WattHours, t: Topology): WattHours => brand((cell as number) * t.series * t.parallel);
export const packResistance = (cell: Ohms, t: Topology): Ohms => brand((cell as number) * t.series / t.parallel);

export const cellsIn = (t: Topology) => t.series * t.parallel;
