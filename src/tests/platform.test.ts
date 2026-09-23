import { describe, it, expect, beforeEach } from 'vitest';
import { cells, enclosures, packSpecs, pcsUnits, byId, cellOf, packOf, enclosureEnergyKWh, enclosureCellCount, enclosureStrings, packEnergyKWh } from '../catalog/products';
import { atRate, currencies, defaultPriceBook, defaultLandedCost, landedCost, localRate, offerPcsInrPerKW, formatMoney, convert } from '../catalog/pricing';
import { applications, application } from '../sizing/applications';
import {
  defaultSizingInput, sizeSystem, normaliseSizingInput, retentionAt, retentionFromTable,
  cellTemperature, temperatureFactor, suppliedRetention, defaultLossChain, type SizingInput,
} from '../sizing/engine';
import { evaluateFinance, annualBenefitUsd, chargingEnergyMWh } from '../sizing/finance';
import { buildQuoteLines, createQuote, nextQuoteNumber, quoteTotals, reviseQuote, uplift } from '../quoting/quote';
import { defaultOfferContent, energySchedule, offerOf, offerTotals, plantConfiguration } from '../quoting/offer';
import { defaultBranding } from '../brand/brand';
import { LocalRepository, demoModeActive, repository, setDemoMode, usingFirestore } from '../platform/repo';
import { firebaseEnabled } from '../platform/firebase';
import { can, roles, type Customer, type Organization, type Project, type Quote } from '../platform/types';

const input = (patch: Partial<ReturnType<typeof defaultSizingInput>> = {}) => ({ ...defaultSizingInput(), ...patch });

describe('equipment catalogue', () => {
  it('keeps the supplied pack consistent with the 3D studio reference', () => {
    const pack = byId(packSpecs, 'pack-104s');
    expect(pack.series * pack.parallel).toBe(104);
    expect(pack.rows * pack.columns).toBe(104);
    expect(pack.nominalV).toBeCloseTo(332.8, 6);
    expect(packEnergyKWh(pack)).toBeCloseTo(104.4992, 6);
    expect(pack.labelKWh).toBe(104.45);              // the nameplate label, retained alongside the computed figure
    const enclosure = byId(enclosures, 'enc-5mwh-20ft');
    expect(enclosureEnergyKWh(enclosure)).toBeCloseTo(5015.9616, 4);
    expect(enclosureCellCount(enclosure)).toBe(4992);
    expect(enclosureStrings(enclosure)).toBe(12);    // 104S × 4 in series × 12 parallel strings
    expect(enclosure.ratedKW).toBe(2507.5);
  });

  it('transcribes the supplied product schedule', () => {
    const schedule: [string, number, number, number][] = [
      // model, series, nameplate volts, label kWh
      ['SB12100', 4, 12.8, 1.28], ['SB24100', 8, 25.6, 2.56], ['SB51100', 16, 51.2, 5.12],
      ['SB51314', 16, 51.2, 16.076], ['SB166314', 52, 166.4, 52.25], ['SB332314', 104, 332.8, 104.45],
    ];
    for (const [model, series, volts, label] of schedule) {
      const pack = packSpecs.find(p => p.model === model);
      expect(pack, model).toBeDefined();
      expect(pack!.series).toBe(series);
      expect(pack!.nominalV).toBeCloseTo(volts, 6);
      expect(pack!.labelKWh).toBe(label);
      expect(pack!.nominalV).toBeCloseTo(cellOf(pack!).nominalV * series, 6);
    }
    // Every 314 Ah pack runs at the 157 A continuous rating quoted in the schedule.
    for (const model of ['SB166314', 'SB332314']) expect(packSpecs.find(p => p.model === model)!.continuousA).toBe(157);
  });

  it('describes every entry with dimensions, warranty anchors and provenance', () => {
    for (const cell of cells) {
      expect(cell.cycleLifeRetention).toBeGreaterThan(0.5);
      expect(cell.calendarRetention).toBeGreaterThan(cell.cycleLifeRetention - 0.2);
      expect(['supplied', 'indicative', 'assumed']).toContain(cell.provenance);
      expect(cell.approvedVendors.length).toBeGreaterThan(0);
      expect(cell.certifications.length).toBeGreaterThan(2);
    }
    for (const enclosure of enclosures) {
      expect(() => packOf(enclosure)).not.toThrow();
      expect(() => cellOf(packOf(enclosure))).not.toThrow();
      expect(enclosure.dcMaxV).toBeGreaterThan(enclosure.dcMinV);
      expect(enclosure.ratedKW).toBeGreaterThan(0);
      expect(enclosure.racks * enclosure.packsPerRack % enclosure.packsInSeries).toBe(0);
      // The DC window must follow from the pack window and the string depth.
      expect(enclosure.dcMaxV).toBeCloseTo(packOf(enclosure).maxV * enclosure.packsInSeries, 4);
      expect(enclosure.dcMinV).toBeCloseTo(packOf(enclosure).minV * enclosure.packsInSeries, 4);
    }
    expect(new Set(enclosures.map(e => e.id)).size).toBe(enclosures.length);
    expect(() => byId(pcsUnits, 'missing')).toThrow();
  });
});

describe('degradation model', () => {
  it('starts at full capacity and falls monotonically', () => {
    const cell = cells[0], factor = temperatureFactor(cellTemperature(35, 'liquid'));
    expect(retentionAt(0, 300, cell, factor)).toBe(1);
    let previous = 1;
    for (let year = 1; year <= 20; year++) {
      const r = retentionAt(year, 300, cell, factor);
      expect(r).toBeLessThan(previous);
      previous = r;
    }
    expect(previous).toBeGreaterThan(0.6);
    expect(previous).toBeLessThan(0.85);
  });

  it('ages faster at a heavier duty cycle and at a higher cell temperature', () => {
    const cell = cells[0], mild = temperatureFactor(cellTemperature(25, 'liquid'));
    expect(retentionAt(10, 600, cell, mild)).toBeLessThan(retentionAt(10, 200, cell, mild));
    const hot = temperatureFactor(cellTemperature(50, 'air'));
    expect(hot).toBeGreaterThan(mild);
    expect(retentionAt(10, 300, cell, hot)).toBeLessThan(retentionAt(10, 300, cell, mild));
  });

  it('cools a liquid enclosure closer to the reference temperature than an air-cooled one', () => {
    expect(cellTemperature(48, 'liquid')).toBeLessThan(cellTemperature(48, 'air'));
    expect(temperatureFactor(25)).toBe(1);
  });
});

describe('sizing engine', () => {
  it('sizes for the design year and reports a consistent fleet', () => {
    const result = sizeSystem(input({ powerMW: 5, durationH: 2, augmentation: 'oversize-day1', projectYears: 20 }));
    expect(result.requiredUsableMWh).toBe(10);
    expect(result.day1UsableMWh).toBeGreaterThan(result.requiredUsableMWh);
    expect(result.years.at(-1)!.usableMWh).toBeGreaterThanOrEqual(result.requiredUsableMWh - 1e-9);
    expect(result.installedDcMWh).toBeCloseTo(result.units * enclosureEnergyKWh(result.enclosure) / 1000, 9);
    expect(result.cells).toBe(result.units * enclosureCellCount(result.enclosure));
    expect(result.packs).toBe(result.units * result.enclosure.racks * result.enclosure.packsPerRack);
  });

  it('never exceeds the cell discharge rating, adding enclosures when power dominates', () => {
    const result = sizeSystem(input({ powerMW: 8, durationH: 1, augmentation: 'periodic' }));
    expect(result.systemCRate).toBeLessThanOrEqual(result.packCRate + 1e-9);
    expect(result.warnings.some(w => w.code === 'power-limited')).toBe(true);
    expect(result.warnings.some(w => w.code === 'c-rate')).toBe(false);
  });

  it('augments only when capacity falls short, and ages each cohort from its own year', () => {
    const result = sizeSystem(input({ applicationId: 'energy-arbitrage', powerMW: 5, augmentation: 'periodic', projectYears: 20 }));
    expect(result.augmentations.length).toBeGreaterThan(0);
    expect(result.totalUnits).toBeGreaterThan(result.units);
    for (const year of result.years.slice(1)) expect(year.shortfall).toBe(false);
    // A cohort installed later must retain more capacity than the original fleet at the same date.
    const aug = result.augmentations[0], cell = cellOf(packOf(result.enclosure));
    const factor = temperatureFactor(cellTemperature(result.input.ambientC, result.enclosure.cooling));
    const end = result.input.projectYears;
    expect(retentionAt(end - aug.year, result.efcPerYear, cell, factor)).toBeGreaterThan(retentionAt(end, result.efcPerYear, cell, factor));
  });

  it('reports a shortfall when no capacity maintenance is planned', () => {
    const result = sizeSystem(input({ applicationId: 'frequency-regulation', powerMW: 4, augmentation: 'none', projectYears: 20 }));
    expect(result.warnings.some(w => w.code === 'capacity-shortfall')).toBe(true);
  });

  it('raises the site and equipment checks that apply', () => {
    const hot = sizeSystem(input({ ambientC: 58 }));
    expect(hot.warnings.some(w => w.code === 'ambient-high')).toBe(true);
    const high = sizeSystem(input({ altitudeM: 3200 }));
    expect(high.warnings.some(w => w.code === 'altitude')).toBe(true);
    const mismatched = sizeSystem(input({ pcsId: 'pcs-125' }));
    expect(mismatched.warnings.some(w => w.code === 'dc-window-high')).toBe(true);
    expect(mismatched.warnings.find(w => w.code === 'dc-window-high')!.text).toContain('per cell');
    const airCooled = sizeSystem(input({ equipment: 'pinned', enclosureId: 'enc-52-rack', pcsId: 'pcs-125', ambientC: 45, powerMW: 0.02, durationH: 2 }));
    expect(airCooled.warnings.some(w => w.code === 'cooling')).toBe(true);
    expect(sizeSystem(input()).warnings.some(w => w.code === 'validation')).toBe(true);
  });

  it('treats availability as a time metric, not an energy derate', () => {
    const full = sizeSystem(input({ availability: 1 })), reduced = sizeSystem(input({ availability: 0.8 }));
    expect(reduced.day1UsableMWh).toBeCloseTo(full.day1UsableMWh, 9);
    expect(reduced.years[1].deliveredMWh).toBeLessThan(full.years[1].deliveredMWh);
  });

  it('gives every application a preset that sizes without an error', () => {
    for (const app of applications) {
      const result = sizeSystem(defaultSizingInput(app.id));
      expect(result.units).toBeGreaterThan(0);
      expect(result.warnings.filter(w => w.level === 'error'), app.id).toEqual([]);
      expect(result.rteAc).toBeGreaterThan(0.8);
      expect(result.rteAc).toBeLessThan(1);
    }
  });
});

describe('financial model', () => {
  it('builds a cost stack that reconciles to the quoted capital cost', () => {
    const sizing = sizeSystem(input({ powerMW: 5, durationH: 4 }));
    const finance = evaluateFinance(sizing, defaultPriceBook);
    const lineTotal = finance.lines.reduce((s, l) => s + l.totalUsd, 0);
    expect(lineTotal).toBeCloseTo(finance.subtotalUsd, 6);
    expect(finance.capexUsd).toBeCloseTo(finance.subtotalUsd + finance.contingencyUsd + finance.marginUsd + finance.taxUsd, 6);
    expect(finance.rows[0].capexUsd).toBeCloseTo(finance.capexUsd, 6);
    expect(finance.capexPerKWhUsd).toBeCloseTo(finance.capexUsd / (sizing.installedDcMWh * 1000), 9);
  });

  it('charges imported energy once, separately from gross revenue', () => {
    const sizing = sizeSystem(input({ applicationId: 'energy-arbitrage', powerMW: 5 }));
    const year = sizing.years[1];
    const charge = chargingEnergyMWh(sizing, year);
    expect(charge).toBeGreaterThan(year.deliveredMWh);   // losses and auxiliaries ride on top
    expect(annualBenefitUsd(sizing, defaultPriceBook)).toBeGreaterThan(0);
    // A regulation duty is close to energy neutral: it buys its losses and auxiliaries, but only a
    // tenth of the energy it cycles. The same plant on an arbitrage duty buys all of it.
    const regulation = sizeSystem(input({ applicationId: 'frequency-regulation', powerMW: 5 }));
    const rYear = regulation.years[1];
    const neutral = chargingEnergyMWh(regulation, rYear);
    const lossesAndAux = rYear.chargeMWh - rYear.deliveredMWh;
    const wheeling = rYear.gridChargeMWh / rYear.chargeMWh;   // charging is bought at the generation end
    expect(neutral).toBeCloseTo((rYear.deliveredMWh * 0.1 + lossesAndAux) * wheeling, 6);
    expect(neutral).toBeLessThan(rYear.gridChargeMWh);
  });

  it('keeps net present value, internal rate of return and payback mutually consistent', () => {
    const sizing = sizeSystem(input({ applicationId: 'microgrid', powerMW: 5 }));
    const finance = evaluateFinance(sizing, defaultPriceBook);
    expect(finance.irrPct).not.toBeNull();
    expect(finance.irrPct!).toBeGreaterThan(defaultPriceBook.discountRatePct);
    expect(finance.npvUsd).toBeGreaterThan(0);
    expect(finance.paybackYears).toBeGreaterThan(0);
    expect(finance.lcosPerMWhUsd).toBeGreaterThan(0);
    const cumulative = finance.rows.at(-1)!.cumulativeUsd;
    expect(cumulative).toBeCloseTo(finance.rows.reduce((s, r) => s + r.netUsd, 0), 6);
  });

  it('prices augmentation at the declining battery price of its delivery year', () => {
    const sizing = sizeSystem(input({ applicationId: 'energy-arbitrage', powerMW: 5, augmentation: 'periodic' }));
    const finance = evaluateFinance(sizing, defaultPriceBook);
    expect(sizing.augmentations.length).toBeGreaterThan(0);
    expect(finance.augmentationUsd).toBeGreaterThan(0);
    for (const aug of sizing.augmentations) expect(finance.rows[aug.year].capexUsd).toBeGreaterThan(0);
    const firstUnitCost = finance.rows[sizing.augmentations[0].year].capexUsd / sizing.augmentations[0].units;
    const dayOneUnitCost = finance.capexUsd / sizing.units;
    expect(firstUnitCost).toBeLessThan(dayOneUnitCost * 1.2);
  });
});

describe('currency handling', () => {
  it('formats negatives with a leading minus and converts through USD', () => {
    expect(formatMoney(-1_250_000, 'USD', true)).toBe('−$1.25 M');
    expect(formatMoney(1500, 'USD', true)).toBe('$1.5 k');
    expect(formatMoney(2_00_00_000, 'INR', true)).toBe('₹2.00 cr');
    expect(convert(100, 'INR')).toBeCloseTo(100 * currencies.INR.perUsd, 9);
    expect(convert(100, 'USD')).toBe(100);
  });
});

describe('quotation build-up', () => {
  const sizing = sizeSystem(input({ powerMW: 5, durationH: 2 }));
  const finance = evaluateFinance(sizing, defaultPriceBook);
  const customer = { id: 'cus_1', name: 'Test Utility' } as Customer;
  const project = { id: 'prj_1', name: 'Test project' } as Project;
  const make = (existing: Quote[] = []) => createQuote({
    orgId: 'org_1', customer, project, sizing, finance, priceBook: defaultPriceBook,
    currency: 'USD', number: nextQuoteNumber(existing), preparedBy: 'Tester', preparedByEmail: 't@example.com', ownerUid: 'u_sales',
  });

  it('carries contingency and margin into the sell price without exposing them', () => {
    const factor = uplift(finance);
    expect(factor).toBeGreaterThan(1);
    const lines = buildQuoteLines(sizing, finance, 'USD', defaultPriceBook);
    const battery = lines.find(l => l.id === 'battery')!, cost = finance.lines.find(l => l.id === 'battery')!;
    // The rate is carried at the precision the document prints it, so the line multiplies out.
    expect(battery.unitPrice).toBe(atRate(cost.unitCostUsd * factor * localRate(defaultPriceBook, 'USD'), 'USD'));
    expect(JSON.stringify(lines)).not.toContain('margin');
  });

  it('excludes optional lines from the total and applies discount before tax', () => {
    const quote = make();
    expect(quote.lines.some(l => l.optional)).toBe(true);
    expect(quote.subtotal).toBeCloseTo(quote.lines.filter(l => !l.optional).reduce((s, l) => s + l.total, 0), 6);
    const totals = quoteTotals(quote.lines, 10, 18, 5000);
    expect(totals.discount).toBeCloseTo(totals.subtotal * 0.1, 6);
    expect(totals.tax).toBeCloseTo((totals.subtotal - totals.discount + 5000) * 0.18, 6);
    expect(totals.total).toBeCloseTo(totals.subtotal - totals.discount + 5000 + totals.tax, 6);
  });

  it('numbers quotes sequentially and revises without reusing the identifier', () => {
    const first = make();
    expect(first.number).toMatch(/^JW-Q-\d{4}-0001$/);
    const second = make([first]);
    expect(second.number.endsWith('0002')).toBe(true);
    const revision = reviseQuote(first);
    expect(revision.number).toBe(first.number);
    expect(revision.version).toBe(2);
    expect(revision.id).not.toBe(first.id);
    expect(revision.status).toBe('draft');
    expect(revision.sentAt).toBeNull();
  });

  it('snapshots the sizing and finance behind the price so a sent quote never moves', () => {
    const quote = make();
    const snapshot = quote.sizingSnapshot as { units: number; ratedPowerMW: number };
    expect(snapshot.units).toBe(sizing.units);
    expect(snapshot.ratedPowerMW).toBeCloseTo(sizing.ratedPowerMW, 9);
    expect(quote.assumptions.length).toBeGreaterThan(3);
    expect(quote.scopeIncluded.length).toBeGreaterThan(3);
    expect(quote.scopeExcluded.length).toBeGreaterThan(3);
  });
});

describe('permissions and the offline repository', () => {
  it('grants writes to the commercial roles and read-only access to a viewer', () => {
    expect(roles).toContain('owner');
    for (const role of ['owner', 'admin', 'engineer', 'sales'] as const) expect(can(role, 'quote.write')).toBe(true);
    expect(can('viewer', 'quote.write')).toBe(false);
    expect(can('viewer', 'read')).toBe(true);
    expect(can('sales', 'pricebook.write')).toBe(false);
    expect(can('engineer', 'org.manage')).toBe(false);
    expect(can(null, 'read')).toBe(false);
  });

  it('round-trips records, notifies watchers and scopes data to one organization', async () => {
    const repo = new LocalRepository();
    const customer = { id: 'c1', orgId: 'org_a', name: 'Alpha', updatedAt: '2026-01-02' } as Customer;
    const seen: Customer[][] = [];
    const stop = repo.watch('org_a', 'customers', rows => seen.push(rows));
    await repo.save('org_a', 'customers', customer);
    await repo.save('org_b', 'customers', { ...customer, id: 'c2', orgId: 'org_b', name: 'Beta' } as Customer);
    expect((await repo.list('org_a', 'customers')).map(c => c.name)).toEqual(['Alpha']);
    expect((await repo.list('org_b', 'customers')).map(c => c.name)).toEqual(['Beta']);
    expect(await repo.get('org_a', 'customers', 'c2')).toBeNull();
    expect(seen.at(-1)).toHaveLength(1);
    stop();
    await repo.remove('org_a', 'customers', 'c1');
    expect(await repo.list('org_a', 'customers')).toEqual([]);
    expect(seen.at(-1)).toHaveLength(1); // the stopped watcher received nothing further
  });

  it('keeps the demonstration workspace in browser storage even when Firestore is configured', async () => {
    // Without this, the demo button on a deployed site would write to Firestore unauthenticated,
    // the rules would correctly refuse every write, and the workspace would look broken.
    setDemoMode(true);
    expect(demoModeActive()).toBe(true);
    expect(repository().kind).toBe('local');
    expect(usingFirestore()).toBe(false);

    const customer = { id: 'd1', orgId: 'demo', name: 'Demo customer', updatedAt: '2026-01-01' } as Customer;
    await repository().save('demo', 'customers', customer);
    expect((await repository().list('demo', 'customers')).map(c => c.name)).toEqual(['Demo customer']);

    // Leaving demo mode hands the repository back to whatever the environment is configured for.
    setDemoMode(false);
    expect(demoModeActive()).toBe(false);
    expect(repository().kind).toBe(firebaseEnabled ? 'firestore' : 'local');
    expect(usingFirestore()).toBe(firebaseEnabled);
  });

  it('sorts each collection by its own recency key', async () => {
    const repo = new LocalRepository();
    for (const [id, at] of [['a', '2026-01-01'], ['b', '2026-03-01'], ['c', '2026-02-01']] as const) {
      await repo.save('org', 'activities', { id, orgId: 'org', at } as never);
    }
    expect((await repo.list('org', 'activities')).map(a => a.id)).toEqual(['b', 'c', 'a']);
  });
});

describe('application presets', () => {
  it('describes every application with a duty cycle, revenue basis and risks', () => {
    for (const app of applications) {
      expect(app.durationH).toBeGreaterThan(0);
      expect(app.dod).toBeGreaterThan(0.3);
      expect(app.chargeFactor).toBeGreaterThan(0);
      expect(app.chargeFactor).toBeLessThanOrEqual(1);
      expect(app.keyRisks.length).toBeGreaterThanOrEqual(3);
    }
    expect(application('peak-shaving').id).toBe('peak-shaving');
    expect(new Set(applications.map(a => a.id)).size).toBe(applications.length);
  });
});

beforeEach(() => globalThis.localStorage?.clear?.());

/**
 * These lock the engine to the supplied workbooks. If a default moves, one of these fails and the
 * quoted numbers stop matching the offer that was issued to the customer.
 */
describe('fidelity to the supplied workbooks', () => {
  it('reproduces the supply offer landed-cost build-up', () => {
    const b = landedCost(defaultLandedCost(), 5015, 2507.5);
    expect(b.fobUsd).toBeCloseTo(341_020, 4);
    expect(b.oceanFreightUsd).toBeCloseTo(5_115.3, 4);
    expect(b.cifUsd).toBeCloseTo(346_135.3, 4);
    expect(b.cifInr).toBeCloseTo(33_575_124.1, 2);
    expect(b.customsDutyInr).toBeCloseTo(3_693_263.651, 2);
    expect(b.inlandClearanceInr).toBeCloseTo(503_626.8615, 2);
    expect(b.deliveredInr).toBeCloseTo(37_772_014.6125, 2);
    expect(b.pcsInr).toBeCloseTo(3_250_000, 2);
    expect(b.totalInr).toBeCloseTo(41_022_014.6125, 2);
    expect(offerPcsInrPerKW * 2507.5).toBeCloseTo(3_250_000, 6);
    // The issued 350 MW proposal, at USD 69/kWh.
    const issued = landedCost({ ...defaultLandedCost(), basicPriceUsdPerKWh: 69 }, 5015, 2507.5);
    expect(issued.fobUsd).toBeCloseTo(346_035, 4);
    expect(issued.oceanFreightUsd).toBeCloseTo(5_190.525, 4);
    expect(Math.round(issued.deliveredInr)).toBe(38_327_485);
    expect(Math.round(issued.totalInr)).toBe(41_577_485);
    expect(Math.round(issued.totalInr * 140)).toBe(5_820_847_958);
  });

  it('moves the landed cost with each input independently', () => {
    const base = landedCost(defaultLandedCost(), 5015, 2507.5);
    const dearer = landedCost({ ...defaultLandedCost(), basicPriceUsdPerKWh: 80 }, 5015, 2507.5);
    expect(dearer.fobUsd / base.fobUsd).toBeCloseTo(80 / 68, 9);
    const weakRupee = landedCost({ ...defaultLandedCost(), exchangeRateInrPerUsd: 110 }, 5015, 2507.5);
    expect(weakRupee.deliveredInr / base.deliveredInr).toBeCloseTo(110 / 97, 9);
    // A pure exchange-rate move leaves the dollar cost of imported equipment unchanged.
    expect(weakRupee.deliveredInr / 110).toBeCloseTo(base.deliveredInr / 97, 6);
    const noDuty = landedCost({ ...defaultLandedCost(), customsDutyPct: 0 }, 5015, 2507.5);
    expect(noDuty.customsDutyInr).toBe(0);
    expect(noDuty.deliveredInr).toBeCloseTo(base.deliveredInr - base.customsDutyInr, 6);
  });

  it('carries the supplied 20-year degradation schedule', () => {
    expect(suppliedRetention).toHaveLength(21);
    expect(suppliedRetention[0]).toBe(1);
    expect(suppliedRetention[1]).toBe(0.95);
    expect(suppliedRetention[10]).toBe(0.80);
    expect(suppliedRetention[20]).toBe(0.69);
    for (let y = 1; y < suppliedRetention.length; y++) expect(suppliedRetention[y]).toBeLessThan(suppliedRetention[y - 1]);
    expect(retentionFromTable(0, suppliedRetention)).toBe(1);
    expect(retentionFromTable(7, suppliedRetention)).toBe(0.84);
    // Past the end of the schedule the last year-on-year step repeats rather than falling off.
    expect(retentionFromTable(22, suppliedRetention)).toBeCloseTo(0.67, 9);
  });

  it('reproduces the supplied energy chain year by year', () => {
    const base = defaultSizingInput('solar-shifting');
    const result = sizeSystem({
      ...base, mode: 'usable-energy', usableEnergyMWh: 3.8, durationH: 2,
      cyclesPerDay: 1, daysPerYear: 365, dod: 1, availability: 1, projectYears: 20,
      augmentation: 'none', losses: { ...base.losses, idtOnDischarge: false },
    });
    expect(result.units).toBe(1);
    // Discharge path: sqrt(95%) DC, then DC cable, PCS and AC cable — the sheet's own chain.
    expect(result.dischargePathEfficiency).toBeCloseTo(Math.sqrt(0.95) * 0.9975 * 0.985 * 0.9975, 9);
    expect(result.chargePathEfficiency).toBeCloseTo(0.95 * 0.9975 * 0.985 * 0.9975 * 0.99, 9);

    const scale = 5.015 / (result.installedDcMWh);    // the sheet quotes the nameplate label
    for (const [year, storedMWh, usableMWh] of [[1, 4.526037, 3.823565], [10, 3.811400, 3.140897], [20, 3.287332, 2.640274]] as const) {
      const row = result.years[year];
      expect(row.storedDcMWh * scale).toBeCloseTo(storedMWh, 5);
      // Auxiliaries are a fixed MWh/day subtraction, so they do not scale with the nameplate label.
      expect((row.usableMWh + 0.5) * scale - 0.5).toBeCloseTo(usableMWh, 4);
    }

    // Charging energy, in the years where the plant has nothing spare and cycles in full.
    for (const [year, chargeKWh, solarKWh] of [[10, 1_616_108.292408, 1_811_374.459099], [20, 1_418_964.6127, 1_590_410.908653]] as const) {
      const row = result.years[year];
      expect(row.chargeMWh * 1000 * scale).toBeCloseTo(chargeKWh, -2);
      expect(row.gridChargeMWh * 1000 * scale).toBeCloseTo(solarKWh, -2);
      expect(row.gridChargeMWh / row.chargeMWh).toBeCloseTo(1 / (1 - 0.1078), 9);
    }
  });

  it('charges only what it delivers once the plant has spare capacity', () => {
    const base = defaultSizingInput('solar-shifting');
    const common = {
      ...base, mode: 'usable-energy' as const, cyclesPerDay: 1, daysPerYear: 365,
      dod: 1, availability: 1, projectYears: 20, augmentation: 'none' as const,
    };
    // Year one has more capacity than the contract needs, so the battery does not cycle in full.
    const clipped = sizeSystem({ ...common, usableEnergyMWh: 3 });
    const factor = 365 * clipped.input.losses.availabilityFactor;
    expect(clipped.years[1].deliveredMWh).toBeCloseTo(3 * factor, 6);
    // A full cycle would move the whole stored charge; the contract only calls for part of it.
    const fullCycleCharge = clipped.years[1].storedDcMWh / clipped.chargePathEfficiency * factor;
    expect(clipped.years[1].chargeMWh).toBeLessThan(fullCycleCharge);
    // Once capacity has faded past the contract the plant cycles in full and both fall together.
    expect(clipped.years[20].usableMWh).toBeLessThan(3);
    expect(clipped.years[20].deliveredMWh).toBeLessThan(clipped.years[1].deliveredMWh);
    expect(clipped.years[20].chargeMWh).toBeLessThan(clipped.years[1].chargeMWh);
  });

  it('keeps the transformer-loss treatment visible rather than silent', () => {
    const withIdt = sizeSystem(defaultSizingInput());
    const sheetStyle = sizeSystem({ ...defaultSizingInput(), losses: { ...defaultLossChain(), idtOnDischarge: false } });
    expect(sheetStyle.dischargePathEfficiency).toBeGreaterThan(withIdt.dischargePathEfficiency);
    expect(sheetStyle.dischargePathEfficiency / withIdt.dischargePathEfficiency).toBeCloseTo(1 / 0.99, 6);
    expect(sheetStyle.warnings.some(w => w.code === 'idt-discharge')).toBe(true);
    expect(withIdt.warnings.some(w => w.code === 'idt-discharge')).toBe(false);
  });

  it('surfaces the 1 518 V string against a 1 500 V converter', () => {
    const enclosure = byId(enclosures, 'enc-5mwh-20ft');
    expect(enclosure.dcMaxV).toBeCloseTo(1518.4, 4);
    expect(sizeSystem(defaultSizingInput()).warnings.some(w => w.code === 'dc-window-high')).toBe(true);
  });
});

describe('editable design inputs', () => {
  const base = () => defaultSizingInput('solar-shifting');

  it('responds to every loss slider in the expected direction', () => {
    const reference = sizeSystem(base());
    const lossier = sizeSystem({ ...base(), losses: { ...defaultLossChain(), pcsLoss: 0.05 } });
    expect(lossier.day1UsableMWh).toBeLessThan(reference.day1UsableMWh);
    expect(lossier.units).toBeGreaterThanOrEqual(reference.units);

    const narrower = sizeSystem({ ...base(), losses: { ...defaultLossChain(), usableDcWindow: 0.8 } });
    expect(narrower.day1UsableMWh).toBeLessThan(reference.day1UsableMWh);

    const thirstier = sizeSystem({ ...base(), losses: { ...defaultLossChain(), auxScale: 2 } });
    expect(thirstier.auxMWhPerDay / thirstier.units).toBeGreaterThan(reference.auxMWhPerDay / reference.units);
    expect(thirstier.day1UsableMWh / thirstier.units).toBeLessThan(reference.day1UsableMWh / reference.units);

    const wheeled = sizeSystem({ ...base(), losses: { ...defaultLossChain(), openAccessLoss: 0.25 } });
    expect(wheeled.years[1].gridChargeMWh).toBeGreaterThan(reference.years[1].gridChargeMWh);
    expect(wheeled.years[1].chargeMWh).toBeCloseTo(reference.years[1].chargeMWh, 6);
  });

  it('uses the edited degradation schedule instead of the model curve', () => {
    const flat = Array.from({ length: 21 }, (_, y) => (y === 0 ? 1 : 0.99));
    const kind = sizeSystem({ ...base(), degradation: { mode: 'table', retention: flat }, augmentation: 'oversize-day1' });
    const supplied = sizeSystem({ ...base(), augmentation: 'oversize-day1' });
    expect(kind.endOfLifeRetention).toBeCloseTo(0.99, 6);
    expect(kind.units).toBeLessThanOrEqual(supplied.units);
    expect(supplied.endOfLifeRetention).toBeCloseTo(0.69, 6);

    const modelled = sizeSystem({ ...base(), degradation: { mode: 'model', retention: [] } });
    // The modelled curve is derived from the cell's warranty anchors at this duty, not read from
    // the schedule, so it is free to land anywhere — including, by coincidence, near the table's
    // own end point. What has to hold is that the two are computed by different routes.
    expect(modelled.years.map(y => y.retention)).not.toEqual(supplied.years.map(y => y.retention));
  });

  it('prices a quotation through whichever costing basis is selected', () => {
    const sizing = sizeSystem({ ...base(), powerMW: 5, durationH: 4 });
    const landedBook = { ...defaultPriceBook, costingMode: 'landed-import' as const, supplyScope: 'supply-only' as const };
    const directBook = { ...defaultPriceBook, costingMode: 'direct' as const, supplyScope: 'turnkey' as const };
    const landedFinance = evaluateFinance(sizing, landedBook), directFinance = evaluateFinance(sizing, directBook);

    expect(landedFinance.landed).not.toBeNull();
    expect(landedFinance.lines.some(l => l.id === 'freight')).toBe(false);   // ocean freight is inside CIF
    expect(landedFinance.lines.some(l => l.id === 'civil')).toBe(false);     // supply only
    expect(directFinance.landed).toBeNull();
    expect(directFinance.lines.some(l => l.id === 'freight')).toBe(true);
    expect(directFinance.lines.some(l => l.id === 'civil')).toBe(true);
    expect(directFinance.capexUsd).toBeGreaterThan(landedFinance.capexUsd);

    // The landed battery line must equal the delivered price of the fleet, to the rupee.
    const perUnit = landedCost(landedBook.landed, sizing.installedDcMWh * 1000 / sizing.units, sizing.enclosure.ratedKW);
    const batteryLine = landedFinance.lines.find(l => l.id === 'battery')!;
    expect(batteryLine.totalUsd).toBeCloseTo(sizing.units * perUnit.deliveredInr / landedBook.landed.exchangeRateInrPerUsd, 6);
    // The issued proposal bundles one converter allowance per enclosure.
    const pcsLine = landedFinance.lines.find(l => l.id === 'pcs')!;
    expect(pcsLine.quantity).toBe(sizing.units);
    expect(pcsLine.totalUsd).toBeCloseTo(sizing.units * landedBook.landed.pcsCostInrPerUnit / landedBook.landed.exchangeRateInrPerUsd, 6);
    // On the per-kW basis it follows the converters actually installed instead.
    const perKw = evaluateFinance(sizing, { ...landedBook, landed: { ...landedBook.landed, pcsBasis: 'per-installed-kw' as const } });
    const perKwLine = perKw.lines.find(l => l.id === 'pcs')!;
    expect(perKwLine.quantity).toBeCloseTo(sizing.pcsCount * sizing.pcs.ratedKW, 6);
  });

  it('prices charging from an open-access plant at the wheeled PPA rate', () => {
    const sizing = sizeSystem({ ...base(), powerMW: 5 });
    const solar = evaluateFinance(sizing, { ...defaultPriceBook, chargeSource: 'open-access-solar', solarPpaPerMWh: 31 });
    const grid = evaluateFinance(sizing, { ...defaultPriceBook, chargeSource: 'grid', energyBuyPerMWh: 62 });
    expect(solar.rows[1].chargingUsd).toBeLessThan(grid.rows[1].chargingUsd);
    expect(grid.rows[1].chargingUsd / solar.rows[1].chargingUsd).toBeCloseTo(62 / 31, 6);
  });
});

describe('stored projects written by an earlier version', () => {
  it('fills in the loss chain, degradation schedule and retired catalogue ids', () => {
    const legacy = {
      applicationId: 'peak-shaving', mode: 'power-duration', powerMW: 5, durationH: 2, usableEnergyMWh: 10,
      cyclesPerDay: 1, daysPerYear: 250, projectYears: 20, dod: 0.9, availability: 0.97,
      ambientC: 35, altitudeM: 100, enclosureId: 'enc-3745-20ft', pcsId: 'pcs-2500', transformerId: 'tx-3150',
      augmentation: 'oversize-day1', gridKV: 33, frequencyHz: 50, powerFactor: 0.95,
    } as unknown as SizingInput;
    const normalised = normaliseSizingInput(legacy);
    expect(normalised.enclosureId).toBe('enc-5mwh-20ft');
    expect(normalised.pcsId).toBe('pcs-2507');
    expect(normalised.losses.usableDcWindow).toBe(0.95);
    expect(normalised.degradation.retention).toEqual(suppliedRetention);
    expect(() => sizeSystem(legacy)).not.toThrow();
    expect(sizeSystem(legacy).units).toBeGreaterThan(0);
  });
});

describe('offer document', () => {
  const sizing = sizeSystem({ ...defaultSizingInput('solar-shifting'), powerMW: 5, durationH: 4 });
  const book = { ...defaultPriceBook, currency: 'INR' as const };
  const finance = evaluateFinance(sizing, book);
  const org = { id: 'o', name: 'Solarworld', branding: defaultBranding, currency: 'INR', plan: 'trial', createdAt: '', createdBy: '' } as unknown as Organization;
  const quote = createQuote({
    orgId: 'o', customer: { id: 'c', name: 'Greenko Group' } as Customer, project: { id: 'p', name: 'Plant' } as Project,
    sizing, finance, priceBook: book, currency: 'INR', number: 'SW/BESS/2026-27/001', ownerUid: 'u_sales',
    preparedBy: 'Tester', preparedByEmail: 't@example.com',
  });

  it('prices the quotation at the exchange rate the offer quotes, not a reference rate', () => {
    expect(localRate(book, 'INR')).toBe(book.landed.exchangeRateInrPerUsd);
    expect(localRate({ ...book, costingMode: 'direct' }, 'INR')).toBe(currencies.INR.perUsd);
    const battery = quote.lines.find(l => l.id === 'battery')!;
    const perUnitUsd = finance.lines.find(l => l.id === 'battery')!.unitCostUsd;
    expect(battery.unitPrice).toBe(atRate(perUnitUsd * uplift(finance) * book.landed.exchangeRateInrPerUsd, quote.currency));
  });

  it('reconciles the per-enclosure build-up with the order value on the same page', () => {
    // The customer-facing build-up carries contingency and margin inside the basic rate.
    const factor = uplift(finance);
    const sell = landedCost({
      ...book.landed,
      basicPriceUsdPerKWh: book.landed.basicPriceUsdPerKWh * factor,
      pcsCostInrPerUnit: book.landed.pcsCostInrPerUnit * factor,
      pcsCostInrPerKW: book.landed.pcsCostInrPerKW * factor,
    }, finance.landed!.kWh, finance.landed!.ratedKW);
    const enclosures = sizing.units * sell.deliveredInr, pcs = sizing.units * sell.pcsInr;
    // Anything outside the landed build-up — here the transformers — is carried as its own row, so
    // the three parts add up to the subtotal the customer sees.
    const other = quote.lines.filter(l => !l.optional && l.id !== 'battery' && l.id !== 'pcs').reduce((s, l) => s + l.total, 0);
    // The build-up is recomputed here at full precision while the order value is the sum of the
    // printed lines, each held at the rate the document shows. They may differ by the rounding of
    // those few lines and no more — pennies against hundreds of millions.
    expect(Math.abs(enclosures + pcs + other - quote.subtotal)).toBeLessThan(10);
    expect(other).toBeGreaterThan(0);
    expect(quote.total).toBeCloseTo(quote.subtotal - quote.discount + quote.freight + quote.tax, 6);

    // Supply-only with no transformer leaves the build-up alone against the order value.
    const supplyOnly = sizeSystem({ ...sizing.input, transformerId: null });
    const soFinance = evaluateFinance(supplyOnly, book);
    const soQuote = createQuote({
      orgId: 'o', customer: { id: 'c', name: 'X' } as Customer, project: { id: 'p', name: 'Y' } as Project,
      sizing: supplyOnly, finance: soFinance, priceBook: book, currency: 'INR', number: 'N', ownerUid: 'u_sales',
      preparedBy: 'T', preparedByEmail: 't@example.com',
    });
    const soFactor = uplift(soFinance);
    const soSell = landedCost({
      ...book.landed, basicPriceUsdPerKWh: book.landed.basicPriceUsdPerKWh * soFactor,
      pcsCostInrPerUnit: book.landed.pcsCostInrPerUnit * soFactor, pcsCostInrPerKW: book.landed.pcsCostInrPerKW * soFactor,
    }, soFinance.landed!.kWh, soFinance.landed!.ratedKW);
    expect(Math.abs(supplyOnly.units * (soSell.deliveredInr + soSell.pcsInr) - soQuote.subtotal)).toBeLessThan(10);
  });

  it('builds plant configuration, the energy schedule and its totals from the sizing', () => {
    const config = plantConfiguration(sizing);
    expect(config.find(r => r.parameter.startsWith('Cell'))!.total).toBe(`${sizing.cells.toLocaleString()} cells`);
    expect(config.find(r => r.parameter.startsWith('Enclosure'))!.total).toBe(`${sizing.units} enclosures`);
    expect(config.some(r => r.parameter.includes('transformer'))).toBe(!!sizing.transformer);

    const schedule = energySchedule(sizing);
    expect(schedule).toHaveLength(sizing.input.projectYears + 1);
    expect(schedule[0].year).toBe(0);
    expect(schedule[0].cycles).toBeNull();
    expect(schedule[1].retention).toBeCloseTo(0.95, 6);
    const totals = offerTotals(sizing);
    // Cycles are counted after availability, because that is the count the supplied energy beside
    // them was built from; the nominal duty appears in the section note instead.
    const derate = sizing.input.losses.availabilityFactor * sizing.input.availability;
    expect(totals.cycles).toBe(sizing.input.projectYears * Math.round(sizing.input.cyclesPerDay * sizing.input.daysPerYear * derate));
    expect(totals.cycles).toBeLessThan(sizing.input.projectYears * sizing.input.cyclesPerDay * sizing.input.daysPerYear);
    expect(totals.suppliedGWh).toBeCloseTo(schedule.slice(1).reduce((s, r) => s + r.suppliedGWh, 0), 6);
  });

  it('derives offer content from the organization and the sizing, and takes overrides', () => {
    const content = defaultOfferContent({
      org, sizing, customerName: 'Greenko Group', projectName: 'Plant', number: 'SW/001',
      deliveryWeeks: 20, warrantyYears: 5,
    });
    expect(content.title).toContain('MW');
    expect(content.submittedTo).toBe('Greenko Group');
    expect(content.highlights).toHaveLength(4);
    expect(content.qaStages.length).toBeGreaterThan(3);
    expect(content.interfaces.length).toBeGreaterThan(3);
    expect(content.approvedMakes.some(m => m.make === 'jouleWise')).toBe(true);
    expect(content.qualifications.join(' ')).toContain('open-access');
    // Anything stored on the quotation wins over the generated default.
    const overridden = offerOf({ ...quote, offer: { reference: 'CUSTOM/1', validityDays: 30 } }, content);
    expect(overridden.reference).toBe('CUSTOM/1');
    expect(overridden.validityDays).toBe(30);
    expect(overridden.submittedTo).toBe('Greenko Group');
  });

  it('names the augmentation programme in the qualifications when one is scheduled', () => {
    const augmented = sizeSystem({ ...defaultSizingInput('energy-arbitrage'), powerMW: 5, augmentation: 'periodic' });
    expect(augmented.augmentations.length).toBeGreaterThan(0);
    const content = defaultOfferContent({ org, sizing: augmented, customerName: 'X', projectName: 'Y', number: 'N', deliveryWeeks: 20, warrantyYears: 5 });
    expect(content.qualifications.join(' ')).toContain('augmentation deliveries');
    const plain = defaultOfferContent({ org, sizing, customerName: 'X', projectName: 'Y', number: 'N', deliveryWeeks: 20, warrantyYears: 5 });
    expect(plain.qualifications.join(' ')).toContain('assume no augmentation');
  });
});

describe('charge window', () => {
  const base = (patch: Partial<SizingInput> = {}) => sizeSystem({ ...defaultSizingInput('solar-shifting'), powerMW: 5, durationH: 4, chargeDurationH: 4, ...patch });

  it('sizes the fleet and the converters on whichever direction asks for more power', () => {
    const symmetric = base();
    expect(symmetric.chargePowerMW).toBeCloseTo(symmetric.ratedPowerMW, 6);

    // Half the window to put the same energy back means twice the power on the charge side.
    const fast = base({ chargeDurationH: 2 });
    expect(fast.chargePowerMW).toBeCloseTo(symmetric.requiredUsableMWh / 2, 6);
    expect(fast.pcsCount).toBeGreaterThan(symmetric.pcsCount);
    expect(fast.units).toBeGreaterThanOrEqual(symmetric.units);
    expect(fast.warnings.some(w => w.code === 'charge-limited')).toBe(true);

    // A longer window never shrinks the plant below what discharging already needs.
    const slow = base({ chargeDurationH: 12 });
    expect(slow.pcsCount).toBe(symmetric.pcsCount);
    expect(slow.warnings.some(w => w.code === 'charge-limited')).toBe(false);
  });

  it('keeps the charge rate inside the pack rating by sizing for it, and says what it cost', () => {
    // A half-hour window on a four-hour plant is eight times the discharge power, which is what
    // finally forces units beyond what the energy alone needs.
    const fast = base({ chargeDurationH: 0.5 });
    // The fleet grows until charging is achievable, so the design is never infeasible.
    expect(fast.chargeCRate).toBeLessThanOrEqual(fast.packCRate + 1e-9);
    expect(fast.warnings.some(w => w.code === 'charge-rate')).toBe(false);
    // And the extra units bought purely to charge faster are named, with the window that avoids them.
    const oversize = fast.warnings.find(w => w.code === 'charge-oversize');
    expect(oversize).toBeDefined();
    expect(oversize!.text).toMatch(/Allowing [\d.]+ h to charge/);
    const relaxed = Number(oversize!.text.match(/Allowing ([\d.]+) h/)![1]);
    expect(base({ chargeDurationH: relaxed }).units).toBeLessThan(fast.units);
  });

  it('defaults the charge window to the discharge duration and survives a record without one', () => {
    expect(defaultSizingInput('solar-shifting').chargeDurationH).toBe(defaultSizingInput('solar-shifting').durationH);
    const legacy = { ...defaultSizingInput(), chargeDurationH: undefined } as unknown as SizingInput;
    expect(normaliseSizingInput(legacy).chargeDurationH).toBe(legacy.durationH);
    expect(() => sizeSystem(legacy)).not.toThrow();
  });
});
