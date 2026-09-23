import { application, type ApplicationId } from './applications';
import { defaultPriceBook, type PriceBook } from '../catalog/pricing';
import { evaluateFinance } from './finance';
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
  /**
   * Whether the equipment above was chosen by a person or should follow the duty.
   *
   * `auto` is the default and means what it says: the smallest combination in the catalogue that
   * carries the power and the energy asked for. Before it existed every design started from the
   * five-megawatt-hour container whatever the duty was, so a five-kilowatt backup supply came back
   * as one container, one 2.5 MW converter and a bill for five and a half crore — with warnings
   * attached, which is not the same as an answer.
   *
   * `pinned` is what the System selector sets: an engineer who has chosen a product keeps it, and
   * the warnings are then doing their real job of saying what it costs them.
   */
  equipment?: 'auto' | 'pinned';
  augmentation: AugmentationStrategy;
  gridKV: number; frequencyHz: 50 | 60; powerFactor: number;
  losses: LossChain; degradation: DegradationInput;
};

export type SizingWarning = { code: string; level: 'error' | 'warning' | 'info'; text: string };

/**
 * What each warning is called where it is shown.
 *
 * Prettifying the code gave headings like "Dc Window High" and "Pcs Granularity" — the two terms
 * of art on the page, both misspelt, on a document an engineer is reading to decide whether to
 * trust the rest of it.
 */
export const warningTitles: Record<string, string> = {
  'c-rate': 'Discharge rate above the pack rating',
  'c-rate-margin': 'Discharge rate close to the pack rating',
  'charge-rate': 'Charge rate above the pack rating',
  'charge-rate-margin': 'Charge rate close to the pack rating',
  'charge-limited': 'Charging sets the size, not discharging',
  'charge-oversize': 'Charge window is buying enclosures',
  'dc-window-high': 'String voltage above the converter input',
  'dc-window-low': 'String voltage below the converter input',
  'ambient-high': 'Ambient above the cell limit',
  cooling: 'Air cooling at high ambient',
  altitude: 'Altitude derating review',
  dod: 'Depth of discharge and the warranty envelope',
  throughput: 'Lifetime throughput above the warranty basis',
  'capacity-shortfall': 'Contracted energy not met',
  'duty-cycle': 'Duty heavier than the preset',
  oversize: 'Day-one capacity well above contract',
  headroom: 'Where the installed energy goes',
  'power-limited': 'Power sets the size, not energy',
  'pcs-granularity': 'Conversion capacity rounded up',
  'grid-voltage': 'Connection voltage and what reaches it',
  'idt-discharge': 'Transformer loss on discharge',
  'degradation-extrapolated': 'Degradation schedule extrapolated',
  validation: 'Basis of this sizing',
};

/** The warning's own name where it has one, and a readable form of its code where it does not. */
export const warningTitle = (code: string) => warningTitles[code] ?? code.replace(/-/g, ' ');
export type YearRow = {
  year: number; retention: number; installedDcMWh: number; storedDcMWh: number; usableMWh: number;
  /** AC energy actually dispatched in one cycle: the plant's usable energy, capped at what it is contracted to deliver. */
  deliveredPerCycleMWh: number;
  /** Annual cycles after the availability factor and contracted availability are both applied. */
  effectiveCycles: number;
  deliveredMWh: number; chargeMWh: number; gridChargeMWh: number; augmentedMWh: number; shortfall: boolean;
};
export type Cohort = { year: number; dcMWh: number; units: number };

export type SizingResult = {
  input: SizingInput;
  enclosure: EnclosureSpec; pcs: PcsSpec; transformer: TransformerSpec | null;
  requiredUsableMWh: number; ratedPowerMW: number; effectiveDurationH: number; chargePowerMW: number; chargeCRate: number;
  units: number; totalUnits: number; installedDcMWh: number; day1UsableMWh: number;
  /** Which of the two independent constraints set the day-one fleet, and how many units each asked for. */
  binding: 'power' | 'energy'; unitsForPower: number; unitsForEnergy: number;
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
    // Periodic, whatever the duty cycle. Oversizing on day one was the default below one cycle a
    // day, and it bought two and a half times the contracted energy up front so the plant would
    // need nothing for twenty years: a 2.5 MW / 10 MWh solar plant opened at 25 MWh installed and
    // ₹25 crore. That is a defensible engineering answer and a very large commercial assumption to
    // make on a customer's behalf before they have said a word. Augmenting when capacity falls
    // short opens at roughly 1.4× instead, with the top-ups priced across the term where they can
    // be discussed. `oversize-day1` stays selectable, for the sites where a truck visit is the
    // thing being avoided.
    augmentation: 'periodic',
    gridKV: 33, frequencyHz: 50, powerFactor: 0.95,
    losses: defaultLossChain(), degradation: defaultDegradation(),
  };
};

/**
 * The voltage a design actually presents at its boundary: the transformer's high side, or the
 * converter's own terminals where no transformer is in scope.
 */
export const connectionKV = (s: SizingResult) => (s.transformer ? s.transformer.hvKV : s.pcs.acV / 1000);

/** Cell temperature seen by the ageing model, from ambient and the cooling strategy. */
export const cellTemperature = (ambientC: number, cooling: EnclosureSpec['cooling']) =>
  cooling === 'liquid' ? Math.min(38, Math.max(18, 25 + (ambientC - 25) * 0.25)) : Math.min(48, Math.max(18, 25 + (ambientC - 25) * 0.6));

/**
 * Kelvin of cell temperature that doubles the rate of ageing.
 *
 * Exported because the studio narrates it. The rule of thumb everybody quotes is 10 K, the model
 * uses 12, and prose that quoted the rule of thumb beside a model that used something else left
 * the two disagreeing on the same screen.
 */
export const AGEING_DOUBLING_K = 12;

/** Arrhenius-style ageing multiplier, doubling roughly every `AGEING_DOUBLING_K` above 25 °C. Simplified; supplier curves override. */
export const temperatureFactor = (cellTempC: number) => 2 ** ((cellTempC - 25) / AGEING_DOUBLING_K);

/**
 * Capacity retention of one cohort after `age` years of service, derived from the catalogue
 * warranty anchors. Used when the degradation mode is `model`; the `table` mode reads the
 * year-by-year schedule instead.
 */
export function retentionAt(age: number, efcPerYear: number, cell: ReturnType<typeof cellOf>, tempFactor: number) {
  if (age <= 0) return 1;
  const calA = (1 - cell.calendarRetention) / Math.sqrt(cell.calendarYears);
  // The rated cycles were tested at the data sheet's depth of discharge, so they are worth that
  // many equivalent full cycles and no more. Treating 8 000 cycles at 90% DoD as 8 000 full ones
  // understates the fade per cycle by a ninth.
  const perEfc = (1 - cell.cycleLifeRetention) / (cell.cycleLife * cell.cycleLifeDod);
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

/** Pull a number into a range the physics can use, replacing anything unreadable with `fallback`. */
const held = (n: number, lo: number, hi: number, fallback = lo) =>
  (Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback);

/**
 * Fill in anything a stored project predates, repoint catalogue ids that have been retired, and
 * hold every figure inside the range it means something in, so a record written by an earlier
 * version — or a number somebody pasted — still sizes instead of throwing or going negative.
 *
 * The bounds are deliberately wider than the controls that set them: they are a floor under the
 * arithmetic, not a second opinion on what the user is allowed to ask for.
 */
export function normaliseSizingInput(input: SizingInput): SizingInput {
  const known = <T extends { id: string }>(list: T[], id: string | null, fallback: string) =>
    (id && list.some(x => x.id === id) ? id : fallback);
  const L = { ...defaultLossChain(), ...(input.losses ?? {}) };
  const durationH = held(input.durationH, 0.05, 24, 2);
  return {
    ...input,
    powerMW: held(input.powerMW, 0.001, 5000),
    durationH,
    usableEnergyMWh: held(input.usableEnergyMWh, 0.001, 50_000),
    chargeDurationH: input.chargeDurationH > 0 ? held(input.chargeDurationH, 0.05, 48) : durationH,
    cyclesPerDay: held(input.cyclesPerDay, 0, 24, 1),
    daysPerYear: held(input.daysPerYear, 0, 366, 365),
    projectYears: Math.round(held(input.projectYears, 1, 60, 20)),
    dod: held(input.dod, 0.01, 1, 0.9),
    availability: held(input.availability, 0.01, 1, 0.97),
    ambientC: held(input.ambientC, -40, 70, 25),
    altitudeM: held(input.altitudeM, 0, 6000, 0),
    powerFactor: held(input.powerFactor, 0.1, 1, 0.95),
    gridKV: held(input.gridKV, 0.2, 800, 33),
    enclosureId: known(enclosures, input.enclosureId, 'enc-5mwh-20ft'),
    pcsId: known(pcsUnits, input.pcsId, 'pcs-2507'),
    transformerId: input.transformerId === null ? null : known(transformers, input.transformerId, 'tx-3150'),
    losses: {
      ...L,
      // Efficiencies stay strictly positive and losses strictly below total, so the conversion
      // chain can never collapse to a round trip of zero or a negative delivered energy.
      usableDcWindow: held(L.usableDcWindow, 0.05, 1, 0.95),
      chargeEfficiencyDc: held(L.chargeEfficiencyDc, 0.05, 1, 0.95),
      dischargeEfficiencyDc: held(L.dischargeEfficiencyDc, 0.05, 1, 0.95),
      dcCableLoss: held(L.dcCableLoss, 0, 0.5, 0),
      pcsLoss: held(L.pcsLoss, 0, 0.5, 0),
      acCableLoss: held(L.acCableLoss, 0, 0.5, 0),
      idtLoss: held(L.idtLoss, 0, 0.5, 0),
      openAccessLoss: held(L.openAccessLoss, 0, 0.9, 0),
      availabilityFactor: held(L.availabilityFactor, 0.05, 1, 0.95),
      auxScale: held(L.auxScale, 0, 20, 1),
    },
    degradation: {
      mode: input.degradation?.mode ?? 'table',
      retention: input.degradation?.retention?.length
        // A retention of zero is a dead battery, not a schedule; hold the curve above it so the
        // year rows stay divisible rather than reporting a fleet that delivers nothing.
        ? input.degradation.retention.map(r => held(r, 0.01, 1, 1))
        : [...suppliedRetention],
    },
  };
}

/**
 * The smallest combination in the catalogue that carries this duty.
 *
 * Two constraints and one tie-break, and every part of it is checked in the tests. A combination
 * has to deliver the **power** and hold the **energy**: sizing on energy alone picks a rack that
 * cannot deliver a tenth of the load, and sizing on power alone picks a container to hold five
 * kilowatt-hours. The converter has to see the string's voltage, because kilowatts that add up on
 * paper are not a connection. Among what survives, the fewest boxes wins within twice the least
 * installed energy — fewest boxes alone buys a container for a wall socket, and least energy alone
 * buys eleven racks where one would do.
 */
export function fitEquipment(raw: SizingInput) {
  const neededKW = Math.max(0.001, (raw.mode === 'power-duration'
    ? raw.powerMW : raw.usableEnergyMWh / Math.max(raw.durationH, 0.01)) * 1000);

  const candidates = enclosures.flatMap(enclosure => {
    const dcNominalV = (enclosure.dcMinV + enclosure.dcMaxV) / 2;
    const fits = pcsUnits
      .map(pcs => ({
        pcs, n: Math.max(1, Math.ceil(neededKW / pcs.ratedKW)),
        // A converter whose input window covers the whole string works at every state of charge.
        // One that only covers the nominal point stops short at low charge, and the energy below
        // that point is bought and never delivered.
        covers: pcs.dcMinV <= enclosure.dcMinV && pcs.dcMaxV >= enclosure.dcMaxV ? 0 : 1,
      }))
      .filter(({ pcs, n }) => pcs.dcMinV <= dcNominalV && pcs.dcMaxV >= dcNominalV && n <= MAX_CONVERTERS);
    if (!fits.length) return [];
    const tightest = Math.min(...fits.map(({ pcs, n }) => n * pcs.ratedKW));
    const pcs = fits.filter(({ pcs: p, n }) => n * p.ratedKW <= tightest * 1.5)
      .sort((a, b) => a.covers - b.covers || a.n - b.n || a.n * a.pcs.ratedKW - b.n * b.pcs.ratedKW)[0];

    // Sized by the engine itself rather than by an estimate of what it would say. An allowance for
    // the window, the depth of discharge, the path losses and the ageing margin was out by a factor
    // of two and a half, which chose four cabinets for a duty that turned out to need ten.
    const sized = sizeSystem({
      ...raw, equipment: 'pinned',
      enclosureId: enclosure.id, pcsId: pcs.pcs.id, transformerId: null,
    });
    if (sized.units > MAX_ENCLOSURES) return [];
    return [{ enclosure, pcs: pcs.pcs, pcsCount: pcs.n, units: sized.units, installedMWh: sized.installedDcMWh, sized }];
  });
  if (!candidates.length) return null;

  /**
   * The cheapest combination that carries the duty.
   *
   * Every heuristic tried before this one was arbitrary and, worse, not monotone: "fewest boxes"
   * bought a five-megawatt-hour container for a wall socket, "least installed energy" bought twenty
   * cabinets where two containers would do, and the compromise between them flipped at a threshold
   * so that *doubling* the power halved the box count. Cost is not a tie-break dressed up as a
   * rule — it is the question the customer is actually asking, and it is monotone because the
   * equipment prices are.
   *
   * Not a proxy for the cost — **the cost**. Two proxies were tried and both were wrong in the
   * same way: they left out whatever happened to differ between the options. Ranking on the
   * hardware alone ignored that freight and commissioning are charged per enclosure, so nine
   * cabinets carried nine lots of each. Adding those in still ignored civil works and installation,
   * which is precisely where nine cabinets and one container part company — and a five-hundred
   * kilowatt plant came out dearer than a seven-hundred-and-fifty kilowatt one.
   *
   * So the candidates are priced the way the project will be priced, by the same function that
   * prices it. It costs a handful of extra sizings, and it is the only version of this that cannot
   * quietly disagree with the number on the screen.
   */
  /**
   * Priced as if somebody had to install it, whatever the quotation's own scope is.
   *
   * A supply-only quotation charges for boxes and nothing else, so under it eighty-eight cabinets
   * genuinely undercut five containers — the eighty-three extra foundations, terminations and
   * commissioning visits are real but appear on nobody's invoice. Ranking on that basis proposed
   * 88 cabinets for 2.5 MW and 240 for 20 MW: cheaper on paper, not a plant. The choice of
   * equipment is a question about the installed system, so the candidates are compared at turnkey
   * scope even where the offer stops at the gate. The quotation still prices the scope that was
   * actually sold.
   */
  const yardstick: PriceBook = { ...defaultPriceBook, supplyScope: 'turnkey' };
  const capexUsd = (c: typeof candidates[number]) => {
    try { return evaluateFinance(c.sized, yardstick).capexUsd; } catch { return Number.POSITIVE_INFINITY; }
  };
  /**
   * A combination that cannot carry the duty is not the cheap answer; it is not an answer.
   *
   * Price only decides between designs that work. Errors — a discharge rate above what the pack
   * sustains, a string outside the converter — come first, because the cheapest thing in the
   * catalogue is always the one that is too small.
   */
  const errors = (c: typeof candidates[number]) => c.sized.warnings.filter(w => w.level === 'error').length;
  const priced = candidates.map(c => ({ c, errs: errors(c), usd: capexUsd(c) }));
  const best = priced.slice().sort((a, b) => a.errs - b.errs || a.usd - b.usd
    || a.c.installedMWh - b.c.installedMWh || (a.c.units + a.c.pcsCount) - (b.c.units + b.c.pcsCount))[0].c;

  /**
   * A transformer only where there is something for it to do.
   *
   * Below a couple of hundred kVA a plant connects at low voltage and a distribution transformer is
   * neither needed nor available in any size that fits — and putting a 3,150 kVA unit next to a
   * five-kilowatt battery was the clearest single sign that nothing was choosing anything.
   */
  //
  // A design with no transformer keeps none: that is a decision about scope — supply-only, or a
  // connection somebody else is making — and fitting one in would be answering a question nobody
  // asked. Where there is one, it is sized to the plant rather than left at whatever the default
  // was, which is how a five-kilowatt battery came to be quoted with a 3,150 kVA transformer.
  const kVA = neededKW / 0.95;
  const transformerId = raw.transformerId === null
    ? null
    : kVA < 250
      ? null
      : (transformers.filter(t => t.ratedKVA >= kVA).sort((a, b) => a.ratedKVA - b.ratedKVA)[0]
        ?? transformers.slice().sort((a, b) => b.ratedKVA - a.ratedKVA)[0]).id;

  return { enclosureId: best.enclosure.id, pcsId: best.pcs.id, transformerId };
}

/**
 * How far a fitted design may go before it stops being a design.
 *
 * These are absurdity bounds, not preferences: a hundred-megawatt plant really is a hundred and ten
 * containers and forty converters, and a cap of twenty-four rejected every candidate for it — after
 * which the fit silently fell back to whatever the input already named, which for a 50 MW plant
 * meant seventeen transformers chosen by nobody. Falling back is worse than fitting something
 * large, so these are set where nothing a person would ask for reaches them: which candidate wins
 * is decided by cost below, and cost already refuses to build a hundred megawatts out of
 * sixteen-kilowatt-hour wall racks. They only throw out the ones that are not proposals at all.
 */
const MAX_ENCLOSURES = 2000;
const MAX_CONVERTERS = 400;

export function sizeSystem(raw: SizingInput): SizingResult {
  // The equipment follows the duty unless somebody pinned it. `fitEquipment` sizes each candidate
  // with this same function, which is why it pins them: without that this recurses forever.
  const fitted = (raw.equipment ?? 'auto') === 'auto' ? fitEquipment({ ...raw, equipment: 'pinned' }) : null;
  const input = normaliseSizingInput(fitted ? { ...raw, ...fitted } : raw);
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
  /**
   * The catalogue states auxiliary consumption per day, and a plant cycling six times a day does
   * not run its cooling six times over. The day's discharge-side auxiliary energy is shared
   * between the cycles that carry it; the charge-side figure is added once a day in the
   * roll-forward below. Below one cycle a day the share is capped at a single day's worth, because
   * the auxiliaries on the days a standby plant never discharges are not that discharge's to bear.
   */
  const auxDischargePerCycle = auxDischargePerUnit / Math.max(input.cyclesPerDay, 1);

  const retention = (age: number) => input.degradation.mode === 'table'
    ? retentionFromTable(age, input.degradation.retention)
    : retentionAt(age, efcPerYear, cell, tempFactor);

  /** Usable AC energy from `units` enclosures at a given retention, after the discharge path and auxiliaries. */
  const usableAc = (units: number, r: number) =>
    Math.max(0, units * unitDcMWh * r * L.usableDcWindow * input.dod * dischargePathEfficiency - units * auxDischargePerCycle);

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
  // Which constraint won decides how the plant reads. A power-limited fleet carries far more
  // energy than it is contracted for, and saying so is the difference between a plant that looks
  // over-specified and one whose duty explains itself.
  const binding: 'power' | 'energy' = unitsForPower >= unitsForEnergy ? 'power' : 'energy';

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
    const dcPerCycle = Math.min(meanStored, (acPerCycle + auxDischargePerCycle * unitsAt(y)) / Math.max(dischargePathEfficiency, 0.1));
    const scale = input.cyclesPerDay * input.daysPerYear * L.availabilityFactor * input.availability;
    const deliveredMWh = acPerCycle * scale;
    const chargeMWh = y === 0 ? 0 : (dcPerCycle / Math.max(chargePathEfficiency, 0.1)) * scale + auxChargePerUnit * unitsAt(y) * input.daysPerYear * L.availabilityFactor * input.availability;

    years.push({
      year: y, retention: weighted, installedDcMWh, storedDcMWh, usableMWh,
      deliveredPerCycleMWh: acPerCycle, effectiveCycles: y === 0 ? 0 : scale,
      deliveredMWh, chargeMWh,
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
  // A throughput warranty is a quantity of energy, fixed by the cell's rated cycles at the depth
  // they were rated at. Scaling it by the customer's own depth of discharge made the warranty
  // shrink the more gently the plant was operated, which is backwards.
  const warrantyThroughputMWh = totalUnits * unitDcMWh * cell.cycleLife * cell.cycleLifeDod;

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

  // What the plant actually presents at its boundary, against the connection it is said to make.
  // A five-kilowatt supply with a 230 V inverter and no transformer was carrying a declared 33 kV
  // connection because that is what the form opened with. Either a transformer is missing from the
  // scope or the stated voltage is not this plant's — and both are worth saying out loud.
  const boundaryKV = transformer ? transformer.hvKV : pcs.acV / 1000;
  if (Math.abs(input.gridKV - boundaryKV) > Math.max(boundaryKV * 0.05, 0.02)) warnings.push({
    code: 'grid-voltage', level: 'warning',
    text: transformer
      ? `The ${transformer.model} steps up to ${transformer.hvKV} kV, against a connection stated at ${input.gridKV} kV. Either the transformer or the stated connection voltage needs changing before the single-line diagram is drawn.`
      : `With no transformer in scope the plant presents ${pcs.acV} V at the ${pcs.model} terminals, against a connection stated at ${input.gridKV} kV. Add a transformer or restate the connection as ${boundaryKV < 1 ? `${pcs.acV} V` : `${boundaryKV} kV`}.`,
  });
  if (input.ambientC > cell.dischargeTempC[1]) warnings.push({ code: 'ambient-high', level: 'error', text: `Design ambient ${input.ambientC} °C exceeds the cell discharge limit of ${cell.dischargeTempC[1]} °C.` });
  if (input.ambientC > 40 && enclosure.cooling === 'air') warnings.push({ code: 'cooling', level: 'warning', text: 'Air-cooled system at high ambient: derating and accelerated ageing are likely. Consider a liquid-cooled product.' });
  if (input.altitudeM > 2000) warnings.push({ code: 'altitude', level: 'warning', text: `Altitude ${input.altitudeM} m requires insulation-coordination and cooling derating review.` });
  const cycleSwing = input.dod * L.usableDcWindow;
  if (input.dod >= 0.99) warnings.push({ code: 'dod', level: 'warning', text: `Depth of discharge is set to a full cycle, leaving no state-of-charge reserve at either end. Each cycle swings ${(cycleSwing * 100).toFixed(0)}% of nameplate capacity, which is unlikely to sit inside the warranty envelope.` });
  else if (cycleSwing > 0.95) warnings.push({ code: 'dod', level: 'warning', text: `Each cycle swings ${(cycleSwing * 100).toFixed(0)}% of nameplate capacity across the usable DC window, above the 95% the warranty envelope assumes.` });
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
      const aux = auxDischargePerCycle * units;
      return `${installedDcMWh.toFixed(2)} MWh installed delivers ${requiredUsableMWh.toFixed(2)} MWh to the meter — ${headroom.toFixed(1)}× the contracted energy, and here is where it goes. `
        + `${Math.round(input.dod * 100)}% depth of discharge across a ${Math.round(L.usableDcWindow * 100)}% usable window leaves ${stored.toFixed(2)} MWh. `
        + `${Math.round(designRetention * 100)}% retention in the design year and ${(dischargePathEfficiency * 100).toFixed(1)}% on the discharge path leave ${afterPath.toFixed(2)} MWh. `
        + `${aux.toFixed(2)} MWh of auxiliaries — this cycle's share of the day's ${(auxDischargePerUnit * units).toFixed(2)} MWh — leave ${(afterPath - aux).toFixed(2)} MWh, against ${requiredUsableMWh.toFixed(2)} MWh contracted; the margin is the last whole unit rounding up.`;
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
    binding, unitsForPower, unitsForEnergy: Number.isFinite(unitsForEnergy) ? unitsForEnergy : 0,
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
