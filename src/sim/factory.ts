/**
 * The factory, and what a battery does to its bill.
 *
 * The lessons teach a plant. They do not teach the thing a buyer in India is actually deciding,
 * which is not "how does a battery work" but "my site burns diesel during outages, replaces a
 * lead-acid bank every four years, exports solar at a third of what it buys it back for, and pays a
 * demand charge set by four hours in the evening — where does a battery help, and by how much?"
 *
 * That is four separate cost lines with four different arguments, and the interesting part is that
 * **one battery cannot serve all four at full value at once**. Energy held in reserve for an outage
 * is energy not available to shave the evening peak. Charge taken from surplus solar at noon is
 * charge not taken from the cheap off-peak window at night. The trade is the whole lesson, and it is
 * the same trade the studio's reserve and depth-of-discharge settings make on a real design.
 *
 * Every number in {@link teachingFactory} is a **teaching value**, in the sense §15.4 already fixes
 * for tariffs: plausible for an Indian industrial site and not a claim about any site, any DISCOM or
 * any diesel price. A real engagement replaces the fixture with the site's own bill, its own outage
 * log and its own solar generation, and the arithmetic below does not change when it does.
 */

/** What the site is and what it pays, before anything is installed. */
export type FactorySite = {
  id: string;
  label: string;
  /** Where it is, in words. Never used to infer a temperature — §15.4. */
  setting: string;
  workingDaysPerYear: number;

  // ---- The connection and the tariff -------------------------------------------------------
  /** Contracted maximum demand, in kVA, and the factor that turns it into working kilowatts. */
  contractDemandKVA: number;
  powerFactor: number;
  /** Recorded maximum demand the bill is actually charged on, in kVA. */
  recordedDemandKVA: number;
  demandChargeInrPerKVAMonth: number;
  /** Energy price in the three windows a time-of-day tariff splits the day into. */
  tariffInrPerKWh: { normal: number; peak: number; offPeak: number };
  /** The evening window the peak price applies in, and the load the site draws through it. */
  peakWindowHours: number;
  peakLoadKW: number;
  /** What the site draws the rest of the working day, and for how long. */
  baseLoadKW: number;
  baseHours: number;

  // ---- Diesel -------------------------------------------------------------------------------
  /** Minutes of grid outage on an average working day. */
  outageMinutesPerDay: number;
  /** The load that must keep running through one, which is not the whole site. */
  criticalLoadKW: number;
  dieselPriceInrPerLitre: number;
  /** Litres a generator burns per kilowatt-hour delivered, at the loading this site runs it at. */
  dgLitresPerKWh: number;
  /** Maintenance, oil and overhaul, per kilowatt-hour, which the fuel bill alone leaves out. */
  dgUpkeepInrPerKWh: number;

  // ---- The lead-acid bank it already owns ---------------------------------------------------
  /** Nameplate of the existing bank. Only about half of it is usable without wrecking its life. */
  leadAcidKWh: number;
  leadAcidUsablePortion: number;
  /** Installed cost of replacing it, and how often that falls due. */
  leadAcidInrPerKWh: number;
  leadAcidLifeYears: number;

  // ---- Solar --------------------------------------------------------------------------------
  solarKWp: number;
  /** Generation per kilowatt-peak per day, averaged over the year. A teaching value. */
  solarKWhPerKWpDay: number;
  /** What the exported unit earns, against the retail price of buying it back later. */
  exportInrPerKWh: number;
};

/** What the player installs and how they choose to use it. */
export type Moves = {
  bessPowerKW: number;
  bessEnergyKWh: number;
  /** The share of usable energy held back for an outage and not spent on the daily cycle. */
  reservePortion: number;
  /** Whether surplus solar is stored for the evening instead of exported. */
  shiftSolar: boolean;
  /** The recorded demand, in kVA, the site is trying to hold the meter under. Null to not try. */
  peakTargetKVA: number | null;
  /** Whether the lead-acid bank is retired rather than replaced at the end of its life. */
  retireLeadAcid: boolean;
};

export type CostLine = {
  id: 'grid-energy' | 'demand-charge' | 'diesel' | 'lead-acid' | 'solar-export';
  label: string;
  /** Rupees a year, before the battery. Negative for a credit, such as export income. */
  baselineInr: number;
  withBessInr: number;
  /** One sentence saying what moved, in the player's terms rather than the model's. */
  note: string;
};

export type FactoryYear = {
  lines: CostLine[];
  baselineTotalInr: number;
  withBessTotalInr: number;
  /** Before the battery is paid for. */
  grossSavingInr: number;
  bessCapexInr: number;
  bessUpkeepInr: number;
  /** After the battery's own annual cost. This is the number a finance director asks for. */
  netSavingInr: number;
  simplePaybackYears: number | null;
  /** How the one battery was divided between the duties asked of it. */
  allocation: {
    usableKWh: number;
    reserveKWh: number;
    cyclingKWh: number;
    backupNeedKWh: number;
    backupCoveredKWh: number;
    solarShiftedKWh: number;
    peakShavedKWh: number;
    peakShavedKVA: number;
  };
  /** Where the battery was asked for more than it had, named so the player can fix it. */
  shortfalls: string[];
  /** True but not a failure: what it could do more of, if it were larger. */
  notes: string[];
};

/**
 * The losses between a nameplate and a useful kilowatt-hour, and the money a kilowatt-hour costs.
 *
 * The same chain the sizing engine applies, at the teaching values the lessons use, declared here
 * rather than threaded in: this module answers a commercial question and must not quietly become a
 * second sizing engine that disagrees with the first.
 */
export const CHAIN = {
  usableWindow: 0.95,
  depthOfDischarge: 0.9,
  roundTrip: 0.88,
  /** Turnkey, installed, per kilowatt-hour of nameplate. A teaching value, not a quotation. */
  bessInrPerKWh: 22_000,
  /** Operations, maintenance and insurance, as a share of installed cost, each year. */
  upkeepPortion: 0.015,
} as const;

export const TEACHING_LABEL =
  'Every figure on this page is a teaching value — plausible for an Indian industrial site and a claim about none. A real site replaces them with its own bill, its own outage log and its own generation.';

/** One factory, carried through every round. */
export const teachingFactory: FactorySite = {
  id: 'factory-in', label: 'A 2.5 MVA engineering works',
  setting: 'Two shifts, six days a week, on an industrial feeder with a time-of-day tariff.',
  workingDaysPerYear: 300,
  contractDemandKVA: 2500, powerFactor: 0.95, recordedDemandKVA: 2300,
  demandChargeInrPerKVAMonth: 450,
  tariffInrPerKWh: { normal: 8.2, peak: 10.6, offPeak: 6.4 },
  peakWindowHours: 4, peakLoadKW: 1850,
  baseLoadKW: 950, baseHours: 12,
  outageMinutesPerDay: 45, criticalLoadKW: 600,
  dieselPriceInrPerLitre: 95, dgLitresPerKWh: 0.29, dgUpkeepInrPerKWh: 1.5,
  leadAcidKWh: 400, leadAcidUsablePortion: 0.5, leadAcidInrPerKWh: 9000, leadAcidLifeYears: 4,
  solarKWp: 3200, solarKWhPerKWpDay: 4.4, exportInrPerKWh: 3.0,
};

/**
 * The hours the fixture places things at. Assumptions, named, so a site can replace them.
 *
 * They are here rather than beside the day view because the year's arithmetic depends on them: how
 * much of an array's output a site exports is not a number anybody can assert independently of when
 * the site is working and when the sun is up. Asserting it is what a first version of this fixture
 * did, and it claimed a third of the generation left the gate on a site whose midday output never
 * once exceeded its own base load.
 */
export const DAY_SHAPE = {
  baseFrom: 6, peakFrom: 18, outageAt: 10,
  sunrise: 6, sunset: 18, offPeakFrom: 22, offPeakTo: 6,
} as const;

export const windowAt = (hour: number): 'peak' | 'normal' | 'off-peak' => {
  if (hour >= DAY_SHAPE.peakFrom && hour < DAY_SHAPE.peakFrom + 4) return 'peak';
  if (hour >= DAY_SHAPE.offPeakFrom || hour < DAY_SHAPE.offPeakTo) return 'off-peak';
  return 'normal';
};

/**
 * A symmetric bell between sunrise and sunset.
 *
 * The array is off while the feeder is: a grid-following inverter needs a grid to follow, and on a
 * site whose outage supply is a generator there is none. So the outage hour carries no generation,
 * and the day's stated total is spread across the hours the array is actually running — the daily
 * figure being an observed average, which already has that downtime in it.
 */
const solarShape = (hour: number, outageHours: number) => {
  const { sunrise, sunset, outageAt } = DAY_SHAPE;
  if (hour < sunrise || hour >= sunset) return 0;
  const bell = Math.sin(((hour + 0.5 - sunrise) / (sunset - sunrise)) * Math.PI);
  return hour === outageAt ? bell * Math.max(0, 1 - outageHours) : bell;
};

/** Generation hour by hour, in kilowatts, totalling the day the site is costed on. */
export function solarProfileKW(s: FactorySite): number[] {
  const outageHours = s.outageMinutesPerDay / 60;
  const shapes = Array.from({ length: 24 }, (_, h) => solarShape(h, outageHours));
  const sum = shapes.reduce((a, b) => a + b, 0) || 1;
  const daily = s.solarKWp * s.solarKWhPerKWpDay;
  return shapes.map(v => (daily * v) / sum);
}

/** The site's own draw, hour by hour, before anything supplies it. */
export function loadProfileKW(s: FactorySite): number[] {
  return Array.from({ length: 24 }, (_, h) => {
    if (windowAt(h) === 'peak') return s.peakLoadKW;
    return h >= DAY_SHAPE.baseFrom && h < DAY_SHAPE.baseFrom + s.baseHours ? s.baseLoadKW : 0;
  });
}

/** What a kilowatt-hour out of the generator costs, fuel and upkeep together. */
export const dieselInrPerKWh = (s: FactorySite) =>
  s.dieselPriceInrPerLitre * s.dgLitresPerKWh + s.dgUpkeepInrPerKWh;

/** The energy an outage asks for on an average working day. */
export const backupNeedKWh = (s: FactorySite) => s.criticalLoadKW * (s.outageMinutesPerDay / 60);

/**
 * The part of a day's generation the site cannot use as it is made.
 *
 * Derived from the two profiles rather than declared. A declared portion can contradict the site it
 * is a portion of, and the first version of this fixture did exactly that: it claimed 35% of the
 * array left the gate while the array's best hour was below the site's base load, so there was
 * never anything to export at all. The day view is what found it.
 */
export const solarSurplusKWh = (s: FactorySite) => {
  const solar = solarProfileKW(s), load = loadProfileKW(s);
  return solar.reduce((total, kW, h) => total + Math.max(0, kW - load[h]), 0);
};

/** Usable energy out of a nameplate, through the same chain the studio shows. */
export const usableKWh = (nameplateKWh: number) =>
  nameplateKWh * CHAIN.usableWindow * CHAIN.depthOfDischarge;

/**
 * Play one year of the factory.
 *
 * Read top to bottom it is the bill: four lines before, four lines after, and the battery's own
 * cost underneath. The allocation in the middle is where the game is — the same usable energy is
 * asked for by three duties, and what it cannot do is reported rather than silently dropped.
 */
export function playFactory(s: FactorySite, m: Moves): FactoryYear {
  const days = s.workingDaysPerYear;
  const shortfalls: string[] = [];
  const notes: string[] = [];

  // ---- What the battery actually has, and how it is divided --------------------------------
  const usable = usableKWh(m.bessEnergyKWh);
  const reserve = usable * m.reservePortion;
  let cycling = usable - reserve;

  // ---- Backup: the outage the site has every working day ------------------------------------
  const need = backupNeedKWh(s);
  const powerLimited = Math.min(m.bessPowerKW, s.criticalLoadKW);
  // Both have to hold: enough energy in reserve, and enough power to carry the critical load. A
  // battery with the energy and not the power carries part of the load, not part of the outage.
  const coveredByEnergy = Math.min(reserve, need);
  const covered = s.criticalLoadKW > 0 ? coveredByEnergy * (powerLimited / s.criticalLoadKW) : 0;
  if (m.bessPowerKW > 0 && m.bessPowerKW < s.criticalLoadKW) {
    shortfalls.push(`The battery is rated ${Math.round(m.bessPowerKW)} kW against a ${s.criticalLoadKW} kW critical load, so the generator still starts for the rest of it.`);
  }
  if (m.bessEnergyKWh > 0 && reserve < need) {
    shortfalls.push(`The reserve holds ${Math.round(reserve)} kWh against ${Math.round(need)} kWh of outage on an average day. Raise the reserve or the battery, or the generator covers the balance.`);
  }
  const dieselBaseline = need * days * dieselInrPerKWh(s);
  const dieselWith = Math.max(0, need - covered) * days * dieselInrPerKWh(s);
  // What the battery put out has to be put back in, at the off-peak price and through the losses.
  const rechargeBackupInr = (covered / CHAIN.roundTrip) * days * s.tariffInrPerKWh.offPeak;

  // ---- The lead-acid bank -------------------------------------------------------------------
  // Amortised: a bank replaced every four years costs a quarter of a replacement every year.
  const leadAcidBaseline = (s.leadAcidKWh * s.leadAcidInrPerKWh) / s.leadAcidLifeYears;
  const leadAcidUsable = s.leadAcidKWh * s.leadAcidUsablePortion;
  const canRetire = m.retireLeadAcid && covered >= leadAcidUsable;
  if (m.retireLeadAcid && !canRetire) {
    shortfalls.push(`Retiring the lead-acid bank needs the battery to carry at least the ${Math.round(leadAcidUsable)} kWh it actually delivers; today the reserve covers ${Math.round(covered)} kWh.`);
  }
  const leadAcidWith = canRetire ? 0 : leadAcidBaseline;

  // ---- Solar: stored for the evening, or exported at a third of what it buys back ------------
  const surplus = solarSurplusKWh(s);
  const solarWanted = m.shiftSolar ? Math.min(surplus, m.bessPowerKW * s.peakWindowHours) : 0;
  const solarShifted = Math.min(solarWanted, cycling);
  if (m.shiftSolar && solarShifted < surplus - 1) {
    // A note, not a shortfall. Storing every unit an array makes is not a commitment anybody gave —
    // a shortfall is something asked for and not delivered, and treating best-effort as failure
    // made the last round unwinnable on any battery a site would actually buy.
    notes.push(`${Math.round(surplus)} kWh of surplus is made each day and ${Math.round(solarShifted)} kWh of it fits in what is left after the reserve. The rest still leaves at ₹${s.exportInrPerKWh}.`);
  }
  cycling -= solarShifted;
  const exportBaseline = -surplus * days * s.exportInrPerKWh;
  const exportWith = -(surplus - solarShifted) * days * s.exportInrPerKWh;

  // ---- The evening peak: the demand charge, and the energy price behind it -------------------
  const peakKW = s.recordedDemandKVA * s.powerFactor;
  const targetKW = m.peakTargetKVA === null ? peakKW : m.peakTargetKVA * s.powerFactor;
  const wantedShaveKW = Math.max(0, peakKW - targetKW);
  // Holding a lower recorded demand means carrying the difference for the whole peak window, every
  // day of the month — a demand charge is set by the single worst interval, so one failure in the
  // month undoes it. Power and energy both have to be there.
  const shaveKW = Math.min(wantedShaveKW, m.bessPowerKW);
  const energyToHold = shaveKW * s.peakWindowHours;
  // Charge stored from surplus solar is discharged into the evening whatever else is asked of the
  // battery — that was the point of storing it. Only the balance comes out of the cycling energy,
  // and only if a target was set: the demand charge falls for a site that deliberately holds the
  // meter down every working day, not for one that happens to discharge at some point in the
  // evening. Grid-energy savings need no such deliberation, which is why the two are separated.
  const fromCycling = Math.max(0, Math.min(energyToHold - solarShifted, cycling));
  cycling -= fromCycling;
  const eveningDischargeKWh = Math.min(solarShifted + fromCycling, m.bessPowerKW * s.peakWindowHours);
  const heldKW = m.peakTargetKVA === null || s.peakWindowHours <= 0
    ? 0
    : Math.min(shaveKW, eveningDischargeKWh / s.peakWindowHours);
  if (m.peakTargetKVA !== null && heldKW < wantedShaveKW - 1) {
    shortfalls.push(`Holding the meter at ${m.peakTargetKVA} kVA needs ${Math.round(wantedShaveKW)} kW for ${s.peakWindowHours} h — ${Math.round(wantedShaveKW * s.peakWindowHours)} kWh. The battery can hold ${Math.round(heldKW)} kW of it, so the meter still records the rest.`);
  }
  const shavedKVA = s.powerFactor > 0 ? heldKW / s.powerFactor : 0;
  const demandBaseline = s.recordedDemandKVA * s.demandChargeInrPerKVAMonth * 12;
  const demandWith = (s.recordedDemandKVA - shavedKVA) * s.demandChargeInrPerKVAMonth * 12;

  // The energy that came out of the battery in the peak window did not come off the meter at the
  // peak price: what the battery discharged is peak-price energy avoided, and what it charged is
  // off-peak, or surplus solar that would otherwise have been exported.
  const fromBattery = eveningDischargeKWh;
  const fromGridCharge = Math.max(0, fromBattery - solarShifted) / CHAIN.roundTrip;
  const peakAvoidedInr = fromBattery * days * s.tariffInrPerKWh.peak;
  const offPeakChargeInr = fromGridCharge * days * s.tariffInrPerKWh.offPeak;

  const gridEnergyBaseline =
    (s.peakLoadKW * s.peakWindowHours * s.tariffInrPerKWh.peak + s.baseLoadKW * s.baseHours * s.tariffInrPerKWh.normal) * days;
  const gridEnergyWith = gridEnergyBaseline - peakAvoidedInr + offPeakChargeInr + rechargeBackupInr;

  const lines: CostLine[] = [
    {
      id: 'grid-energy', label: 'Grid energy',
      baselineInr: gridEnergyBaseline, withBessInr: gridEnergyWith,
      note: fromBattery > 0
        ? `${Math.round(fromBattery)} kWh a day moved out of the ₹${s.tariffInrPerKWh.peak} window; ${Math.round(fromGridCharge)} kWh bought back at ₹${s.tariffInrPerKWh.offPeak}, losses included.`
        : 'Nothing is being shifted out of the peak window yet.',
    },
    {
      id: 'demand-charge', label: 'Demand charge',
      baselineInr: demandBaseline, withBessInr: demandWith,
      note: shavedKVA > 0
        ? `The meter's recorded maximum falls ${Math.round(shavedKVA)} kVA, at ₹${s.demandChargeInrPerKVAMonth} a kVA a month. One failed evening in the month puts it back.`
        : 'The recorded maximum demand is unchanged: nothing is holding the evening down.',
    },
    {
      id: 'diesel', label: 'Diesel',
      baselineInr: dieselBaseline, withBessInr: dieselWith,
      note: covered > 0
        ? `${Math.round(covered)} kWh of the daily outage carried by the battery instead of the generator, at ₹${dieselInrPerKWh(s).toFixed(1)} a kWh against ₹${s.tariffInrPerKWh.offPeak} to put it back.`
        : `The generator still carries the whole ${Math.round(need)} kWh outage at ₹${dieselInrPerKWh(s).toFixed(1)} a kWh.`,
    },
    {
      id: 'lead-acid', label: 'Lead-acid replacement',
      baselineInr: leadAcidBaseline, withBessInr: leadAcidWith,
      note: canRetire
        ? `The bank is not replaced: ₹${(s.leadAcidKWh * s.leadAcidInrPerKWh / 1e5).toFixed(1)} lakh every ${s.leadAcidLifeYears} years, stopped.`
        : `${s.leadAcidKWh} kWh of nameplate that delivers ${Math.round(leadAcidUsable)} kWh, replaced every ${s.leadAcidLifeYears} years.`,
    },
    {
      id: 'solar-export', label: 'Solar export credit',
      baselineInr: exportBaseline, withBessInr: exportWith,
      note: solarShifted > 0
        ? `${Math.round(solarShifted)} kWh a day kept instead of exported at ₹${s.exportInrPerKWh} — worth ₹${s.tariffInrPerKWh.peak} in the evening.`
        : `${Math.round(surplus)} kWh a day still leaves at ₹${s.exportInrPerKWh} and is bought back at ₹${s.tariffInrPerKWh.peak}.`,
    },
  ];

  const baselineTotalInr = lines.reduce((t, l) => t + l.baselineInr, 0);
  const withBessTotalInr = lines.reduce((t, l) => t + l.withBessInr, 0);
  const bessCapexInr = m.bessEnergyKWh * CHAIN.bessInrPerKWh;
  const bessUpkeepInr = bessCapexInr * CHAIN.upkeepPortion;
  const grossSavingInr = baselineTotalInr - withBessTotalInr;
  const netSavingInr = grossSavingInr - bessUpkeepInr;

  return {
    lines, baselineTotalInr, withBessTotalInr, grossSavingInr, bessCapexInr, bessUpkeepInr, netSavingInr,
    simplePaybackYears: netSavingInr > 0 ? bessCapexInr / netSavingInr : null,
    notes,
    allocation: {
      usableKWh: usable, reserveKWh: reserve, cyclingKWh: Math.max(0, cycling),
      backupNeedKWh: need, backupCoveredKWh: covered,
      solarShiftedKWh: solarShifted, peakShavedKWh: eveningDischargeKWh, peakShavedKVA: shavedKVA,
    },
    shortfalls,
  };
}

/** The battery the factory starts with: none. Every round is measured against this. */
export const noBess = (): Moves => ({
  bessPowerKW: 0, bessEnergyKWh: 0, reservePortion: 0, shiftSolar: false,
  peakTargetKVA: null, retireLeadAcid: false,
});

/**
 * The storyline.
 *
 * Six scenes on one site, each putting a different line of the bill in front of the player and
 * handing them exactly one new thing to do about it. The order is the order the money is easiest to
 * see in: the generator first because a diesel rupee is the one everybody already believes, then the
 * bank in the corner, then the roof, then the evening — and only then all four at once, where the
 * battery bought in scene two is not big enough and something has to give.
 *
 * `won` is a predicate on a played year rather than a score, because the point is not to maximise a
 * number. It is to reach a specific, checkable state — the outage carried, the meter held — and then
 * discover what reaching it cost somewhere else.
 */
export type Round = {
  id: string;
  n: number;
  title: string;
  /** The scene, in the site's own terms. */
  scene: string;
  /** What the player is being asked to do. */
  task: string;
  /** The controls this round hands over. Earlier rounds' controls stay available. */
  unlocks: (keyof Moves)[];
  /** Reached it, or not. Checked against a real played year. */
  won: (y: FactoryYear) => boolean;
  /** What the round was actually about, once it is reached. */
  lesson: string;
};

export const rounds: Round[] = [
  {
    id: 'the-bill', n: 1, title: 'The bill',
    scene: 'Before anything is installed. Four lines, one year, and a works that has never thought of them as one number.',
    task: 'Read where the money goes. Nothing to install yet.',
    unlocks: [],
    won: () => true,
    lesson: 'The energy bill is the big line and it is not the interesting one. The demand charge, the diesel and a battery bank nobody thinks about are the ones a battery can reach.',
  },
  {
    id: 'the-generator', n: 2, title: 'The generator',
    scene: 'Forty-five minutes of outage on an average working day, carried by a diesel set at about ₹29 a kilowatt-hour — fuel and upkeep together — against ₹6.40 to put the same energy back at night.',
    task: 'Install a battery that carries the whole outage, and hold enough in reserve to do it.',
    unlocks: ['bessPowerKW', 'bessEnergyKWh', 'reservePortion'],
    won: y => y.allocation.backupCoveredKWh >= y.allocation.backupNeedKWh - 1,
    lesson: 'A diesel kilowatt-hour costs four to five times a grid one. That gap, not the battery, is what pays for this.',
  },
  {
    id: 'the-bank', n: 3, title: 'The bank in the corner',
    scene: 'A 400 kWh lead-acid bank that delivers about 200, replaced every four years at ₹9,000 a kilowatt-hour. Nobody counts it because it is capital, not a bill.',
    task: 'Carry what the bank actually delivers, and stop replacing it.',
    unlocks: ['retireLeadAcid'],
    won: y => y.lines.find(l => l.id === 'lead-acid')!.withBessInr === 0,
    lesson: 'Half a lead-acid nameplate is unusable and the whole of it is bought again every four years. Comparing nameplates is how it wins on paper.',
  },
  {
    id: 'the-roof', n: 4, title: 'The roof',
    scene: 'Fifteen hundred kilowatts-peak on the sheds. About a third of what it makes leaves the gate at ₹3 a unit, and the same site buys the evening back at ₹10.60.',
    task: 'Keep the midday surplus and use it in the evening instead of exporting it.',
    unlocks: ['shiftSolar'],
    won: y => y.allocation.solarShiftedKWh > 500,
    lesson: 'The spread between the export price and the retail price is the whole argument for storing solar. The battery does not make energy; it moves it to where it is worth more.',
  },
  {
    id: 'the-evening', n: 5, title: 'The evening',
    scene: 'The bill is charged on the highest half-hour of the month at ₹450 a kVA. Two shifts overlap at seven, and that overlap sets the number for the whole month.',
    task: 'Hold the recorded maximum demand at 1,800 kVA through the evening window.',
    unlocks: ['peakTargetKVA'],
    won: y => y.allocation.peakShavedKVA >= 490,
    lesson: 'A demand charge is set by one interval, so holding it is a duty every working day of the month. One failed evening puts the charge back for all of it.',
  },
  {
    id: 'the-trade', n: 6, title: 'All four at once',
    scene: 'Now everything together, on the battery you have. Reserve held for the outage is reserve the evening does not get; solar stored at noon is charge the night tariff did not have to buy.',
    task: 'Get the year to pay for itself — a positive net saving with nothing left short.',
    unlocks: [],
    won: y => y.netSavingInr > 0 && y.shortfalls.length === 0,
    lesson: 'One battery, three duties, one pool of energy. Everything it does for one line it stops doing for another, and the sizing is the argument about which.',
  },
];

export const roundById = (id: string) => rounds.find(r => r.id === id);

/** Every control the player has by a given round, in the order they were handed over. */
export const unlockedBy = (n: number): (keyof Moves)[] =>
  rounds.filter(r => r.n <= n).flatMap(r => r.unlocks);

/* --------------------------------------------------------- the day it assumes ---- */

/**
 * The same year, arranged in hours.
 *
 * {@link playFactory} answers in rupees a year, which is the answer a finance director wants and
 * the wrong one to look at while deciding *what the battery should do*. Every quantity in that
 * arithmetic is really a statement about one working day — forty-five minutes of outage at ten,
 * twelve hours of base load, four hours of evening peak, a bell of generation over the middle — and
 * a player who cannot see the day cannot see why the reserve and the evening are competing for the
 * same kilowatt-hours.
 *
 * So this lays the same numbers out in time. It is **not a second model**: every total here is
 * reconciled against the allocation `playFactory` computed, to the kilowatt-hour, by
 * `src/tests/factory.test.ts`. If the two ever disagree the day is wrong, not the bill.
 *
 * The placement of the hours is a stated assumption of the fixture, in the way §15.4 already
 * requires of a tariff: the outage sits at ten in the morning, the evening window runs from six,
 * and generation is a symmetric bell between six and six. A real site replaces all three from its
 * own load data.
 */
export type DayHour = {
  hour: number;
  /** What the site is drawing, before anything supplies it. */
  loadKW: number;
  /** What the array is making. */
  solarKW: number;
  /**
   * Positive discharging, negative charging.
   *
   * Every figure on an hour is that hour's **energy**, written as an average power, so the day adds
   * up by plain summation. A forty-five minute outage therefore shows three quarters of the
   * critical load on its hour rather than all of it — the instantaneous figure is in the caption,
   * where it cannot be summed by accident.
   */
  batteryKW: number;
  /** What the generator is carrying, which is only ever during an outage. */
  dieselKW: number;
  /** What crosses the meter. Positive import, negative export. */
  gridKW: number;
  /** Energy in the battery at the start of this hour, in kilowatt-hours of usable capacity. */
  storedKWh: number;
  /** Which price applies. */
  window: 'peak' | 'normal' | 'off-peak';
  outage: boolean;
};

export function factoryDay(s: FactorySite, m: Moves): DayHour[] {
  const year = playFactory(s, m);
  const a = year.allocation;
  const solar = solarProfileKW(s), load = loadProfileKW(s);
  const outageHours = s.outageMinutesPerDay / 60;

  // The charge the battery takes overnight, to be spent in the evening. What it takes from the sun
  // is stored as it is made and does not cross the meter at all.
  const fromGridKWh = Math.max(0, a.peakShavedKWh - a.solarShiftedKWh) / CHAIN.roundTrip
    + a.backupCoveredKWh / CHAIN.roundTrip;
  const offPeakHours = Array.from({ length: 24 }, (_, h) => h).filter(h => windowAt(h) === 'off-peak');
  const perOffPeakHour = offPeakHours.length ? fromGridKWh / offPeakHours.length : 0;

  const rows: DayHour[] = [];
  let stored = 0, solarStored = 0;
  for (let hour = 0; hour < 24; hour++) {
    const window = windowAt(hour);
    const outage = hour === DAY_SHAPE.outageAt && outageHours > 0;
    // The outage hour carries the protected load while the grid is away and the ordinary load for
    // the rest of it, averaged — the site does not stop when the feeder comes back.
    const loadKW = outage
      ? s.criticalLoadKW * outageHours + load[hour] * (1 - outageHours)
      : load[hour];
    const solarKW = solar[hour];

    let batteryKW = 0, dieselKW = 0;
    if (outage) {
      // The battery carries what the reserve and its power rating allow; the generator takes the
      // rest, which is the line the second round is about.
      //
      // The array is deliberately given nothing to do here. A grid-following inverter needs a grid
      // to follow, and on a site whose outage supply is a generator there is none — the array trips
      // with the feeder. Counting the sun against a mid-morning outage would be the single most
      // flattering mistake this model could make, and it is the reason the bill's diesel line has
      // no solar term in it either.
      const carriedKW = Math.min(a.backupCoveredKWh / Math.max(outageHours, 1e-9), s.criticalLoadKW);
      // Averaged over the hour, like everything else on this row.
      batteryKW = carriedKW * outageHours;
      dieselKW = Math.max(0, s.criticalLoadKW - carriedKW) * outageHours;
      stored -= batteryKW;
    } else if (window === 'peak') {
      batteryKW = a.peakShavedKWh / s.peakWindowHours;
      stored -= batteryKW;
    } else if (window === 'off-peak') {
      batteryKW = -perOffPeakHour;
      stored += perOffPeakHour * CHAIN.roundTrip;
    } else if (solarKW > loadKW && a.solarShiftedKWh > 0) {
      // Surplus goes into the battery rather than out of the gate, up to what the year allocated.
      // Counted against the solar taken so far and not against everything in the battery, or the
      // charge taken from the night tariff would silently cancel the sun's share of it.
      const surplusKW = solarKW - loadKW;
      const wanted = Math.min(surplusKW, Math.max(0, a.solarShiftedKWh - solarStored));
      batteryKW = -wanted;
      solarStored += wanted;
      stored += wanted * CHAIN.roundTrip;
    }

    // Nothing crosses the meter while the feeder is away; the rest of that hour is ordinary.
    const gridKW = outage
      ? Math.max(0, load[hour] * (1 - outageHours) - solarKW)
      : loadKW - solarKW - batteryKW;
    rows.push({
      hour, loadKW, solarKW, batteryKW, dieselKW, gridKW,
      storedKWh: Math.max(0, stored), window, outage,
    });
  }
  return rows;
}

/** What the day totals, so it can be held to the year's own allocation. */
export const dayTotals = (day: DayHour[]) => {
  const sum = (f: (h: DayHour) => number) => day.reduce((t, h) => t + f(h), 0);
  return {
    loadKWh: sum(h => h.loadKW),
    solarKWh: sum(h => h.solarKW),
    dischargedKWh: sum(h => Math.max(0, h.batteryKW)),
    chargedKWh: sum(h => Math.max(0, -h.batteryKW)),
    dieselKWh: sum(h => h.dieselKW),
    importedKWh: sum(h => Math.max(0, h.gridKW)),
    exportedKWh: sum(h => Math.max(0, -h.gridKW)),
  };
};
