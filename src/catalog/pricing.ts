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
export type PcsBasis = 'per-enclosure' | 'per-installed-kw';
export type LandedCost = {
  basicPriceUsdPerKWh: number; oceanFreightPct: number; exchangeRateInrPerUsd: number;
  customsDutyPct: number; inlandClearancePct: number;
  /** The issued proposal bundles a converter allowance with each enclosure; per-kW is the alternative. */
  pcsBasis: PcsBasis; pcsCostInrPerUnit: number; pcsCostInrPerKW: number;
  /**
   * The converter rating the bundled allowance was quoted against.
   *
   * A bundle is a price for a thing, not a price for anything. The proposal quoted ₹32.5 lakh of
   * conversion with a 2,507.5 kW enclosure; applied to every product it also quoted ₹32.5 lakh of
   * conversion for a five-kilowatt hybrid inverter, which was eighty per cent of that system's
   * price and roughly seventy times what the inverter costs. Where the enclosure's rating is not
   * the one this was quoted at, the rate card's own per-product figure is used instead.
   */
  pcsCostQuotedAtKW: number;
  /**
   * The system the FOB rate was quoted for.
   *
   * $68/kWh was quoted for five-megawatt-hour containers. Applied to every enclosure it said a
   * 261 kWh cabinet and a 16 kWh wall rack cost the same money per kilowatt-hour as a container,
   * which is not true of any battery product anywhere — and since a cabinet fleet fits a small
   * duty more tightly than a container does, it made forty-six cabinets look cheaper than three
   * containers for the same plant. Other enclosures are scaled by the rate card's own relative
   * prices, which is the only per-product battery data the book holds.
   */
  basicPriceQuotedForEnclosureId: string;
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
  customsDutyPct: 11, inlandClearancePct: 1.5,
  pcsBasis: 'per-enclosure', pcsCostInrPerUnit: 3_250_000, pcsCostInrPerKW: offerPcsInrPerKW,
  pcsCostQuotedAtKW: 2507.5, basicPriceQuotedForEnclosureId: 'enc-5mwh-20ft',
});

export type LandedBreakdown = {
  kWh: number; ratedKW: number;
  fobUsd: number; oceanFreightUsd: number; cifUsd: number; cifInr: number;
  customsDutyInr: number; inlandClearanceInr: number; deliveredInr: number;
  pcsInr: number; totalInr: number; totalUsd: number;
  deliveredUsdPerKWh: number; totalUsdPerKWh: number; totalInrPerKWh: number;
};

/** Landed cost of one system, in both currencies, at the project's own exchange rate. */
/**
 * The import rates as they apply to one enclosure, with the FOB rate scaled off the product the
 * offer was struck for. Where the book carries no rate for either system the quoted rate stands.
 */
export const landedRatesFor = (pb: PriceBook, enclosureId: string): LandedCost => {
  const quoted = pb.batteryPerKWh[pb.landed.basicPriceQuotedForEnclosureId], mine = pb.batteryPerKWh[enclosureId];
  return quoted && mine && mine !== quoted
    ? { ...pb.landed, basicPriceUsdPerKWh: pb.landed.basicPriceUsdPerKWh * mine / quoted }
    : pb.landed;
};

/** True where the bundled converter allowance was quoted for equipment of this rating. */
export const bundleAppliesTo = (l: LandedCost, ratedKW: number) =>
  l.pcsBasis === 'per-enclosure' && Math.abs(ratedKW - l.pcsCostQuotedAtKW) < 1;

/**
 * @param pcsInrOverride the converter's own price, where the bundled allowance does not apply to it.
 */
export function landedCost(l: LandedCost, kWh: number, ratedKW: number, pcsInrOverride?: number): LandedBreakdown {
  const fobUsd = kWh * l.basicPriceUsdPerKWh;
  const oceanFreightUsd = fobUsd * l.oceanFreightPct / 100;
  const cifUsd = fobUsd + oceanFreightUsd;
  const cifInr = cifUsd * l.exchangeRateInrPerUsd;
  const customsDutyInr = cifInr * l.customsDutyPct / 100;
  const inlandClearanceInr = cifInr * l.inlandClearancePct / 100;
  const deliveredInr = cifInr + customsDutyInr + inlandClearanceInr;
  const pcsInr = pcsInrOverride !== undefined ? pcsInrOverride
    : bundleAppliesTo(l, ratedKW) ? l.pcsCostInrPerUnit
      : ratedKW * l.pcsCostInrPerKW;
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
  // Dearer per kilowatt-hour the smaller the system, which is true of every battery product: the
  // case, the management board, the contactors and the certification are much the same whatever is
  // inside them, and a 5 MWh container spreads them over three hundred times the energy.
  batteryPerKWh: {
    'enc-5mwh-20ft': 84, 'enc-5mwh-alt': 86, 'enc-261-ci': 132, 'enc-52-rack': 168,
    'enc-16-small': 196, 'enc-5-small': 238, 'enc-2-small': 286,
  },
  pcsPerKW: { 'pcs-5000': 13, 'pcs-2507': 14, 'pcs-1725': 17, 'pcs-630': 26, 'pcs-125': 44, 'pcs-5': 92 },
  transformerPerKVA: { 'tx-6300': 16, 'tx-5000': 17, 'tx-3150': 19, 'tx-1600': 24, 'tx-1000': 27, 'tx-500': 34 },
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

/**
 * Units of the quotation currency per US dollar.
 *
 * Under the landed-import basis the rate quoted in the build-up is the authority — converting the
 * same offer back at a different reference rate is what makes a price build-up fail to reconcile
 * with its own order value. That rate is quoted in rupees per dollar, so it is the authority for
 * rupee amounts only. Applying it to every currency priced a $1.58 m plant at $152 m, €152 m and
 * AED 152 m: the same figure in every currency, because the dollar amount was being multiplied by
 * the rupee rate and then labelled whatever the customer had asked for.
 */
export const localRate = (pb: PriceBook, currency: Currency) =>
  pb.costingMode === 'landed-import' && currency === 'INR' ? pb.landed.exchangeRateInrPerUsd : currencies[currency].perUsd;
export const toLocal = (amountUsd: number, pb: PriceBook, currency: Currency) => amountUsd * localRate(pb, currency);

/**
 * A rupee figure out of a landed build-up, restated in the currency the document is quoted in.
 *
 * The build-up is struck in rupees at the offer's own rate, so a figure taken straight out of it
 * and printed under a dollar or euro heading is wrong by two orders of magnitude and stops the
 * build-up reconciling with the order value printed beside it.
 */
export const fromLanded = (inr: number, l: LandedCost, currency: Currency) =>
  (currency === 'INR' ? inr : convert(inr / Math.max(l.exchangeRateInrPerUsd, 1e-6), currency));

/**
 * An amount raised in one currency, restated in another at the price book's own rates.
 *
 * A workspace quoting in more than one currency holds records in each of them. Adding those
 * numbers together and labelling the sum with one currency — or with whichever record happened to
 * sort first — reports a pipeline that is not any amount of money at all.
 */
export const restate = (amount: number, from: Currency, to: Currency, pb: PriceBook) =>
  (from === to ? amount : amount * localRate(pb, to) / localRate(pb, from));

/**
 * A rate as it will be printed.
 *
 * A quotation has to multiply out. Carrying a unit price to full precision and rounding it only
 * for display gives a document where quantity times rate does not equal the amount beside it —
 * twelve containers at a rate ending .33 printed as a whole rupee came out four rupees short of
 * its own line total, which is the first thing a procurement officer checks.
 */
export const atRate = (amount: number, currency: Currency) => {
  const step = 10 ** currencies[currency].decimals;
  return Math.round(amount * step) / step;
};

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
