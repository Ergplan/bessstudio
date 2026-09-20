import { describe, it, expect, beforeEach } from 'vitest';
import { cells, enclosures, packSpecs, pcsUnits, byId, cellOf, packOf, enclosureEnergyKWh, enclosureCellCount, packEnergyKWh } from '../catalog/products';
import { currencies, defaultPriceBook, formatMoney, convert } from '../catalog/pricing';
import { applications, application } from '../sizing/applications';
import { defaultSizingInput, sizeSystem, retentionAt, cellTemperature, temperatureFactor } from '../sizing/engine';
import { evaluateFinance, annualBenefitUsd, chargingEnergyMWh } from '../sizing/finance';
import { buildQuoteLines, createQuote, nextQuoteNumber, quoteTotals, reviseQuote, uplift } from '../quoting/quote';
import { LocalRepository } from '../platform/repo';
import { can, roles, type Customer, type Project, type Quote } from '../platform/types';

const input = (patch: Partial<ReturnType<typeof defaultSizingInput>> = {}) => ({ ...defaultSizingInput(), ...patch });

describe('equipment catalogue', () => {
  it('keeps the supplied pack consistent with the 3D studio reference', () => {
    const pack = byId(packSpecs, 'pack-104s');
    expect(pack.series * pack.parallel).toBe(104);
    expect(pack.rows * pack.columns).toBe(104);
    expect(packEnergyKWh(pack)).toBeCloseTo(104.4992, 6);
    const enclosure = byId(enclosures, 'enc-5mwh-20ft');
    expect(enclosureEnergyKWh(enclosure)).toBeCloseTo(5015.9616, 4);
    expect(enclosureCellCount(enclosure)).toBe(4992);
  });

  it('describes every entry with dimensions, warranty anchors and provenance', () => {
    for (const cell of cells) {
      expect(cell.cycleLifeRetention).toBeGreaterThan(0.5);
      expect(cell.calendarRetention).toBeGreaterThan(cell.cycleLifeRetention - 0.2);
      expect(['supplied', 'indicative', 'assumed']).toContain(cell.provenance);
    }
    for (const enclosure of enclosures) {
      expect(() => packOf(enclosure)).not.toThrow();
      expect(() => cellOf(packOf(enclosure))).not.toThrow();
      expect(enclosure.dcMaxV).toBeGreaterThan(enclosure.dcMinV);
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
    const rating = cellOf(packOf(result.enclosure)).dischargeC;
    expect(result.systemCRate).toBeLessThanOrEqual(rating + 1e-9);
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
    const airCooled = sizeSystem(input({ enclosureId: 'enc-skid-nmc', ambientC: 45, powerMW: 0.2, durationH: 2 }));
    expect(airCooled.warnings.some(w => w.code === 'cooling')).toBe(true);
    expect(sizeSystem(input()).warnings.some(w => w.code === 'validation')).toBe(true);
  });

  it('treats availability as a time metric, not an energy derate', () => {
    const full = sizeSystem(input({ availability: 1 })), reduced = sizeSystem(input({ availability: 0.8 }));
    expect(reduced.day1UsableMWh).toBeCloseTo(full.day1UsableMWh, 9);
    expect(reduced.years[1].throughputMWh).toBeLessThan(full.years[1].throughputMWh);
  });

  it('gives every application a preset that sizes without an error', () => {
    for (const app of applications) {
      const result = sizeSystem(defaultSizingInput(app.id));
      expect(result.units).toBeGreaterThan(0);
      expect(result.warnings.filter(w => w.level === 'error')).toEqual([]);
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
    const throughput = sizing.years[1].throughputMWh;
    const charge = chargingEnergyMWh(sizing, throughput);
    expect(charge).toBeGreaterThan(throughput);          // losses are added on top of the imported share
    expect(annualBenefitUsd(sizing, defaultPriceBook)).toBeGreaterThan(0);
    // A regulation duty is close to energy neutral, so it imports far less than it discharges.
    const regulation = sizeSystem(input({ applicationId: 'frequency-regulation', powerMW: 5 }));
    expect(chargingEnergyMWh(regulation, 1000)).toBeLessThan(300);
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
    const dayOneUnitCost = finance.lines.find(l => l.id === 'battery')!.totalUsd / sizing.units;
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
    currency: 'USD', number: nextQuoteNumber(existing), preparedBy: 'Tester', preparedByEmail: 't@example.com',
  });

  it('carries contingency and margin into the sell price without exposing them', () => {
    const factor = uplift(finance);
    expect(factor).toBeGreaterThan(1);
    const lines = buildQuoteLines(sizing, finance, 'USD');
    const battery = lines.find(l => l.id === 'battery')!, cost = finance.lines.find(l => l.id === 'battery')!;
    expect(battery.unitPrice).toBeCloseTo(cost.unitCostUsd * factor, 6);
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
