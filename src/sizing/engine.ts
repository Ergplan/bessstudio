import { application, type ApplicationId } from './applications';
import {
  byId, cellOf, packOf, enclosures, pcsUnits, transformers, enclosureEnergyKWh,
  enclosureCellCount, enclosureFootprintM2, packEnergyKWh,
  type EnclosureSpec, type PcsSpec, type TransformerSpec,
} from '../catalog/products';

export type AugmentationStrategy = 'none' | 'oversize-day1' | 'periodic';
export type SizingMode = 'power-duration' | 'usable-energy';

export type SizingInput = {
  applicationId: ApplicationId; mode: SizingMode;
  powerMW: number; durationH: number; usableEnergyMWh: number;
  cyclesPerDay: number; daysPerYear: number; projectYears: number;
  dod: number; availability: number;
  ambientC: number; altitudeM: number;
  enclosureId: string; pcsId: string; transformerId: string | null;
  augmentation: AugmentationStrategy;
  gridKV: number; frequencyHz: 50 | 60; powerFactor: number;
};

export type SizingWarning = { code: string; level: 'error' | 'warning' | 'info'; text: string };
export type YearRow = { year: number; retention: number; installedDcMWh: number; usableMWh: number; throughputMWh: number; augmentedMWh: number; shortfall: boolean };
export type Cohort = { year: number; dcMWh: number; units: number };

export type SizingResult = {
  input: SizingInput;
  enclosure: EnclosureSpec; pcs: PcsSpec; transformer: TransformerSpec | null;
  requiredUsableMWh: number; ratedPowerMW: number; effectiveDurationH: number;
  units: number; totalUnits: number; installedDcMWh: number; day1UsableMWh: number;
  packs: number; cells: number; racks: number;
  footprintM2: number; massTonnes: number;
  pcsCount: number; pcsTotalMW: number; transformerCount: number; transformerTotalMVA: number;
  dcVoltageWindow: [number, number]; systemCRate: number;
  auxKW: number; rteDc: number; rteAc: number; oneWayDischarge: number;
  cellTempC: number; tempFactor: number; efcPerYear: number;
  years: YearRow[]; cohorts: Cohort[]; augmentations: { year: number; units: number; dcMWh: number }[];
  endOfLifeRetention: number; warrantyThroughputMWh: number; lifetimeThroughputMWh: number;
  warnings: SizingWarning[];
};

export const defaultSizingInput = (applicationId: ApplicationId = 'peak-shaving'): SizingInput => {
  const a = application(applicationId);
  return {
    applicationId, mode: 'power-duration', powerMW: 2.5, durationH: a.durationH, usableEnergyMWh: 2.5 * a.durationH,
    cyclesPerDay: a.cyclesPerDay, daysPerYear: a.daysPerYear, projectYears: 20, dod: a.dod, availability: a.availability,
    ambientC: 35, altitudeM: 100, enclosureId: 'enc-5mwh-20ft', pcsId: 'pcs-2500', transformerId: 'tx-3150',
    augmentation: a.cyclesPerDay * a.dod > 1 ? 'periodic' : 'oversize-day1', gridKV: 33, frequencyHz: 50, powerFactor: 0.95,
  };
};

/** Cell temperature seen by the ageing model, from ambient and the cooling strategy. */
export const cellTemperature = (ambientC: number, cooling: EnclosureSpec['cooling']) =>
  cooling === 'liquid' ? Math.min(38, Math.max(18, 25 + (ambientC - 25) * 0.25)) : Math.min(48, Math.max(18, 25 + (ambientC - 25) * 0.6));

/** Arrhenius-style ageing multiplier, doubling roughly every 12 K above 25 °C. Simplified; supplier curves override. */
export const temperatureFactor = (cellTempC: number) => 2 ** ((cellTempC - 25) / 12);

/**
 * Capacity retention of one cohort after `age` years of service.
 * Calendar fade follows a square-root-of-time law, cycle fade is linear in equivalent full cycles.
 * Both are anchored on the catalogue warranty points and scaled by the thermal factor.
 */
export function retentionAt(age: number, efcPerYear: number, cell: ReturnType<typeof cellOf>, tempFactor: number) {
  if (age <= 0) return 1;
  const calA = (1 - cell.calendarRetention) / Math.sqrt(cell.calendarYears);
  const perEfc = (1 - cell.cycleLifeRetention) / cell.cycleLife;
  const fade = tempFactor * (calA * Math.sqrt(age) + perEfc * efcPerYear * age);
  return Math.min(1, Math.max(0.2, 1 - fade));
}

const ceil = (n: number) => Math.ceil(n - 1e-9);

export function sizeSystem(input: SizingInput): SizingResult {
  const enclosure = byId(enclosures, input.enclosureId), pcs = byId(pcsUnits, input.pcsId);
  const transformer = input.transformerId ? byId(transformers, input.transformerId) : null;
  const pack = packOf(enclosure), cell = cellOf(pack), app = application(input.applicationId);
  const warnings: SizingWarning[] = [];

  const ratedPowerMW = input.mode === 'power-duration' ? input.powerMW : input.usableEnergyMWh / Math.max(input.durationH, 0.01);
  const requiredUsableMWh = input.mode === 'power-duration' ? input.powerMW * input.durationH : input.usableEnergyMWh;

  const txEff = transformer?.efficiency ?? 1;
  const oneWayDischarge = Math.sqrt(cell.dcEfficiency) * pcs.efficiency * txEff;
  const rteDc = cell.dcEfficiency, rteAcGross = cell.dcEfficiency * pcs.efficiency ** 2 * txEff ** 2;

  const cellTempC = cellTemperature(input.ambientC, enclosure.cooling), tempFactor = temperatureFactor(cellTempC);
  const efcPerYear = input.cyclesPerDay * input.daysPerYear * input.dod;
  const unitDcMWh = enclosureEnergyKWh(enclosure) / 1000;

  // Day-1 fleet is sized for the worst year the strategy has to carry unaided. Oversizing carries
  // the whole life; periodic augmentation and an unmaintained fleet are both sized for day one,
  // and the roll-forward below then either tops the fleet up or reports the shortfall.
  const designYear = input.augmentation === 'oversize-day1' ? input.projectYears : 1;
  const designRetention = retentionAt(designYear, efcPerYear, cell, tempFactor);
  // Availability is a time metric: it limits how often the system can run, not how much energy a
  // healthy system delivers in one discharge. It is applied to throughput and revenue, not here.
  const deliverablePerMWh = (r: number) => r * input.dod * oneWayDischarge;
  // Two independent constraints set the day-one fleet: enough usable energy in the design year, and
  // enough installed energy that rated power stays inside the cell's discharge rate.
  const unitsForEnergy = ceil(requiredUsableMWh / (unitDcMWh * deliverablePerMWh(designRetention)));
  const unitsForPower = ceil(ratedPowerMW / (cell.dischargeC * unitDcMWh));
  const units = Math.max(1, unitsForEnergy, unitsForPower);

  // Year-by-year roll-forward with per-vintage cohorts, so augmented capacity ages from its own install year.
  const cohorts: Cohort[] = [{ year: 0, dcMWh: units * unitDcMWh, units }];
  const augmentations: { year: number; units: number; dcMWh: number }[] = [];
  const years: YearRow[] = [];
  const fleetUsable = (y: number) => cohorts.reduce((sum, c) => sum + c.dcMWh * deliverablePerMWh(retentionAt(y - c.year, efcPerYear, cell, tempFactor)), 0);

  for (let y = 0; y <= input.projectYears; y++) {
    let augmentedMWh = 0;
    if (input.augmentation === 'periodic' && y > 0 && fleetUsable(y) < requiredUsableMWh) {
      const deficit = requiredUsableMWh - fleetUsable(y);
      const add = Math.max(1, ceil(deficit / (unitDcMWh * deliverablePerMWh(1))));
      cohorts.push({ year: y, dcMWh: add * unitDcMWh, units: add });
      augmentations.push({ year: y, units: add, dcMWh: add * unitDcMWh });
      augmentedMWh = add * unitDcMWh;
    }
    const installedDcMWh = cohorts.filter(c => c.year <= y).reduce((s, c) => s + c.dcMWh, 0);
    const usableMWh = fleetUsable(y);
    const weighted = installedDcMWh > 0 ? cohorts.filter(c => c.year <= y).reduce((s, c) => s + c.dcMWh * retentionAt(y - c.year, efcPerYear, cell, tempFactor), 0) / installedDcMWh : 1;
    years.push({
      year: y, retention: weighted, installedDcMWh, usableMWh, augmentedMWh,
      throughputMWh: y === 0 ? 0 : Math.min(usableMWh, requiredUsableMWh) * input.cyclesPerDay * input.daysPerYear * input.availability,
      shortfall: y > 0 && usableMWh + 1e-9 < requiredUsableMWh,
    });
  }

  const totalUnits = cohorts.reduce((s, c) => s + c.units, 0);
  const installedDcMWh = units * unitDcMWh;
  const day1UsableMWh = installedDcMWh * deliverablePerMWh(1);
  const pcsCount = Math.max(1, ceil(ratedPowerMW * 1000 / pcs.ratedKW));
  const transformerCount = transformer ? Math.max(1, ceil(ratedPowerMW * 1000 / input.powerFactor / transformer.ratedKVA)) : 0;
  const auxKW = enclosure.auxKWPerMWh * installedDcMWh * (1 + Math.max(0, input.ambientC - 35) * 0.03);
  const rteAc = Math.max(0, rteAcGross - auxKW / Math.max(ratedPowerMW * 1000, 1) * 0.5);
  const systemCRate = ratedPowerMW / Math.max(installedDcMWh, 1e-6);
  const lifetimeThroughputMWh = years.reduce((s, y) => s + y.throughputMWh, 0);
  const warrantyThroughputMWh = totalUnits * unitDcMWh * cell.cycleLife * input.dod;

  if (systemCRate > cell.dischargeC + 1e-9) warnings.push({ code: 'c-rate', level: 'error', text: `System discharge rate ${systemCRate.toFixed(2)} C exceeds the ${cell.dischargeC} C cell rating. Add enclosures or reduce rated power.` });
  else if (systemCRate > cell.dischargeC * 0.9) warnings.push({ code: 'c-rate-margin', level: 'warning', text: `System operates at ${(systemCRate / cell.dischargeC * 100).toFixed(0)}% of the cell discharge rating. Thermal review recommended.` });
  if (unitsForPower > unitsForEnergy) warnings.push({ code: 'power-limited', level: 'info', text: `Fleet size is set by the ${cell.dischargeC} C discharge rating, not by the energy requirement: ${unitsForPower} enclosures are needed for ${ratedPowerMW.toFixed(2)} MW against ${unitsForEnergy} for the energy alone.` });
  if (pcsCount * pcs.ratedKW > ratedPowerMW * 1000 * 1.25) warnings.push({ code: 'pcs-granularity', level: 'info', text: `Installed conversion capacity ${(pcsCount * pcs.ratedKW / 1000).toFixed(2)} MW exceeds the ${ratedPowerMW.toFixed(2)} MW requirement because of unit granularity. A smaller PCS may reduce cost.` });
  if (enclosure.dcMaxV > pcs.dcMaxV) warnings.push({ code: 'dc-window-high', level: 'error', text: `String maximum ${enclosure.dcMaxV} V exceeds the ${pcs.model} maximum DC input of ${pcs.dcMaxV} V.` });
  if (enclosure.dcMinV < pcs.dcMinV) warnings.push({ code: 'dc-window-low', level: 'warning', text: `String minimum ${enclosure.dcMinV} V falls below the ${pcs.model} MPP minimum of ${pcs.dcMinV} V; usable energy at low state of charge is curtailed.` });
  if (input.ambientC > cell.dischargeTempC[1]) warnings.push({ code: 'ambient-high', level: 'error', text: `Design ambient ${input.ambientC} °C exceeds the cell discharge limit of ${cell.dischargeTempC[1]} °C.` });
  if (input.ambientC > 40 && enclosure.cooling === 'air') warnings.push({ code: 'cooling', level: 'warning', text: 'Air-cooled enclosure at high ambient: derating and accelerated ageing are likely. Consider a liquid-cooled product.' });
  if (input.altitudeM > 2000) warnings.push({ code: 'altitude', level: 'warning', text: `Altitude ${input.altitudeM} m requires insulation-coordination and cooling derating review.` });
  if (input.dod > 0.95) warnings.push({ code: 'dod', level: 'warning', text: 'Depth of discharge above 95% shortens cycle life and may fall outside the warranty envelope.' });
  if (lifetimeThroughputMWh > warrantyThroughputMWh) warnings.push({ code: 'throughput', level: 'warning', text: `Lifetime throughput ${Math.round(lifetimeThroughputMWh).toLocaleString()} MWh exceeds the indicative warranty throughput ${Math.round(warrantyThroughputMWh).toLocaleString()} MWh.` });
  const shortfallYear = years.find(y => y.shortfall);
  if (shortfallYear) warnings.push({ code: 'capacity-shortfall', level: input.augmentation === 'none' ? 'warning' : 'error', text: `Contracted usable energy is not met from year ${shortfallYear.year}. Select an augmentation strategy or oversize day one.` });
  if (input.cyclesPerDay * input.dod > app.cyclesPerDay * app.dod * 1.5) warnings.push({ code: 'duty-cycle', level: 'info', text: `Duty cycle is heavier than the ${app.name} preset. Confirm the operating profile with the customer.` });
  const oversizeRatio = day1UsableMWh / Math.max(requiredUsableMWh, 1e-6);
  if (input.augmentation === 'oversize-day1' && oversizeRatio > 1.6) warnings.push({ code: 'oversize', level: 'warning', text: `Day-one capacity is ${oversizeRatio.toFixed(2)}× the contracted usable energy in order to carry ${input.projectYears} years unaided. Periodic augmentation is usually cheaper at this duty cycle.` });
  warnings.push({ code: 'validation', level: 'info', text: 'Sizing uses catalogue ageing anchors. Supplier warranty curves and a site thermal study are required before contract.' });

  return {
    input, enclosure, pcs, transformer, requiredUsableMWh, ratedPowerMW,
    effectiveDurationH: requiredUsableMWh / Math.max(ratedPowerMW, 1e-6),
    units, totalUnits, installedDcMWh, day1UsableMWh,
    packs: units * enclosure.racks * enclosure.packsPerRack, cells: units * enclosureCellCount(enclosure), racks: units * enclosure.racks,
    footprintM2: units * enclosureFootprintM2(enclosure), massTonnes: units * enclosure.massKg / 1000,
    pcsCount, pcsTotalMW: pcsCount * pcs.ratedKW / 1000, transformerCount,
    transformerTotalMVA: transformer ? transformerCount * transformer.ratedKVA / 1000 : 0,
    dcVoltageWindow: [enclosure.dcMinV, enclosure.dcMaxV], systemCRate,
    auxKW, rteDc, rteAc, oneWayDischarge, cellTempC, tempFactor, efcPerYear,
    years, cohorts, augmentations,
    endOfLifeRetention: years.at(-1)?.retention ?? 1, warrantyThroughputMWh, lifetimeThroughputMWh, warnings,
  };
}

/** Nameplate figures for the enclosure, shown next to the sizing result. */
export const enclosureSummary = (enc: EnclosureSpec) => ({
  energyKWh: enclosureEnergyKWh(enc), packEnergyKWh: packEnergyKWh(packOf(enc)),
  cells: enclosureCellCount(enc), footprintM2: enclosureFootprintM2(enc), chemistry: cellOf(packOf(enc)).chemistry,
});
