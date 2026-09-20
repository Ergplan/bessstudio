// Commercial price book. Values are indicative platform defaults so a quote can be produced in a
// first meeting; every organization overrides them with its own negotiated rates before issue.
export type Currency = 'USD' | 'INR' | 'EUR' | 'GBP' | 'AUD' | 'AED';

export const currencies: Record<Currency, { symbol: string; name: string; perUsd: number; decimals: number }> = {
  USD: { symbol: '$', name: 'US dollar', perUsd: 1, decimals: 2 },
  INR: { symbol: '₹', name: 'Indian rupee', perUsd: 88, decimals: 0 },
  EUR: { symbol: '€', name: 'Euro', perUsd: 0.92, decimals: 2 },
  GBP: { symbol: '£', name: 'Pound sterling', perUsd: 0.79, decimals: 2 },
  AUD: { symbol: 'A$', name: 'Australian dollar', perUsd: 1.52, decimals: 2 },
  AED: { symbol: 'AED', name: 'UAE dirham', perUsd: 3.67, decimals: 2 },
};

/**
 * Landed-cost build-up for an imported system, following the supplied supply offer:
 * FOB → ocean freight → CIF → exchange → customs duty and inland clearance on CIF → delivered,
 * with the power conversion system priced separately in local currency.
 */
export type LandedCost = {
  basicPriceUsdPerKWh: number; oceanFreightPct: number; exchangeRateInrPerUsd: number;
  customsDutyPct: number; inlandClearancePct: number; pcsCostInrPerKW: number;
};

export type CostingMode = 'landed-import' | 'direct';
export type SupplyScope = 'supply-only' | 'turnkey';
export type ChargeSource = 'grid' | 'open-access-solar';

export type PriceBook = {
  id: string; name: string; currency: Currency; updatedAt: string;
  costingMode: CostingMode; supplyScope: SupplyScope; landed: LandedCost;
  batteryPerKWh: Record<string, number>;   // by enclosure id, per kWh DC nameplate
  pcsPerKW: Record<string, number>;        // by PCS id, per kW rated
  transformerPerKVA: Record<string, number>;
  bopPerKW: number; epcPerKWh: number; civilPerM2: number;
  freightPerUnit: number; commissioningPerUnit: number; engineeringFixed: number;
  contingencyPct: number; marginPct: number; taxPct: number;
  omPerKWYear: number; insurancePctPerYear: number; ltsaPerKWhYear: number;
  batteryPriceDeclinePct: number; discountRatePct: number; inflationPct: number;
  chargeSource: ChargeSource; solarPpaPerMWh: number;
  energyBuyPerMWh: number; energySellPerMWh: number; demandChargePerKWMonth: number;
  capacityPaymentPerKWYear: number; dieselPerLitre: number; dieselLitrePerKWh: number;
};

/** The supply offer prices 2 507.5 kW of conversion at ₹3 250 000, which sets the default rate. */
export const offerPcsInrPerKW = 3_250_000 / 2507.5;

export const defaultLandedCost = (): LandedCost => ({
  basicPriceUsdPerKWh: 68, oceanFreightPct: 1.5, exchangeRateInrPerUsd: 97,
  customsDutyPct: 11, inlandClearancePct: 1.5, pcsCostInrPerKW: offerPcsInrPerKW,
});

export type LandedBreakdown = {
  kWh: number; ratedKW: number;
  fobUsd: number; oceanFreightUsd: number; cifUsd: number; cifInr: number;
  customsDutyInr: number; inlandClearanceInr: number; deliveredInr: number;
  pcsInr: number; totalInr: number; totalUsd: number;
  deliveredUsdPerKWh: number; totalUsdPerKWh: number; totalInrPerKWh: number;
};

/** Landed cost of one system, in both currencies, at the project's own exchange rate. */
export function landedCost(l: LandedCost, kWh: number, ratedKW: number): LandedBreakdown {
  const fobUsd = kWh * l.basicPriceUsdPerKWh;
  const oceanFreightUsd = fobUsd * l.oceanFreightPct / 100;
  const cifUsd = fobUsd + oceanFreightUsd;
  const cifInr = cifUsd * l.exchangeRateInrPerUsd;
  const customsDutyInr = cifInr * l.customsDutyPct / 100;
  const inlandClearanceInr = cifInr * l.inlandClearancePct / 100;
  const deliveredInr = cifInr + customsDutyInr + inlandClearanceInr;
  const pcsInr = ratedKW * l.pcsCostInrPerKW;
  const totalInr = deliveredInr + pcsInr;
  const fx = Math.max(l.exchangeRateInrPerUsd, 1e-6);
  return {
    kWh, ratedKW, fobUsd, oceanFreightUsd, cifUsd, cifInr, customsDutyInr, inlandClearanceInr,
    deliveredInr, pcsInr, totalInr, totalUsd: totalInr / fx,
    deliveredUsdPerKWh: deliveredInr / fx / Math.max(kWh, 1e-9),
    totalUsdPerKWh: totalInr / fx / Math.max(kWh, 1e-9),
    totalInrPerKWh: totalInr / Math.max(kWh, 1e-9),
  };
}

/** Default price book, with the landed-cost build-up taken from the supplied supply offer. */
export const defaultPriceBook: PriceBook = {
  id: 'pb-default', name: 'Supply offer basis', currency: 'INR', updatedAt: '2026-09-01',
  costingMode: 'landed-import', supplyScope: 'supply-only', landed: defaultLandedCost(),
  batteryPerKWh: { 'enc-5mwh-20ft': 84, 'enc-5mwh-alt': 86, 'enc-261-ci': 132, 'enc-52-rack': 168, 'enc-16-small': 196 },
  pcsPerKW: { 'pcs-2507': 14, 'pcs-1725': 17, 'pcs-630': 26, 'pcs-125': 44, 'pcs-5': 92 },
  transformerPerKVA: { 'tx-3150': 19, 'tx-5000': 17, 'tx-1600': 24 },
  bopPerKW: 26, epcPerKWh: 22, civilPerM2: 210,
  freightPerUnit: 7500, commissioningPerUnit: 4800, engineeringFixed: 28000,
  contingencyPct: 4, marginPct: 14, taxPct: 0,
  omPerKWYear: 7.5, insurancePctPerYear: 0.45, ltsaPerKWhYear: 2.6,
  batteryPriceDeclinePct: 6, discountRatePct: 9, inflationPct: 3.5,
  chargeSource: 'open-access-solar', solarPpaPerMWh: 31,
  energyBuyPerMWh: 62, energySellPerMWh: 118, demandChargePerKWMonth: 14,
  capacityPaymentPerKWYear: 62, dieselPerLitre: 1.05, dieselLitrePerKWh: 0.28,
};

export const convert = (amountUsd: number, to: Currency) => amountUsd * currencies[to].perUsd;

/** The minus sign leads the symbol, so a negative cash flow reads as −$1.2 M rather than $-1.2 M. */
export function formatMoney(amount: number, currency: Currency, compact = false) {
  const c = currencies[currency], sign = amount < 0 ? '\u2212' : '', abs = Math.abs(amount);
  if (compact) {
    if (currency === 'INR' && abs >= 1e7) return `${sign}${c.symbol}${(abs / 1e7).toFixed(2)} cr`;
    if (currency === 'INR' && abs >= 1e5) return `${sign}${c.symbol}${(abs / 1e5).toFixed(2)} L`;
    if (abs >= 1e9) return `${sign}${c.symbol}${(abs / 1e9).toFixed(2)} bn`;
    if (abs >= 1e6) return `${sign}${c.symbol}${(abs / 1e6).toFixed(2)} M`;
    if (abs >= 1e3) return `${sign}${c.symbol}${(abs / 1e3).toFixed(1)} k`;
  }
  return `${sign}${c.symbol}${abs.toLocaleString('en', { minimumFractionDigits: c.decimals, maximumFractionDigits: c.decimals })}`;
}
