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

export type PriceBook = {
  id: string; name: string; currency: Currency; updatedAt: string;
  batteryPerKWh: Record<string, number>;   // by enclosure id, per kWh DC nameplate
  pcsPerKW: Record<string, number>;        // by PCS id, per kW rated
  transformerPerKVA: Record<string, number>;
  bopPerKW: number; epcPerKWh: number; civilPerM2: number;
  freightPerUnit: number; commissioningPerUnit: number; engineeringFixed: number;
  contingencyPct: number; marginPct: number; taxPct: number;
  omPerKWYear: number; insurancePctPerYear: number; ltsaPerKWhYear: number;
  batteryPriceDeclinePct: number; discountRatePct: number; inflationPct: number;
  energyBuyPerMWh: number; energySellPerMWh: number; demandChargePerKWMonth: number;
  capacityPaymentPerKWYear: number; dieselPerLitre: number; dieselLitrePerKWh: number;
};

/** Indicative USD price book, mid-2026 basis. */
export const defaultPriceBook: PriceBook = {
  id: 'pb-default', name: 'Indicative global price book', currency: 'USD', updatedAt: '2026-09-01',
  batteryPerKWh: { 'enc-5mwh-20ft': 96, 'enc-5mwh-alt': 98, 'enc-3745-20ft': 104, 'enc-cabinet-418': 148, 'enc-6mwh-587': 92, 'enc-skid-nmc': 210 },
  pcsPerKW: { 'pcs-2500': 38, 'pcs-1725': 41, 'pcs-630': 52, 'pcs-125': 78 },
  transformerPerKVA: { 'tx-3150': 19, 'tx-5000': 17, 'tx-1600': 24 },
  bopPerKW: 26, epcPerKWh: 22, civilPerM2: 210,
  freightPerUnit: 7500, commissioningPerUnit: 4800, engineeringFixed: 28000,
  contingencyPct: 4, marginPct: 14, taxPct: 0,
  omPerKWYear: 7.5, insurancePctPerYear: 0.45, ltsaPerKWhYear: 2.6,
  batteryPriceDeclinePct: 6, discountRatePct: 9, inflationPct: 3.5,
  energyBuyPerMWh: 42, energySellPerMWh: 118, demandChargePerKWMonth: 14,
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
