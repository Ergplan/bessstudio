import { type SizingResult } from '../sizing/engine';
import { type FinanceResult } from '../sizing/finance';
import { convert, type Currency, type PriceBook } from '../catalog/pricing';
import { nowIso, uid, type Customer, type Project, type Quote, type QuoteLine } from '../platform/types';

export const scopeIncludedDefault = [
  'Supply of battery energy storage enclosures with integrated BMS, thermal management and fire detection',
  'Power conversion system and factory-tested DC connection kit',
  'Detailed engineering, single-line diagrams, layout drawings and O&M documentation',
  'Installation supervision, commissioning and site acceptance testing',
  'Operator training and first-year remote monitoring',
];
export const scopeExcludedDefault = [
  'Grid connection application, utility charges and export licensing',
  'Civil works beyond the quoted foundation scope, site security and fencing',
  'Import duties, local taxes and statutory approvals unless separately stated',
  'Auxiliary supply, communications backhaul and metering owned by the network operator',
  'Any works arising from site conditions not disclosed at the time of quotation',
];
export const assumptionsDefault = (sizing: SizingResult) => [
  `Duty cycle of ${sizing.input.cyclesPerDay} cycle(s) per day over ${sizing.input.daysPerYear} days per year at ${Math.round(sizing.input.dod * 100)}% depth of discharge.`,
  `Design ambient temperature ${sizing.input.ambientC} °C at ${sizing.input.altitudeM} m altitude; site thermal study to confirm.`,
  `Grid connection at ${sizing.input.gridKV} kV, ${sizing.input.frequencyHz} Hz, power factor ${sizing.input.powerFactor}.`,
  'Capacity retention follows catalogue ageing anchors; supplier warranty curves govern the contract.',
  'Prices are based on the price book in force on the quotation date and are subject to the stated validity.',
];

/** Sell-price uplift that carries contingency and margin without exposing either on the customer document. */
export const uplift = (finance: FinanceResult) => (finance.subtotalUsd > 0 ? (finance.subtotalUsd + finance.contingencyUsd + finance.marginUsd) / finance.subtotalUsd : 1);

export function buildQuoteLines(sizing: SizingResult, finance: FinanceResult, currency: Currency): QuoteLine[] {
  const factor = uplift(finance);
  const lines = finance.lines.map<QuoteLine>(l => {
    const unitPrice = convert(l.unitCostUsd * factor, currency);
    return { id: l.id, category: l.category, label: l.label, quantity: Number(l.quantity.toFixed(3)), unit: l.unit, unitPrice, total: unitPrice * l.quantity, note: l.note, optional: false };
  });
  const omUsd = sizing.ratedPowerMW * 1000 * 7.5 * 2;
  lines.push({
    id: 'ltsa', category: 'services', label: 'Extended service agreement — years 3 to 5 (optional)', quantity: 1, unit: 'lot',
    unitPrice: convert(omUsd * factor, currency), total: convert(omUsd * factor, currency),
    note: 'Preventive maintenance, spares and performance reporting', optional: true,
  });
  return lines;
}

export function quoteTotals(lines: QuoteLine[], discountPct: number, taxPct: number, freight: number) {
  const subtotal = lines.filter(l => !l.optional).reduce((s, l) => s + l.total, 0);
  const discount = subtotal * discountPct / 100;
  const taxable = subtotal - discount + freight;
  const tax = taxable * taxPct / 100;
  return { subtotal, discount, tax, total: taxable + tax };
}

/** Sequential per-year quote number: JW-Q-2026-0007. */
export const nextQuoteNumber = (existing: Quote[], prefix = 'JW-Q') => {
  const year = new Date().getFullYear();
  const used = existing.filter(q => q.number.includes(`-${year}-`)).map(q => Number(q.number.split('-').at(-1)) || 0);
  return `${prefix}-${year}-${String(Math.max(0, ...used) + 1).padStart(4, '0')}`;
};

export function createQuote(args: {
  orgId: string; customer: Customer; project: Project; sizing: SizingResult; finance: FinanceResult;
  priceBook: PriceBook; currency: Currency; number: string; preparedBy: string; preparedByEmail: string;
}): Quote {
  const lines = buildQuoteLines(args.sizing, args.finance, args.currency);
  const totals = quoteTotals(lines, 0, args.priceBook.taxPct, 0);
  const validUntil = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
  return {
    id: uid('qt'), orgId: args.orgId, customerId: args.customer.id, customerName: args.customer.name,
    projectId: args.project.id, projectName: args.project.name,
    number: args.number, version: 1, status: 'draft', currency: args.currency, lines,
    discountPct: 0, taxPct: args.priceBook.taxPct, freight: 0, ...totals,
    validUntil, incoterms: 'DDP site', paymentTerms: '20% advance, 70% against dispatch, 10% on commissioning',
    deliveryWeeks: 20, warrantyYears: 5,
    scopeIncluded: [...scopeIncludedDefault], scopeExcluded: [...scopeExcludedDefault], assumptions: assumptionsDefault(args.sizing),
    sizingSnapshot: { input: args.sizing.input, units: args.sizing.units, installedDcMWh: args.sizing.installedDcMWh, ratedPowerMW: args.sizing.ratedPowerMW, enclosure: args.sizing.enclosure.model, pcs: args.sizing.pcs.model, rteAc: args.sizing.rteAc, endOfLifeRetention: args.sizing.endOfLifeRetention, years: args.sizing.years, augmentations: args.sizing.augmentations },
    financeSnapshot: { capexUsd: args.finance.capexUsd, lcosPerMWhUsd: args.finance.lcosPerMWhUsd, npvUsd: args.finance.npvUsd, irrPct: args.finance.irrPct, paybackYears: args.finance.paybackYears },
    priceBookId: args.priceBook.id, preparedBy: args.preparedBy, preparedByEmail: args.preparedByEmail,
    createdAt: nowIso(), updatedAt: nowIso(), sentAt: null,
  };
}

/** A revision is a new document that keeps the number and advances the version. */
export const reviseQuote = (quote: Quote): Quote => ({
  ...quote, id: uid('qt'), version: quote.version + 1, status: 'draft', sentAt: null,
  createdAt: nowIso(), updatedAt: nowIso(),
  validUntil: new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10),
});
