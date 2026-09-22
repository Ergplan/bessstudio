/**
 * What it costs over its life, in rupees, with every figure traceable to the line that produced it.
 *
 * §15.5 is a list of ways this calculation is normally got wrong, and the shape of this file is the
 * shape of avoiding them:
 *
 * - **A missing price is never a zero.** A cost with no figure is carried as unknown, listed beside
 *   the total, and the total says it is incomplete. A zero would quietly declare something free.
 * - **Replacement timing is evidence-based**, not "lead-acid every three years, lithium every ten".
 *   Where there is no evidence, declared sensitivity cases are compared and labelled as such.
 * - **Tax is explicit.** No assumed rate, no assumed input-credit eligibility, and nothing excluded
 *   as recoverable unless that assumption is stated.
 * - **Nothing is charged to one chemistry that both incur**, and nothing already counted in the
 *   auxiliaries is counted again as cooling.
 * - **No crossover is a result**, not a failure to find one.
 */

export type Category =
  | 'equipment' | 'integration' | 'replacement' | 'labour' | 'amc'
  | 'energy-losses' | 'energy-cooling' | 'disposal' | 'residual';

/**
 * One line of the ledger.
 *
 * `inr` is null where the price is not known. That is not the same as free, and every total that
 * touches such a line carries the reason with it.
 */
export type LedgerLine = {
  year: number;
  category: Category;
  label: string;
  inr: number | null;
  /** Where the figure came from, or what is needed to get one. Required either way. */
  basis: string;
};

export type TaxTreatment = {
  /** The GST rate applied, or null where none is assumed. §15.5 forbids an assumed rate. */
  gstRate: number | null;
  /** Whether input tax credit is available. Null means it has not been confirmed either way. */
  inputCreditEligible: boolean | null;
  note: string;
};

export const unstatedTax = (): TaxTreatment => ({
  gstRate: null, inputCreditEligible: null,
  note: 'No GST rate is assumed and no input-tax-credit eligibility is assumed. Figures are stated before tax, and a quotation with its tax treatment replaces them.',
});

export type Horizon = 5 | 10 | 15;

export type Discounting = {
  /** Real or nominal, stated rather than implied. */
  basis: 'real' | 'nominal';
  ratePerYear: number;
  /** Cost escalation applied to recurring lines, in the same basis. */
  escalationPerYear: number;
};

export const defaultDiscounting = (): Discounting => ({ basis: 'real', ratePerYear: 0.1, escalationPerYear: 0 });

export type LedgerTotals = {
  horizonYears: number;
  /** Sums of what is known, by year and overall. */
  undiscountedInr: number;
  discountedInr: number;
  byYear: { year: number; undiscountedInr: number; discountedInr: number; cumulativeDiscountedInr: number }[];
  /** Every line whose price is not known, so a total is never read as complete when it is not. */
  unknown: { label: string; basis: string }[];
  complete: boolean;
  notes: string[];
};

/**
 * The discounted total, and the running total that a crossover is read from.
 *
 * Year zero is not discounted; year *n* is divided by (1 + r)^n. Escalation is applied to the
 * recurring categories only — an annual maintenance contract escalates, a capital purchase does
 * not, and applying one rate to both is a common and expensive mistake.
 */
export function totals(lines: LedgerLine[], horizonYears: Horizon, d: Discounting): LedgerTotals {
  const recurring: Category[] = ['amc', 'energy-losses', 'energy-cooling'];
  const byYear: LedgerTotals['byYear'] = [];
  const unknown: LedgerTotals['unknown'] = [];
  let cumulative = 0, undiscounted = 0, discounted = 0;

  for (let year = 0; year <= horizonYears; year++) {
    let u = 0, disc = 0;
    for (const line of lines.filter(l => l.year === year)) {
      if (line.inr === null) {
        unknown.push({ label: `Year ${line.year}: ${line.label}`, basis: line.basis });
        continue;
      }
      const escalated = recurring.includes(line.category)
        ? line.inr * (1 + d.escalationPerYear) ** year
        : line.inr;
      u += escalated;
      disc += escalated / (1 + d.ratePerYear) ** year;
    }
    undiscounted += u;
    discounted += disc;
    cumulative += disc;
    byYear.push({ year, undiscountedInr: u, discountedInr: disc, cumulativeDiscountedInr: cumulative });
  }

  return {
    horizonYears, undiscountedInr: undiscounted, discountedInr: discounted, byYear, unknown,
    complete: unknown.length === 0,
    notes: [
      `Discounted at ${(d.ratePerYear * 100).toFixed(1)}% per year on a ${d.basis} basis, with year zero undiscounted.`,
      d.escalationPerYear === 0
        ? 'No cost escalation is applied. Recurring costs are in the same money as year zero.'
        : `Recurring costs escalate at ${(d.escalationPerYear * 100).toFixed(1)}% per year; capital purchases do not.`,
      unknown.length > 0
        ? `${unknown.length} line(s) have no price. They are listed rather than counted as zero, so this total is incomplete.`
        : 'Every line carries a price, so the total is complete on the assumptions given.',
    ],
  };
}

/**
 * The first year one option's running discounted cost passes the other's — or null, which is an
 * answer and not a failure.
 *
 * §15.5: "Show **no crossover** within the horizon where that is the answer." A comparison that
 * always finds a crossover is a comparison that has decided in advance.
 */
export function crossoverYear(a: LedgerTotals, b: LedgerTotals): number | null {
  const years = Math.min(a.byYear.length, b.byYear.length);
  if (years === 0) return null;
  // A crossover between two totals that are missing prices is a crossover between two partial
  // sums, and naming a year for it would be the most confident thing on the screen and the least
  // supported. Incomplete totals give no crossover at all.
  if (!a.complete || !b.complete) return null;
  const startsAhead = a.byYear[0].cumulativeDiscountedInr > b.byYear[0].cumulativeDiscountedInr;
  for (let i = 1; i < years; i++) {
    const nowAhead = a.byYear[i].cumulativeDiscountedInr > b.byYear[i].cumulativeDiscountedInr;
    if (nowAhead !== startsAhead) return a.byYear[i].year;
  }
  return null;
}

/* ------------------------------------------------------ replacement timing -- */

export type ReplacementEvidence =
  | { kind: 'modelled'; years: number; basis: string }
  | { kind: 'sensitivity'; cases: number[]; basis: string };

/**
 * When the battery is replaced, and on what evidence.
 *
 * Two cases, and the second is the honest one more often than the industry admits: either the model
 * has something to say about service life under these conditions, or it does not — and then the
 * answer is a set of declared cases to compare, not a number picked because it is conventional.
 */
export function replacementYears(evidence: ReplacementEvidence, horizonYears: number): number[] {
  const life = evidence.kind === 'modelled' ? evidence.years : Math.min(...evidence.cases);
  if (!(life > 0)) return [];
  const out: number[] = [];
  for (let year = Math.ceil(life); year < horizonYears; year += Math.ceil(life)) out.push(year);
  return out;
}

/* ------------------------------------------------------------- the ledger -- */

export type CostAssumptions = {
  /** Installed cost of the store itself, per kilowatt-hour of installed energy. */
  batteryInrPerKWh: number | null;
  /** Conversion and integration, per kilowatt of continuous rating. */
  conversionInrPerKW: number | null;
  /** Annual inspection and maintenance, as a fraction of installed equipment cost. */
  amcFractionPerYear: number;
  /** Labour and transport for one replacement, as a fraction of the battery cost it replaces. */
  replacementLabourFraction: number;
  /** Disposal or recycling, per kilogram. Null where no arrangement has been confirmed. */
  disposalInrPerKg: number | null;
  /** Residual or buyback at the horizon, as a fraction of the battery cost. Null where unconfirmed. */
  residualFraction: number | null;
  /** Energy price for losses and cooling. §15.4's teaching values are ₹6, ₹9 and ₹12. */
  tariffInrPerKWh: number;
  tax: TaxTreatment;
};

export type ChemistryCosting = {
  chemistry: 'VRLA' | 'LFP';
  installedEnergyKWh: number;
  continuousKW: number;
  massKg: number;
  /** Round-trip efficiency of the store itself, which is not the whole system's. */
  batteryEfficiency: number;
  /** Energy through the store in a year, in kilowatt-hours, from the operating preset. */
  throughputKWhPerYear: number;
  /** Cooling and ventilation energy **beyond** what the auxiliaries already carry. */
  incrementalCoolingKWhPerYear: number;
  replacement: ReplacementEvidence;
};

/**
 * One chemistry's ledger over the horizon.
 *
 * Both chemistries are built by this same function from the same assumptions, so no cost can be
 * charged to one and not the other by accident — which is §15.5's warning about the protected-load
 * energy, and the reason the throughput comes from the operating preset rather than the chemistry.
 */
export function ledgerFor(c: ChemistryCosting, a: CostAssumptions, horizonYears: Horizon): LedgerLine[] {
  const lines: LedgerLine[] = [];
  const batteryCost = a.batteryInrPerKWh === null ? null : a.batteryInrPerKWh * c.installedEnergyKWh;
  const conversionCost = a.conversionInrPerKW === null ? null : a.conversionInrPerKW * c.continuousKW;

  lines.push({
    year: 0, category: 'equipment', label: `${c.chemistry} store, ${c.installedEnergyKWh.toFixed(0)} kWh installed`,
    inr: batteryCost,
    basis: a.batteryInrPerKWh === null
      ? 'No installed price per kilowatt-hour has been entered. A dated vendor quotation is required; nothing is assumed.'
      : `₹${a.batteryInrPerKWh.toLocaleString('en-IN')} per kWh installed — an editable assumption, not a market price.`,
  });
  lines.push({
    year: 0, category: 'integration', label: `Conversion and integration, ${c.continuousKW.toFixed(0)} kW`,
    inr: conversionCost,
    basis: a.conversionInrPerKW === null
      ? 'No price per kilowatt has been entered. A dated vendor quotation is required.'
      : `₹${a.conversionInrPerKW.toLocaleString('en-IN')} per kW — an editable assumption, not a market price.`,
  });

  for (const year of replacementYears(c.replacement, horizonYears)) {
    lines.push({
      year, category: 'replacement', label: `${c.chemistry} store replaced`,
      inr: batteryCost,
      basis: c.replacement.kind === 'modelled'
        ? `${c.replacement.basis} Replacement at ${c.replacement.years.toFixed(1)} years.`
        : `${c.replacement.basis} This case takes the shortest of the declared sensitivity lives, ${Math.min(...c.replacement.cases)} years.`,
    });
    lines.push({
      year, category: 'labour', label: 'Labour and transport for the replacement',
      inr: batteryCost === null ? null : batteryCost * a.replacementLabourFraction,
      basis: `${(a.replacementLabourFraction * 100).toFixed(0)}% of the equipment it replaces — an editable assumption.`,
    });
  }

  for (let year = 1; year <= horizonYears; year++) {
    lines.push({
      year, category: 'amc', label: 'Inspection and maintenance',
      inr: batteryCost === null || conversionCost === null ? null : (batteryCost + conversionCost) * a.amcFractionPerYear,
      basis: `${(a.amcFractionPerYear * 100).toFixed(1)}% of installed equipment cost per year — an editable assumption. Valve-regulated cells need no watering; they still need inspection.`,
    });
    // The energy lost in the store, charged at the same tariff for both chemistries. The protected
    // load's own energy is not charged here: the site consumes it whether or not there is a battery.
    const lossKWh = c.throughputKWhPerYear * (1 - c.batteryEfficiency);
    lines.push({
      year, category: 'energy-losses', label: 'Energy lost in the store',
      inr: lossKWh * a.tariffInrPerKWh,
      basis: `${lossKWh.toFixed(0)} kWh a year at ₹${a.tariffInrPerKWh}/kWh. The store's own round-trip efficiency, not the whole system's, and the protected load's energy is not charged to either option.`,
    });
    if (c.incrementalCoolingKWhPerYear > 0) {
      lines.push({
        year, category: 'energy-cooling', label: 'Cooling and ventilation, beyond the auxiliaries',
        inr: c.incrementalCoolingKWhPerYear * a.tariffInrPerKWh,
        basis: `${c.incrementalCoolingKWhPerYear.toFixed(0)} kWh a year beyond what the auxiliaries already carry, so nothing is counted twice.`,
      });
    }
  }

  lines.push({
    year: horizonYears, category: 'disposal', label: 'Disposal or recycling',
    inr: a.disposalInrPerKg === null ? null : a.disposalInrPerKg * c.massKg,
    basis: a.disposalInrPerKg === null
      ? 'No compliant recycling or take-back arrangement has been confirmed, and no charge is assumed. The Battery Waste Management Rules and any vendor take-back terms need checking against current official sources; informal scrap sale is not compliant recycling.'
      : `₹${a.disposalInrPerKg} per kg against ${c.massKg.toFixed(0)} kg, from a recorded arrangement. Buyback values for lead-acid and lithium are not assumed identical.`,
  });
  lines.push({
    year: horizonYears, category: 'residual', label: 'Residual or buyback value',
    inr: a.residualFraction === null || batteryCost === null ? null : -batteryCost * a.residualFraction,
    basis: a.residualFraction === null
      ? 'No residual value is assumed. A supported buyback or resale figure replaces this line; capacity remaining at the horizon is explained separately.'
      : `${(a.residualFraction * 100).toFixed(0)}% of the equipment cost, credited at the horizon on the same basis for both options.`,
  });

  return lines;
}

/** Costs in rupees, written the way they are read in India. */
export const inr = (value: number) => {
  const crore = 1e7, lakh = 1e5;
  if (Math.abs(value) >= crore) return `₹${(value / crore).toFixed(2)} cr`;
  if (Math.abs(value) >= lakh) return `₹${(value / lakh).toFixed(2)} lakh`;
  return `₹${Math.round(value).toLocaleString('en-IN')}`;
};
