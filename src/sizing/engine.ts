import { application, type ApplicationId } from './applications';
import {
  byId, cellOf, packOf, enclosures, pcsUnits, transformers, enclosureEnergyKWh,
  enclosureCellCount, enclosureFootprintM2, enclosureStrings, enclosureCRate, packEnergyKWh,
  type EnclosureSpec, type PcsSpec, type TransformerSpec,
} from '../catalog/products';

export type AugmentationStrategy = 'none' | 'oversize-day1' | 'periodic';
export type SizingMode = 'power-duration' | 'usable-energy';
export type DegradationMode = 'table' | 'model';

/**
 * Efficiency chain, transcribed from the supplied BESS sizing model. Every factor is an editable
 * input because site conditions and the chosen PCS move all of them.
 *
 * The source sheet uses one 95% figure for both the usable DC window and the DC round trip, and
 * applies the full figure on charge but its square root on discharge. Those are separated here
 * into three inputs whose defaults reproduce the sheet exactly, so the asymmetry is visible and
 * adjustable rather than buried.
 */
export type LossChain = {
  usableDcWindow: number; chargeEfficiencyDc: number; dischargeEfficiencyDc: number;
  dcCableLoss: number; pcsLoss: number; acCableLoss: number; idtLoss: number;
  idtOnDischarge: boolean; openAccessLoss: number; availabilityFactor: number; auxScale: number;
};

export const defaultLossChain = (): LossChain => ({
  usableDcWindow: 0.95, chargeEfficiencyDc: 0.95, dischargeEfficiencyDc: Math.sqrt(0.95),
  dcCableLoss: 0.0025, pcsLoss: 0.015, acCableLoss: 0.0025, idtLoss: 0.01,
  idtOnDischarge: true, openAccessLoss: 0.1078, availabilityFactor: 0.95, auxScale: 1,
});

/** Capacity retention by year from the supplied 20-year schedule. Index 0 is commissioning. */
export const suppliedRetention = [1, 0.95, 0.92, 0.90, 0.88, 0.87, 0.85, 0.84, 0.82, 0.81, 0.80, 0.78, 0.77, 0.76, 0.75, 0.74, 0.73, 0.72, 0.71, 0.70, 0.69];

export type DegradationInput = { mode: DegradationMode; retention: number[] };
export const defaultDegradation = (): DegradationInput => ({ mode: 'table', retention: [...suppliedRetention] });

export type SizingInput = {
  applicationId: ApplicationId; mode: SizingMode;
  powerMW: number; durationH: number; usableEnergyMWh: number;
  /** Hours allowed to put the contracted energy back in. Sets the charge rate the plant must sustain. */
  chargeDurationH: number;
  cyclesPerDay: number; daysPerYear: number; projectYears: number;
  dod: number; availability: number;
  ambientC: number; altitudeM: number;
  enclosureId: string; pcsId: string; transformerId: string | null;
  augmentation: AugmentationStrategy;
  gridKV: number; frequencyHz: 50 | 60; powerFactor: number;
  losses: LossChain; degradation: DegradationInput;
};

export type SizingWarning = { code: string; level: 'error' | 'warning' | 'info'; text: string };
export type YearRow = {
  year: number; retention: number; installedDcMWh: number; storedDcMWh: number; usableMWh: number;
  deliveredMWh: number; chargeMWh: number; gridChargeMWh: number; augmentedMWh: number; shortfall: boolean;
};
export type Cohort = { year: number; dcMWh: number; units: number };

export type SizingResult = {
  input: SizingInput;
  enclosure: EnclosureSpec; pcs: PcsSpec; transformer: TransformerSpec | null;
  requiredUsableMWh: number; ratedPowerMW: number; effectiveDurationH: number; chargePowerMW: number; chargeCRate: number;
  units: number; totalUnits: number; installedDcMWh: number; day1UsableMWh: number;
  packs: number; cells: number; racks: number; strings: number;
  footprintM2: number; massTonnes: number;
  pcsCount: number; pcsTotalMW: number; transformerCount: number; transformerTotalMVA: number;
  dcVoltageWindow: [number, number]; systemCRate: number; packCRate: number;
  auxMWhPerDay: number; dischargePathEfficiency: number; chargePathEfficiency: number;
  rteAc: number; cellTempC: number; tempFactor: number; efcPerYear: number;
  years: YearRow[]; cohorts: Cohort[]; augmentations: { year: number; units: number; dcMWh: number }[];
  endOfLifeRetention: number; warrantyThroughputMWh: number; lifetimeThroughputMWh: number;
  warnings: SizingWarning[];
};

export const defaultSizingInput = (applicationId: ApplicationId = 'peak-shaving'): SizingInput => {
  const a = application(applicationId);
  return {
    applicationId, mode: 'power-duration', powerMW: 2.5, durationH: a.durationH, usableEnergyMWh: 2.5 * a.durationH,
    chargeDurationH: a.durationH,
    cyclesPerDay: a.cyclesPerDay, daysPerYear: a.daysPerYear, projectYears: 20, dod: a.dod, availability: a.availability,
    ambientC: 35, altitudeM: 100, enclosureId: 'enc-5mwh-20ft', pcsId: 'pcs-2507', transformerId: 'tx-3150',
    augmentation: a.cyclesPerDay * a.dod > 1 ? 'periodic' : 'oversize-day1',
    gridKV: 33, frequencyHz: 50, powerFactor: 0.95,
    losses: defaultLossChain(), degradation: defaultDegradation(),
  };
};

/** Cell temperature seen by the ageing model, from ambient and the cooling strategy. */
export const cellTemperature = (ambientC: number, cooling: EnclosureSpec['cooling']) =>
  cooling === 'liquid' ? Math.min(38, Math.max(18, 25 + (ambientC - 25) * 0.25)) : Math.min(48, Math.max(18, 25 + (ambientC - 25) * 0.6));

/** Arrhenius-style ageing multiplier, doubling roughly every 12 K above 25 °C. Simplified; supplier curves override. */
export const temperatureFactor = (cellTempC: number) => 2 ** ((cellTempC - 25) / 12);

/**
 * Capacity retention of one cohort after `age` years of service, derived from the catalogue
 * warranty anchors. Used when the degradation mode is `model`; the `table` mode reads the
 * year-by-year schedule instead.
 */
export function retentionAt(age: number, efcPerYear: number, cell: ReturnType<typeof cellOf>, tempFactor: number) {
  if (age <= 0) return 1;
  const calA = (1 - cell.calendarRetention) / Math.sqrt(cell.calendarYears);
  const perEfc = (1 - cell.cycleLifeRetention) / cell.cycleLife;
  const fade = tempFactor * (calA * Math.sqrt(age) + perEfc * efcPerYear * age);
  return Math.min(1, Math.max(0.2, 1 - fade));
}

/**
 * Retention read from the year-by-year schedule. Beyond the end of the table the last year-on-year
 * step is repeated, so a 25-year study does not fall off the end of a 20-year warranty table.
 */
export function retentionFromTable(age: number, table: number[]) {
  if (age <= 0) return 1;
  if (age < table.length) return table[Math.round(age)];
  const last = table.at(-1)!, step = table.length >= 2 ? table.at(-2)! - last : 0.01;
  return Math.max(0.2, last - step * (age - (table.length - 1)));
}

const ceil = (n: number) => Math.ceil(n - 1e-9);

/**
 * Fill in anything a stored project predates, and repoint catalogue ids that have been retired,
 * so a record written by an earlier version still sizes instead of throwing.
 */
export function normaliseSizingInput(input: SizingInput): SizingInput {
  const known = <T extends { id: string }>(list: T[], id: string | null, fallback: string) =>
    (id && list.some(x => x.id === id) ? id : fallback);
  return {
    ...input,
    chargeDurationH: input.chargeDurationH && input.chargeDurationH > 0 ? input.chargeDurationH : (input.durationH || 2),
    enclosureId: known(enclosures, input.enclosureId, 'enc-5mwh-20ft'),
    pcsId: known(pcsUnits, input.pcsId, 'pcs-2507'),
    transformerId: input.transformerId === null ? null : known(transformers, input.transformerId, 'tx-3150'),
    losses: { ...defaultLossChain(), ...(input.losses ?? {}) },
    degradation: {
      mode: input.degradation?.mode ?? 'table',
      retention: input.degradation?.retention?.length ? input.degradation.retention : [...suppliedRetention],
    },
  };
}

export function sizeSystem(raw: SizingInput): SizingResult {
  const input = normaliseSizingInput(raw);
  const enclosure = byId(enclosures, input.enclosureId), pcs = byId(pcsUnits, input.pcsId);
  const transformer = input.transformerId ? byId(transformers, input.transformerId) : null;
  const pack = packOf(enclosure), cell = cellOf(pack), app = application(input.applicationId);
  const L = input.losses, warnings: SizingWarning[] = [];

  const ratedPowerMW = input.mode === 'power-duration' ? input.powerMW : input.usableEnergyMWh / Math.max(input.durationH, 0.01);
  const requiredUsableMWh = input.mode === 'power-duration' ? input.powerMW * input.durationH : input.usableEnergyMWh;

  // Conversion path, stated end to end so every loss is attributable. The transformer only appears
  // when one is in scope, and the supplied sheet's discharge-side omission stays selectable.
  const wiring = (1 - L.dcCableLoss) * (1 - L.pcsLoss) * (1 - L.acCableLoss);
  const idt = transformer ? 1 - L.idtLoss : 1;
  const dischargePathEfficiency = L.dischargeEfficiencyDc * wiring * (L.idtOnDischarge ? idt : 1);
  const chargePathEfficiency = L.chargeEfficiencyDc * wiring * idt;

  const cellTempC = cellTemperature(input.ambientC, enclosure.cooling), tempFactor = temperatureFactor(cellTempC);
  const efcPerYear = input.cyclesPerDay * input.daysPerYear * input.dod;
  const unitDcMWh = enclosureEnergyKWh(enclosure) / 1000;
  const auxDischargePerUnit = enclosure.auxMWhPerDayDischarge * L.auxScale;
  const auxChargePerUnit = enclosure.auxMWhPerDayCharge * L.auxScale;

  const retention = (age: number) => input.degradation.mode === 'table'
    ? retentionFromTable(age, input.degradation.retention)
    : retentionAt(age, efcPerYear, cell, tempFactor);

  /** Usable AC energy from `units` enclosures at a given retention, after the discharge path and auxiliaries. */
  const usableAc = (units: number, r: number) =>
    Math.max(0, units * unitDcMWh * r * L.usableDcWindow * input.dod * dischargePathEfficiency - units * auxDischargePerUnit);

  // Two independent constraints set the day-one fleet: enough usable energy in the design year,
  // and enough installed capacity that rated power stays inside the system's nameplate rating.
  const designYear = input.augmentation === 'oversize-day1' ? input.projectYears : 1;
  const designRetention = retention(designYear);
  const perUnitAtDesign = usableAc(1, designRetention);
  const unitsForEnergy = perUnitAtDesign > 0 ? ceil(requiredUsableMWh / perUnitAtDesign) : Number.POSITIVE_INFINITY;
  // Putting the energy back in over a shorter window than it comes out is the more demanding
  // constraint, so the fleet and the converters are sized on whichever direction asks for more.
  const chargePowerMW = requiredUsableMWh / Math.max(input.chargeDurationH, 0.01);
  const designPowerMW = Math.max(ratedPowerMW, chargePowerMW);
  const unitsForPower = ceil(designPowerMW * 1000 / enclosure.ratedKW);
  const units = Math.max(1, Math.min(unitsForEnergy, 5000), unitsForPower);

  // Year-by-year roll-forward with per-vintage cohorts, so augmented capacity ages from its own year.
  const cohorts: Cohort[] = [{ year: 0, dcMWh: units * unitDcMWh, units }];
  const augmentations: { year: number; units: number; dcMWh: number }[] = [];
  const years: YearRow[] = [];
  const unitsAt = (y: number) => cohorts.filter(c => c.year <= y).reduce((s, c) => s + c.units, 0);
  const fleetUsable = (y: number) => cohorts.filter(c => c.year <= y).reduce((s, c) => s + usableAc(c.units, retention(y - c.year)), 0);
  const fleetStored = (y: number) => cohorts.filter(c => c.year <= y).reduce((s, c) => s + c.units * unitDcMWh * retention(y - c.year) * L.usableDcWindow * input.dod, 0);

  let previousUsable = fleetUsable(0);
  for (let y = 0; y <= input.projectYears; y++) {
    let augmentedMWh = 0;
    if (input.augmentation === 'periodic' && y > 0 && fleetUsable(y) < requiredUsableMWh) {
      const deficit = requiredUsableMWh - fleetUsable(y);
      const perNewUnit = usableAc(1, 1);
      const add = Math.max(1, ceil(deficit / Math.max(perNewUnit, 1e-9)));
      cohorts.push({ year: y, dcMWh: add * unitDcMWh, units: add });
      augmentations.push({ year: y, units: add, dcMWh: add * unitDcMWh });
      augmentedMWh = add * unitDcMWh;
    }
    const installedDcMWh = cohorts.filter(c => c.year <= y).reduce((s, c) => s + c.dcMWh, 0);
    const usableMWh = fleetUsable(y), storedDcMWh = fleetStored(y);
    const weighted = installedDcMWh > 0
      ? cohorts.filter(c => c.year <= y).reduce((s, c) => s + c.dcMWh * retention(y - c.year), 0) / installedDcMWh : 1;

    // Delivered and charged energy follow the supplied model: the mean of this year's and last
    // year's capacity, over the annual cycle count, scaled by the availability factor.
    const meanUsable = y === 0 ? 0 : (usableMWh + previousUsable) / 2;
    const meanStored = y === 0 ? 0 : (storedDcMWh + fleetStored(y - 1)) / 2;
    // A plant with more capacity than it has contracted only cycles what it must deliver, so the
    // charging energy follows the delivered energy back through the discharge and charge paths
    // rather than assuming a full cycle. Where nothing is spare the two are identical, which is
    // what the supplied sizing model computes.
    const acPerCycle = Math.min(meanUsable, requiredUsableMWh);
    const dcPerCycle = Math.min(meanStored, (acPerCycle + auxDischargePerUnit * unitsAt(y)) / Math.max(dischargePathEfficiency, 0.1));
    const scale = input.cyclesPerDay * input.daysPerYear * L.availabilityFactor * input.availability;
    const deliveredMWh = acPerCycle * scale;
    const chargeMWh = y === 0 ? 0 : (dcPerCycle / Math.max(chargePathEfficiency, 0.1)) * scale + auxChargePerUnit * unitsAt(y) * input.daysPerYear * L.availabilityFactor * input.availability;

    years.push({
      year: y, retention: weighted, installedDcMWh, storedDcMWh, usableMWh, deliveredMWh, chargeMWh,
      gridChargeMWh: chargeMWh / Math.max(1 - L.openAccessLoss, 0.05), augmentedMWh,
      shortfall: y > 0 && usableMWh + 1e-9 < requiredUsableMWh,
    });
    previousUsable = usableMWh;
  }

  const totalUnits = cohorts.reduce((s, c) => s + c.units, 0);
  const installedDcMWh = units * unitDcMWh;
  const day1UsableMWh = usableAc(units, 1);
  const pcsCount = Math.max(1, ceil(designPowerMW * 1000 / pcs.ratedKW));
  const transformerCount = transformer ? Math.max(1, ceil(designPowerMW * 1000 / input.powerFactor / transformer.ratedKVA)) : 0;
  const auxMWhPerDay = (auxChargePerUnit + auxDischargePerUnit) * units;
  const rteAc = L.chargeEfficiencyDc * L.dischargeEfficiencyDc * wiring ** 2 * (L.idtOnDischarge ? idt : 1) * idt;
  const systemCRate = ratedPowerMW / Math.max(installedDcMWh, 1e-6);
  const chargeCRate = chargePowerMW / Math.max(installedDcMWh, 1e-6);
  const packCRate = enclosureCRate(enclosure);
  const lifetimeThroughputMWh = years.reduce((s, y) => s + y.deliveredMWh, 0);
  const warrantyThroughputMWh = totalUnits * unitDcMWh * cell.cycleLife * input.dod;

  if (systemCRate > packCRate + 1e-9) warnings.push({ code: 'c-rate', level: 'error', text: `System discharge rate ${systemCRate.toFixed(2)} C exceeds the ${packCRate.toFixed(2)} C the ${pack.model} pack sustains at ${pack.continuousA} A. Add units or reduce rated power.` });
  else if (systemCRate > packCRate * 0.9) warnings.push({ code: 'c-rate-margin', level: 'warning', text: `System operates at ${(systemCRate / packCRate * 100).toFixed(0)}% of the pack continuous rating. Thermal review recommended.` });
  // The fleet is sized so the charge rate is achievable, so this only fires if the unit count hit
  // its ceiling — a catalogue or requirement that cannot be built from this product.
  if (chargeCRate > packCRate + 1e-9) warnings.push({ code: 'charge-rate', level: 'error', text: `Returning ${requiredUsableMWh.toFixed(1)} MWh in ${input.chargeDurationH} h needs ${chargeCRate.toFixed(2)} C, above the ${packCRate.toFixed(2)} C the ${pack.model} pack sustains at ${pack.continuousA} A. Allow a longer charge window.` });
  else if (chargeCRate > packCRate * 0.9) warnings.push({ code: 'charge-rate-margin', level: 'warning', text: `Charging runs at ${(chargeCRate / packCRate * 100).toFixed(0)}% of the pack continuous rating. Thermal review recommended.` });
  if (chargePowerMW > ratedPowerMW * 1.001) warnings.push({ code: 'charge-limited', level: 'info', text: `The ${input.chargeDurationH} h charge window asks for ${chargePowerMW.toFixed(2)} MW against ${ratedPowerMW.toFixed(2)} MW on discharge, so the converters and the fleet are sized on charging.` });
  if (unitsForPower > unitsForEnergy && chargePowerMW > ratedPowerMW * 1.001) {
    // The shortest window the energy-sized fleet could already deliver.
    const relaxedH = requiredUsableMWh / (unitsForEnergy * enclosure.ratedKW / 1000);
    warnings.push({
      code: 'charge-oversize', level: 'warning',
      text: `The ${input.chargeDurationH} h charge window needs ${unitsForPower} enclosures against ${unitsForEnergy} for the energy alone. Allowing ${relaxedH.toFixed(1)} h to charge would remove the difference.`,
    });
  }
  if (enclosure.dcMaxV > pcs.dcMaxV) {
    const ceiling = pcs.dcMaxV / (packOf(enclosure).maxV * enclosure.packsInSeries);
    warnings.push({
      code: 'dc-window-high', level: 'warning',
      text: `String maximum ${enclosure.dcMaxV.toFixed(1)} V at full cell voltage exceeds the ${pcs.model} DC input limit of ${pcs.dcMaxV} V. The BMS must cap charging at about ${(cell.maxV * ceiling).toFixed(2)} V per cell, which gives up roughly ${((1 - ceiling) * 100).toFixed(1)}% of nameplate energy. Confirm the charge ceiling with the converter supplier.`,
    });
  }
  if (enclosure.dcMinV < pcs.dcMinV) warnings.push({ code: 'dc-window-low', level: 'warning', text: `String minimum ${enclosure.dcMinV} V falls below the ${pcs.model} minimum of ${pcs.dcMinV} V; usable energy at low state of charge is curtailed.` });
  if (input.ambientC > cell.dischargeTempC[1]) warnings.push({ code: 'ambient-high', level: 'error', text: `Design ambient ${input.ambientC} °C exceeds the cell discharge limit of ${cell.dischargeTempC[1]} °C.` });
  if (input.ambientC > 40 && enclosure.cooling === 'air') warnings.push({ code: 'cooling', level: 'warning', text: 'Air-cooled system at high ambient: derating and accelerated ageing are likely. Consider a liquid-cooled product.' });
  if (input.altitudeM > 2000) warnings.push({ code: 'altitude', level: 'warning', text: `Altitude ${input.altitudeM} m requires insulation-coordination and cooling derating review.` });
  if (input.dod * L.usableDcWindow > 0.95) warnings.push({ code: 'dod', level: 'warning', text: 'Depth of discharge across the usable DC window exceeds 95% and may fall outside the warranty envelope.' });
  if (lifetimeThroughputMWh > warrantyThroughputMWh) warnings.push({ code: 'throughput', level: 'warning', text: `Lifetime throughput ${Math.round(lifetimeThroughputMWh).toLocaleString()} MWh exceeds the indicative warranty throughput ${Math.round(warrantyThroughputMWh).toLocaleString()} MWh.` });
  const shortfallYear = years.find(y => y.shortfall);
  if (shortfallYear) warnings.push({ code: 'capacity-shortfall', level: input.augmentation === 'none' ? 'warning' : 'error', text: `Contracted usable energy is not met from year ${shortfallYear.year}. Select an augmentation strategy or oversize day one.` });
  if (input.cyclesPerDay * input.dod > app.cyclesPerDay * app.dod * 1.5) warnings.push({ code: 'duty-cycle', level: 'info', text: `Duty cycle is heavier than the ${app.name} preset. Confirm the operating profile with the customer.` });
  const oversizeRatio = day1UsableMWh / Math.max(requiredUsableMWh, 1e-6);
  if (input.augmentation === 'oversize-day1' && oversizeRatio > 1.6) warnings.push({ code: 'oversize', level: 'warning', text: `Day-one capacity is ${oversizeRatio.toFixed(2)}× the contracted usable energy in order to carry ${input.projectYears} years unaided. Periodic augmentation is usually cheaper at this duty cycle.` });
  const headroom = installedDcMWh / Math.max(requiredUsableMWh, 1e-9);
  if (headroom > 1.6) warnings.push({
    code: 'headroom', level: 'info',
    text: (() => {
      const stored = installedDcMWh * L.usableDcWindow * input.dod;
      const afterPath = stored * designRetention * dischargePathEfficiency;
      const aux = auxDischargePerUnit * units;
      return `${installedDcMWh.toFixed(2)} MWh installed delivers ${requiredUsableMWh.toFixed(2)} MWh to the meter — ${headroom.toFixed(1)}× the contracted energy, and here is where it goes. `
        + `${Math.round(input.dod * 100)}% depth of discharge across a ${Math.round(L.usableDcWindow * 100)}% usable window leaves ${stored.toFixed(2)} MWh. `
        + `${Math.round(designRetention * 100)}% retention in the design year and ${(dischargePathEfficiency * 100).toFixed(1)}% on the discharge path leave ${afterPath.toFixed(2)} MWh. `
        + `${aux.toFixed(2)} MWh of auxiliaries leave ${(afterPath - aux).toFixed(2)} MWh, against ${requiredUsableMWh.toFixed(2)} MWh contracted; the margin is the last whole unit rounding up.`;
    })(),
  });
  if (unitsForPower > unitsForEnergy) warnings.push({ code: 'power-limited', level: 'info', text: `Fleet size is set by the ${enclosure.ratedKW} kW system rating, not by the energy requirement: ${unitsForPower} units are needed for ${ratedPowerMW.toFixed(2)} MW against ${unitsForEnergy} for the energy alone.` });
  if (pcsCount * pcs.ratedKW > ratedPowerMW * 1000 * 1.25) warnings.push({ code: 'pcs-granularity', level: 'info', text: `Installed conversion capacity ${(pcsCount * pcs.ratedKW / 1000).toFixed(2)} MW exceeds the ${ratedPowerMW.toFixed(2)} MW requirement because of unit granularity. A smaller PCS may reduce cost.` });
  if (!L.idtOnDischarge && transformer) warnings.push({ code: 'idt-discharge', level: 'info', text: 'Transformer loss is excluded on discharge, matching the supplied sizing sheet. Including it on both directions is the physically consistent treatment and costs about 1% of delivered energy.' });
  if (input.degradation.mode === 'table' && input.projectYears > input.degradation.retention.length - 1) warnings.push({ code: 'degradation-extrapolated', level: 'info', text: `The degradation schedule covers ${input.degradation.retention.length - 1} years; beyond that the last year-on-year step is repeated.` });
  warnings.push({ code: 'validation', level: 'info', text: 'Sizing uses the supplied degradation schedule and loss chain. Supplier warranty curves and a site thermal study are required before contract.' });

  return {
    input, enclosure, pcs, transformer, requiredUsableMWh, ratedPowerMW,
    effectiveDurationH: requiredUsableMWh / Math.max(ratedPowerMW, 1e-6), chargePowerMW, chargeCRate,
    units, totalUnits, installedDcMWh, day1UsableMWh,
    packs: units * enclosure.racks * enclosure.packsPerRack, cells: units * enclosureCellCount(enclosure),
    racks: units * enclosure.racks, strings: units * enclosureStrings(enclosure),
    footprintM2: units * enclosureFootprintM2(enclosure), massTonnes: units * enclosure.massKg / 1000,
    pcsCount, pcsTotalMW: pcsCount * pcs.ratedKW / 1000, transformerCount,
    transformerTotalMVA: transformer ? transformerCount * transformer.ratedKVA / 1000 : 0,
    dcVoltageWindow: [enclosure.dcMinV, enclosure.dcMaxV], systemCRate, packCRate,
    auxMWhPerDay, dischargePathEfficiency, chargePathEfficiency, rteAc,
    cellTempC, tempFactor, efcPerYear, years, cohorts, augmentations,
    endOfLifeRetention: years.at(-1)?.retention ?? 1, warrantyThroughputMWh, lifetimeThroughputMWh, warnings,
  };
}

/** Nameplate figures for the system, shown next to the sizing result. */
export const enclosureSummary = (enc: EnclosureSpec) => ({
  energyKWh: enclosureEnergyKWh(enc), packEnergyKWh: packEnergyKWh(packOf(enc)),
  cells: enclosureCellCount(enc), footprintM2: enclosureFootprintM2(enc),
  chemistry: cellOf(packOf(enc)).chemistry, strings: enclosureStrings(enc),
});
