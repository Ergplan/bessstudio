import { application } from './applications';
import type { SizingResult } from './engine';
import { type PriceBook, type Currency, convert } from '../catalog/pricing';
import { auxDutyFactor } from '../catalog/products';

export type CostLine = { id: string; category: 'equipment' | 'balance-of-plant' | 'services' | 'commercial'; label: string; quantity: number; unit: string; unitCostUsd: number; totalUsd: number; note?: string };
export type CashRow = { year: number; capexUsd: number; opexUsd: number; chargingUsd: number; benefitUsd: number; netUsd: number; discountedUsd: number; cumulativeUsd: number; dischargedMWh: number };

export type FinanceResult = {
  lines: CostLine[];
  equipmentUsd: number; bopUsd: number; servicesUsd: number; subtotalUsd: number;
  contingencyUsd: number; marginUsd: number; taxUsd: number; capexUsd: number;
  capexPerKWhUsd: number; capexPerKWUsd: number;
  rows: CashRow[];
  lifetimeDischargeMWh: number; lcosPerMWhUsd: number;
  npvUsd: number; irrPct: number | null; paybackYears: number | null;
  annualBenefitUsd: number; augmentationUsd: number;
};

/** Itemised day-one cost stack, before contingency, margin and tax. */
export function costLines(sizing: SizingResult, pb: PriceBook): CostLine[] {
  const enc = sizing.enclosure, kwh = sizing.installedDcMWh * 1000, kw = sizing.ratedPowerMW * 1000;
  const batteryRate = pb.batteryPerKWh[enc.id] ?? 110, pcsRate = pb.pcsPerKW[sizing.pcs.id] ?? 45;
  const txRate = sizing.transformer ? pb.transformerPerKVA[sizing.transformer.id] ?? 20 : 0;
  const line = (id: string, category: CostLine['category'], label: string, quantity: number, unit: string, unitCostUsd: number, note?: string): CostLine =>
    ({ id, category, label, quantity, unit, unitCostUsd, totalUsd: quantity * unitCostUsd, note });
  const lines: CostLine[] = [
    line('battery', 'equipment', `${enc.model} ${enc.family} · ${(sizing.installedDcMWh / sizing.units).toFixed(3)} MWh each`, kwh, 'kWh DC', batteryRate, `${sizing.units} × ${enc.model}`),
    line('pcs', 'equipment', `${sizing.pcs.model} power conversion system`, sizing.pcsCount * sizing.pcs.ratedKW, 'kW', pcsRate, `${sizing.pcsCount} × ${sizing.pcs.ratedKW} kW`),
  ];
  if (sizing.transformer) lines.push(line('transformer', 'equipment', `${sizing.transformer.model} step-up transformer`, sizing.transformerCount * sizing.transformer.ratedKVA, 'kVA', txRate, `${sizing.transformerCount} × ${sizing.transformer.ratedKVA} kVA`));
  lines.push(
    line('bop', 'balance-of-plant', 'MV/LV switchgear, cabling, protection and earthing', kw, 'kW', pb.bopPerKW),
    line('civil', 'balance-of-plant', 'Foundations, plinths, access and site works', sizing.footprintM2 * 1.8, 'm²', pb.civilPerM2, 'Footprint plus service clearance'),
    line('epc', 'services', 'Installation, integration and cable termination', kwh, 'kWh DC', pb.epcPerKWh),
    line('freight', 'services', 'Inland and ocean freight', sizing.units, 'unit', pb.freightPerUnit),
    line('commissioning', 'services', 'Commissioning, site acceptance testing and handover', sizing.units, 'unit', pb.commissioningPerUnit),
    line('engineering', 'services', 'Detailed engineering, grid studies and documentation', 1, 'lot', pb.engineeringFixed),
  );
  return lines;
}

const npvOf = (rate: number, flows: number[]) => flows.reduce((s, f, t) => s + f / (1 + rate) ** t, 0);

function irrOf(flows: number[]): number | null {
  if (flows[0] >= 0 || flows.every(f => f <= 0)) return null;
  let lo = -0.95, hi = 4;
  if (npvOf(lo, flows) * npvOf(hi, flows) > 0) return null;
  for (let i = 0; i < 200; i++) { const mid = (lo + hi) / 2; if (npvOf(lo, flows) * npvOf(mid, flows) <= 0) hi = mid; else lo = mid; }
  return (lo + hi) / 2;
}

/**
 * Annual gross revenue or avoided cost for the application, before any operating or charging cost.
 * Charging energy is priced separately in the cash-flow roll-forward so it is never counted twice.
 */
export function annualBenefitUsd(sizing: SizingResult, pb: PriceBook) {
  const app = application(sizing.input.applicationId), kw = sizing.ratedPowerMW * 1000;
  const dischargedMWh = sizing.requiredUsableMWh * sizing.input.cyclesPerDay * sizing.input.daysPerYear * sizing.input.availability;
  switch (app.revenueModel) {
    case 'demand-charge': return kw * pb.demandChargePerKWMonth * 12 * sizing.input.availability;
    case 'spread': return dischargedMWh * pb.energySellPerMWh;
    case 'capacity-payment': return kw * pb.capacityPaymentPerKWYear * sizing.input.availability;
    case 'self-consumption': return dischargedMWh * pb.energySellPerMWh;
    case 'fuel-offset': return dischargedMWh * 1000 * pb.dieselLitrePerKWh * pb.dieselPerLitre;
    case 'reliability': return kw * pb.demandChargePerKWMonth * 2; // outage-avoidance proxy only
  }
}

/** Energy bought each year: the application's net import share plus round-trip losses on everything cycled. */
export const chargingEnergyMWh = (sizing: SizingResult, throughputMWh: number) => {
  const factor = application(sizing.input.applicationId).chargeFactor;
  return throughputMWh * factor + throughputMWh * (1 / Math.max(sizing.rteAc, 0.5) - 1);
};

export function evaluateFinance(sizing: SizingResult, pb: PriceBook): FinanceResult {
  const lines = costLines(sizing, pb);
  const sum = (cat: CostLine['category']) => lines.filter(l => l.category === cat).reduce((s, l) => s + l.totalUsd, 0);
  const equipmentUsd = sum('equipment'), bopUsd = sum('balance-of-plant'), servicesUsd = sum('services');
  const subtotalUsd = equipmentUsd + bopUsd + servicesUsd;
  const contingencyUsd = subtotalUsd * pb.contingencyPct / 100;
  const marginUsd = (subtotalUsd + contingencyUsd) * pb.marginPct / 100;
  const taxUsd = (subtotalUsd + contingencyUsd + marginUsd) * pb.taxPct / 100;
  const capexUsd = subtotalUsd + contingencyUsd + marginUsd + taxUsd;

  const kw = sizing.ratedPowerMW * 1000, kwh = sizing.installedDcMWh * 1000;
  const batteryRate = pb.batteryPerKWh[sizing.enclosure.id] ?? 110;
  const unitKWh = sizing.installedDcMWh * 1000 / sizing.units;
  const baseBenefit = annualBenefitUsd(sizing, pb);
  const r = pb.discountRatePct / 100, infl = pb.inflationPct / 100;

  const rows: CashRow[] = []; let cumulative = 0, augmentationUsd = 0;
  for (const y of sizing.years) {
    const aug = sizing.augmentations.find(a => a.year === y.year);
    const augCapex = aug ? aug.units * unitKWh * batteryRate * (1 - pb.batteryPriceDeclinePct / 100) ** y.year * (1 + pb.marginPct / 100) : 0;
    augmentationUsd += augCapex;
    const capex = (y.year === 0 ? capexUsd : 0) + augCapex;
    const escal = (1 + infl) ** y.year;
    const opex = y.year === 0 ? 0 : (kw * pb.omPerKWYear + capexUsd * pb.insurancePctPerYear / 100 + y.installedDcMWh * 1000 * pb.ltsaPerKWhYear) * escal;
    const charging = y.year === 0 ? 0 : (chargingEnergyMWh(sizing, y.throughputMWh) + sizing.auxKW * 8760 * auxDutyFactor / 1000) * pb.energyBuyPerMWh * escal;
    const benefit = y.year === 0 ? 0 : baseBenefit * escal * (y.usableMWh >= sizing.requiredUsableMWh ? 1 : y.usableMWh / sizing.requiredUsableMWh);
    const net = benefit - opex - charging - capex;
    cumulative += net;
    rows.push({ year: y.year, capexUsd: capex, opexUsd: opex, chargingUsd: charging, benefitUsd: benefit, netUsd: net, discountedUsd: net / (1 + r) ** y.year, cumulativeUsd: cumulative, dischargedMWh: y.throughputMWh });
  }

  const flows = rows.map(x => x.netUsd);
  const npvUsd = npvOf(r, flows), irr = irrOf(flows);
  const discountedEnergy = rows.reduce((s, x) => s + x.dischargedMWh / (1 + r) ** x.year, 0);
  const discountedCost = rows.reduce((s, x) => s + (x.capexUsd + x.opexUsd + x.chargingUsd) / (1 + r) ** x.year, 0);
  const crossing = rows.find(x => x.cumulativeUsd >= 0 && x.year > 0);
  const prior = crossing ? rows[rows.indexOf(crossing) - 1] : undefined;
  const paybackYears = crossing && prior ? prior.year + (-prior.cumulativeUsd) / (crossing.cumulativeUsd - prior.cumulativeUsd) : null;

  return {
    lines, equipmentUsd, bopUsd, servicesUsd, subtotalUsd, contingencyUsd, marginUsd, taxUsd, capexUsd,
    capexPerKWhUsd: capexUsd / Math.max(kwh, 1), capexPerKWUsd: capexUsd / Math.max(kw, 1),
    rows, lifetimeDischargeMWh: rows.reduce((s, x) => s + x.dischargedMWh, 0),
    lcosPerMWhUsd: discountedEnergy > 0 ? discountedCost / discountedEnergy : 0,
    npvUsd, irrPct: irr === null ? null : irr * 100, paybackYears,
    annualBenefitUsd: baseBenefit, augmentationUsd,
  };
}

export const inCurrency = (usd: number, currency: Currency) => convert(usd, currency);
