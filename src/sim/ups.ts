import { enclosures, pcsUnits, packSpecs, byId, type EnclosureSpec, type PcsSpec } from '../catalog/products';

/**
 * UPS support, sized from contract demand.
 *
 * §15.3 is built around one warning, and every function here exists to keep it true: **contract
 * demand is a starting estimate of site demand, not a measurement of critical load, and not
 * automatically the required UPS rating**. So every figure below carries the assumption that
 * produced it, a measured protected load supersedes the estimate rather than adding to it, and the
 * delivered AC energy is never reported as the battery to buy.
 *
 * The second warning is about what a sizing calculation can and cannot establish. An energy model
 * can estimate runtime. It cannot prove zero-break transfer, voltage quality or protection
 * coordination, so continuity is **not verified** here and no configuration earns a no-break claim
 * from arithmetic alone.
 */

/** The six illustrative site sizes §15.3 names, plus a custom entry. Not product SKUs. */
export const contractDemands = [100, 250, 500, 1_000, 2_000, 5_000] as const;
export const protectedShares = [0.25, 0.5, 0.75, 1] as const;
export const backupDurations = [5, 15, 30, 60, 120] as const;

export type ContractDemand = { value: number; unit: 'kVA' | 'kW' };

/**
 * The assumptions strip.
 *
 * §15.3 calls these "teaching assumptions, not universal site characteristics", and requires them
 * to be visible and editable rather than buried. They are one record so that every result can be
 * traced to the exact set that produced it.
 */
export type UpsAssumptions = {
  /** How much of the contract demand the site actually draws. */
  utilisation: number;
  /** Applied to a kVA contract to get real power. **Never applied to a kW contract.** */
  sitePf: number;
  /** The protected load's own power factor, which sets the kVA the equipment must carry. */
  criticalPf: number;
  /** Growth headroom, kept separate from N+1 redundancy. Illustrative, editable. */
  headroom: number;
  /** DC to protected-AC path efficiency. Each loss counted once. */
  pathEfficiency: number;
  /** Auxiliaries referred to the battery-terminal boundary, in watts. */
  auxDcW: number;
  /** Where the battery is when the outage starts, and the lowest it may be taken. */
  startSoc: number;
  minSoc: number;
  /** Capacity retained at the end of the period the sizing must hold for. */
  retainedCapacity: number;
};

export const defaultAssumptions = (): UpsAssumptions => ({
  utilisation: 1, sitePf: 0.9, criticalPf: 0.9, headroom: 0.2,
  pathEfficiency: 0.92, auxDcW: 0, startSoc: 1, minSoc: 0.1, retainedCapacity: 0.8,
});

export type UpsInput = {
  contract: ContractDemand;
  protectedFraction: number;
  durationMinutes: number;
  /**
   * A measured critical load, in kilowatts, which **supersedes** the contract-demand estimate
   * rather than adding to it. Null while the estimate stands.
   */
  measuredProtectedKW?: number | null;
  assumptions: UpsAssumptions;
};

export type UpsRequirement = {
  /** Real power the site is estimated to draw. */
  siteKW: number;
  protectedKW: number;
  protectedKVA: number;
  /** Delivered to the protected load over the outage. **Not the battery to buy.** */
  loadEnergyKWhAc: number;
  /** Continuous output the equipment must carry, after headroom and before environmental derating. */
  requiredKW: number;
  requiredKVA: number;
  /** The preliminary nominal battery estimate, and the window it was divided by. */
  nominalBatteryKWh: number;
  availableSocFraction: number;
  /** True where a measured load replaced the estimate. */
  fromMeasuredLoad: boolean;
  /** Every assumption that produced the numbers above, in the words the strip shows. */
  basis: string[];
  /** Anything a reader must be told before using these figures. */
  warnings: string[];
};

const hours = (minutes: number) => minutes / 60;

/**
 * The requirement, from contract demand to a battery estimate.
 *
 * The order matters and is §15.3's: site power, protected power, protected apparent power, energy
 * at the load, then — separately — the continuous rating after headroom and the nominal battery
 * after the path losses and the usable window. Collapsing any two of those is how 56.25 kWh ends
 * up being quoted as the battery.
 */
export function requirementFrom(input: UpsInput): UpsRequirement {
  const a = input.assumptions;
  const warnings: string[] = [];
  const basis: string[] = [];

  // §15.3: for a kW contract demand, site power factor is not applied again.
  const siteKW = input.contract.unit === 'kVA'
    ? input.contract.value * a.utilisation * a.sitePf
    : input.contract.value * a.utilisation;
  basis.push(input.contract.unit === 'kVA'
    ? `${input.contract.value} kVA of contract demand at ${(a.utilisation * 100).toFixed(0)}% utilisation and ${a.sitePf.toFixed(2)} site power factor is ${siteKW.toFixed(1)} kW of site demand.`
    : `${input.contract.value} kW of contract demand at ${(a.utilisation * 100).toFixed(0)}% utilisation is ${siteKW.toFixed(1)} kW of site demand. A power factor is not applied to a contract already stated in kilowatts.`);

  const fromMeasuredLoad = input.measuredProtectedKW != null;
  const protectedKW = fromMeasuredLoad ? input.measuredProtectedKW! : siteKW * input.protectedFraction;
  basis.push(fromMeasuredLoad
    ? `A measured protected load of ${protectedKW.toFixed(1)} kW supersedes the contract-demand estimate. It is not added to it.`
    : `${(input.protectedFraction * 100).toFixed(0)}% of that is protected: ${protectedKW.toFixed(1)} kW.`);

  const protectedKVA = protectedKW / a.criticalPf;
  basis.push(`At ${a.criticalPf.toFixed(2)} critical-load power factor, ${protectedKW.toFixed(1)} kW is ${protectedKVA.toFixed(1)} kVA. Final selection needs measured phase and load data rather than one aggregate power factor.`);

  const h = hours(input.durationMinutes);
  const loadEnergyKWhAc = protectedKW * h;
  basis.push(`Over ${input.durationMinutes} minutes that load takes ${loadEnergyKWhAc.toFixed(2)} kWh, delivered to it. This is the energy at the load, not the battery to buy.`);

  const requiredKW = protectedKW * (1 + a.headroom);
  const requiredKVA = protectedKVA * (1 + a.headroom);
  basis.push(`With ${(a.headroom * 100).toFixed(0)}% growth headroom, the continuous requirement is ${requiredKW.toFixed(1)} kW and ${requiredKVA.toFixed(1)} kVA, before environmental derating. Headroom is not N+1 redundancy.`);

  const availableSocFraction = Math.max(0, a.startSoc - a.minSoc);
  const dcEnergyKWh = (protectedKW / a.pathEfficiency + a.auxDcW / 1000) * h;
  const nominalBatteryKWh = availableSocFraction > 0 && a.retainedCapacity > 0
    ? dcEnergyKWh / (availableSocFraction * a.retainedCapacity)
    : Number.POSITIVE_INFINITY;
  basis.push(`At ${(a.pathEfficiency * 100).toFixed(0)}% path efficiency that is ${dcEnergyKWh.toFixed(2)} kWh at the battery terminals, and the usable window is ${(availableSocFraction * 100).toFixed(0)}% of a pack retaining ${(a.retainedCapacity * 100).toFixed(0)}% — so the nominal estimate is ${Number.isFinite(nominalBatteryKWh) ? nominalBatteryKWh.toFixed(2) : '—'} kWh.`);

  if (availableSocFraction <= 0) {
    warnings.push('The battery is not ready: the state of charge it starts from is at or below the lowest it may be taken to, so there is no usable energy at all.');
  } else if (availableSocFraction < 0.5) {
    warnings.push(`Only ${(availableSocFraction * 100).toFixed(0)}% of the pack is usable between the readiness state of charge and the floor, which is what makes the nominal estimate so much larger than the energy the load takes.`);
  }
  if (!fromMeasuredLoad) {
    warnings.push('Indicative sizing from contract demand. Contract demand estimates site demand; it does not measure critical load. A measured load profile or an approved protected-load schedule replaces it.');
  }
  warnings.push('Continuity is not verified. An energy calculation cannot establish zero-break transfer, voltage quality or protection coordination, and no configuration here earns a no-break claim without equipment evidence.');

  return {
    siteKW, protectedKW, protectedKVA, loadEnergyKWhAc, requiredKW, requiredKVA,
    nominalBatteryKWh, availableSocFraction, fromMeasuredLoad, basis, warnings,
  };
}

/** The table §15.3 prints, recalculated rather than looked up. */
export const requirementTable = (assumptions = defaultAssumptions(), protectedFraction = 0.5, durationMinutes = 15) =>
  contractDemands.map(value => {
    const r = requirementFrom({ contract: { value, unit: 'kVA' }, protectedFraction, durationMinutes, assumptions });
    return { contractKVA: value, siteKW: r.siteKW, protectedKW: r.protectedKW, protectedKVA: r.protectedKVA, loadEnergyKWhAc: r.loadEnergyKWhAc };
  });

/* ------------------------------------------------------ equipment options -- */

/**
 * The DC string an enclosure presents, from the catalogue's own numbers.
 *
 * A converter and a battery that cannot see each other's voltage are not a configuration, however
 * well their kilowatts add up. This was the check that turned a 270 kW requirement into fifty-four
 * five-kilowatt hybrid inverters wired to a string four times their window.
 */
export const stringVoltage = (enclosure: EnclosureSpec) => {
  const pack = byId(packSpecs, enclosure.packSpecId);
  return {
    nominalV: pack.nominalV * enclosure.packsInSeries,
    minV: pack.minV * enclosure.packsInSeries,
    maxV: pack.maxV * enclosure.packsInSeries,
  };
};

/**
 * The most units of one kind this will put in an answer.
 *
 * An arbitrary line, and stated as one: past it the arithmetic still works and the result stops
 * being a design anybody would build. Twenty racks is a wall of them.
 */
export const MAX_UNITS = 20;

export type UpsOption = {
  /**
   * Which card this is. The first three are §15.3's; the last two appear only while a system is
   * being tested rather than resized, where showing a freshly sized configuration as "selected"
   * would be showing equipment nobody has.
   */
  role: 'selected' | 'next-power' | 'longer-runtime' | 'under-test' | 'would-need';
  enclosure: EnclosureSpec;
  enclosureCount: number;
  pcs: PcsSpec;
  pcsCount: number;
  energyKWh: number;
  continuousKW: number;
  /** What this combination is actually limited by. */
  binding: 'energy' | 'power';
  /** The C-rate the requirement asks of it, and what the equipment supports. */
  requiredCRate: number;
  /** Why this is illustrative rather than a quotation. */
  caveats: string[];
};

/**
 * The smallest compatible combination in the catalogue, by §15.3's rule.
 *
 * Counts come from real catalogue entries — module and rack counts derived from what exists, never
 * from an invented rating. Where nothing in the catalogue can meet the requirement the answer is
 * that nothing can, which is more useful than a configuration nobody can buy.
 */
export function optionsFor(req: UpsRequirement): { options: UpsOption[]; problems: string[] } {
  const problems: string[] = [];
  const candidates: UpsOption[] = [];

  for (const enclosure of enclosures) {
    // Two counts, and the larger wins: enough energy, and enough continuous power. A five-minute
    // backup is bound by power and a two-hour one by energy, and sizing on energy alone quietly
    // picks equipment that cannot deliver the load at all.
    const forEnergy = Math.ceil(req.nominalBatteryKWh / enclosure.labelKWh);
    const forPower = Math.ceil(req.requiredKW / enclosure.ratedKW);
    if (!Number.isFinite(forEnergy)) continue;
    const count = Math.max(forEnergy, forPower, 1);
    if (count > MAX_UNITS) continue;
    const dc = stringVoltage(enclosure);
    // Voltage first: a converter whose DC window does not contain the string's nominal voltage
    // cannot be connected to it at any power, however well the kilowatts add up.
    const fits = pcsUnits
      .map(p => ({ p, n: Math.ceil(req.requiredKW / p.ratedKW) }))
      .filter(({ p, n }) => p.dcMinV <= dc.nominalV && p.dcMaxV >= dc.nominalV
        && n * p.ratedKW >= req.requiredKW && n >= 1 && n <= MAX_UNITS);
    if (fits.length === 0) continue;
    // Then the same two-step rule as the enclosures, for the same reason: tightest rating alone
    // gives eleven small inverters where one would do, and fewest units alone gives a converter
    // four times the size of the load. Within half again of the tightest, take the fewest units.
    const tightest = Math.min(...fits.map(({ p, n }) => n * p.ratedKW));
    const pcs = fits
      .filter(({ p, n }) => n * p.ratedKW <= tightest * 1.5)
      .sort((a, b) => a.n - b.n || a.n * a.p.ratedKW - b.n * b.p.ratedKW)[0];

    const energyKWh = count * enclosure.labelKWh;
    const continuousKW = Math.min(count * enclosure.ratedKW, pcs.n * pcs.p.ratedKW);
    const pack = byId(packSpecs, enclosure.packSpecId);
    const caveats = [
      'Illustrative configuration. The catalogue states converter ratings in kilowatts only, so the apparent-power requirement is checked against the active-power rating — conservatively, and pending a quoted kVA.',
      `Module and rack counts are derived from the catalogue entry: ${enclosure.racks} rack(s) of ${enclosure.packsPerRack} × ${pack.model} per unit.`,
      'No catalogue entry here is qualified for UPS duty. A generic converter is not assumed to support it, and a battery upstream of an existing UPS does not share its DC bus.',
      `The string is ${dc.nominalV.toFixed(0)} V nominal and ${dc.minV.toFixed(0)}–${dc.maxV.toFixed(0)} V across its range, against a ${pcs.p.dcMinV}–${pcs.p.dcMaxV} V converter window. The top of the charge range needs checking against the converter's real limit before selection.`,
    ];
    candidates.push({
      role: 'selected', enclosure, enclosureCount: count, pcs: pcs.p, pcsCount: pcs.n,
      energyKWh, continuousKW, binding: forPower > forEnergy ? 'power' : 'energy',
      requiredCRate: req.requiredKW / energyKWh, caveats,
    });
  }

  if (candidates.length === 0) {
    problems.push(`Nothing in the catalogue can meet this requirement within ${MAX_UNITS} units of one kind, with a converter whose DC window contains the string. Rather than invent a rating, the answer is that commercial selection is pending.`);
    return { options: [], problems };
  }

  /**
   * "The smallest compatible combination" needs saying precisely, because two readings of it give
   * opposite answers: fewest boxes alone picks a five-megawatt-hour container for an eighty-five
   * kilowatt-hour requirement, and least energy alone picks eleven cabinets and eleven inverters
   * where one of each would do.
   *
   * So: among the combinations whose energy is within twice the least that meets the requirement,
   * take the one with the fewest units. It is an arbitrary line and it is stated as one, but it
   * is the line that stops both failure modes, and a reader can check either half of it.
   */
  const leastEnergy = Math.min(...candidates.map(c => c.energyKWh));
  const sensible = candidates.filter(c => c.energyKWh <= leastEnergy * 2);
  sensible.sort((a, b) =>
    (a.enclosureCount + a.pcsCount) - (b.enclosureCount + b.pcsCount) || a.energyKWh - b.energyKWh);
  const selected = sensible[0];
  const options: UpsOption[] = [selected];

  const nextPower = candidates
    .filter(c => c.continuousKW > selected.continuousKW * 1.001)
    .sort((a, b) => a.continuousKW - b.continuousKW || a.energyKWh - b.energyKWh)[0];
  if (nextPower) options.push({ ...nextPower, role: 'next-power' });

  // A longer runtime is more energy on the same equipment — and only if the converter and the
  // discharge rate still hold, which is why it is checked rather than assumed.
  const longer = { ...selected, role: 'longer-runtime' as const, enclosureCount: selected.enclosureCount + 1 };
  longer.energyKWh = longer.enclosureCount * selected.enclosure.labelKWh;
  longer.continuousKW = Math.min(longer.enclosureCount * selected.enclosure.ratedKW, selected.pcsCount * selected.pcs.ratedKW);
  longer.requiredCRate = req.requiredKW / longer.energyKWh;
  if (longer.continuousKW >= req.requiredKW) options.push(longer);

  return { options, problems };
}

/** How long an option would actually carry the protected load, before the coupled model is run. */
export const estimatedRuntimeMinutes = (option: UpsOption, req: UpsRequirement, a: UpsAssumptions) => {
  const usableKWh = option.energyKWh * req.availableSocFraction * a.retainedCapacity;
  const drawKW = req.protectedKW / a.pathEfficiency + a.auxDcW / 1000;
  return drawKW > 0 ? (usableKWh / drawKW) * 60 : 0;
};

/** Whether the readiness assumed can actually meet the duration asked for. */
export function readiness(option: UpsOption | undefined, req: UpsRequirement, a: UpsAssumptions, durationMinutes: number) {
  if (!option) return { ready: false, reason: 'No configuration was selected, so readiness cannot be claimed.', minutes: 0 };
  const minutes = estimatedRuntimeMinutes(option, req, a);
  return minutes + 1e-9 >= durationMinutes
    ? { ready: true, reason: `The selected configuration carries the protected load for about ${minutes.toFixed(0)} minutes from ${(a.startSoc * 100).toFixed(0)}% charge, against the ${durationMinutes} minutes asked for.`, minutes }
    : {
      ready: false,
      minutes,
      reason: `Insufficient readiness: from ${(a.startSoc * 100).toFixed(0)}% charge down to the ${(a.minSoc * 100).toFixed(0)}% floor this configuration carries the protected load for about ${minutes.toFixed(0)} minutes, short of the ${durationMinutes} asked for.`,
    };
}

/* --------------------------------------------- holding a system still ------ */

/**
 * A configuration somebody has decided to keep.
 *
 * §15.3 keeps **Resize system** and **Test this system** apart, and the reason is worth stating:
 * comparing a fixed installation against a harder duty is the whole question a site asks — *will
 * what I have carry this?* — and an interface that silently resizes the system when the duty
 * changes answers a different question and calls it the same one. So a held system is a record of
 * what was chosen, carried forward until somebody resizes it deliberately.
 */
export type HeldSystem = { enclosureId: string; enclosureCount: number; pcsId: string; pcsCount: number };

export const hold = (option: UpsOption): HeldSystem => ({
  enclosureId: option.enclosure.id, enclosureCount: option.enclosureCount,
  pcsId: option.pcs.id, pcsCount: option.pcsCount,
});

/** That held configuration, restated as an option so everything downstream reads it the same way. */
export function heldOption(held: HeldSystem, req: UpsRequirement): UpsOption {
  const enclosure = byId(enclosures, held.enclosureId);
  const pcs = byId(pcsUnits, held.pcsId);
  const dc = stringVoltage(enclosure);
  const energyKWh = held.enclosureCount * enclosure.labelKWh;
  const continuousKW = Math.min(held.enclosureCount * enclosure.ratedKW, held.pcsCount * pcs.ratedKW);
  return {
    role: 'selected', enclosure, enclosureCount: held.enclosureCount, pcs, pcsCount: held.pcsCount,
    energyKWh, continuousKW,
    binding: continuousKW < req.requiredKW ? 'power' : 'energy',
    requiredCRate: req.requiredKW / energyKWh,
    caveats: [
      'This system is being tested, not resized: the equipment is what was selected earlier, and the duty on the screen is what is being asked of it.',
      `The string is ${dc.nominalV.toFixed(0)} V nominal against a ${pcs.dcMinV}–${pcs.dcMaxV} V converter window.`,
      'Illustrative configuration, and no catalogue entry here is qualified for UPS duty.',
    ],
  };
}

/** What a held system fails to meet, if anything. Empty where it still carries the duty. */
export function shortfalls(option: UpsOption, req: UpsRequirement, a: UpsAssumptions, durationMinutes: number): string[] {
  const out: string[] = [];
  if (option.continuousKW < req.requiredKW - 1e-9) {
    out.push(`This system is rated ${option.continuousKW.toFixed(0)} kW continuous, below the ${req.requiredKW.toFixed(0)} kW this duty needs. It cannot carry the protected load at all, never mind for ${durationMinutes} minutes.`);
  }
  const r = readiness(option, req, a, durationMinutes);
  if (!r.ready) out.push(r.reason);
  if (option.energyKWh < req.nominalBatteryKWh - 1e-9) {
    out.push(`Its ${option.energyKWh.toFixed(0)} kWh is below the ${req.nominalBatteryKWh.toFixed(0)} kWh this duty estimates it needs.`);
  }
  return out;
}
