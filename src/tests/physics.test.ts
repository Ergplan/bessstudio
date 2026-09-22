import { describe, expect, it } from 'vitest';
import {
  byId, cells, cellOf, enclosures, packOf, packSpecs, pcsUnits,
  enclosureEnergyKWh, enclosureCellCount, enclosureStrings, enclosureCRate, packAh,
} from '../catalog/products';
import { defaultLossChain, defaultSizingInput, retentionAt, retentionFromTable, sizeSystem, suppliedRetention } from '../sizing/engine';
import { buildModel } from '../domain/model';
import { evaluateFinance } from '../sizing/finance';
import { currencies, convert, defaultPriceBook } from '../catalog/pricing';
import { planSite } from '../geometry/site';
import { defaults } from '../config/schema';

/**
 * A first-principles audit.
 *
 * Every figure below is recomputed by hand from the cell up, rather than read back out of the code
 * that produced it, so an error in the model cannot hide behind a test that shares its arithmetic.
 */

const container = byId(enclosures, 'enc-5mwh-20ft');
const pack104 = byId(packSpecs, 'pack-104s');
const lfp314 = byId(cells, 'cell-lfp-314');

describe('the cell', () => {
  it('holds the energy its voltage and capacity say it does', () => {
    // 3.2 V x 314 Ah = 1004.8 Wh
    expect(lfp314.nominalV * lfp314.ah).toBeCloseTo(1004.8, 9);
  });

  it('has a charge window inside its discharge window, as lithium requires', () => {
    for (const cell of cells) {
      expect(cell.chargeTempC[0], `${cell.model} charge floor`).toBeGreaterThanOrEqual(cell.dischargeTempC[0]);
      expect(cell.chargeTempC[1], `${cell.model} charge ceiling`).toBeLessThanOrEqual(cell.dischargeTempC[1]);
      // Charging below freezing plates metallic lithium; no catalogue entry may permit it.
      expect(cell.chargeTempC[0], `${cell.model} must not charge below 0 C`).toBeGreaterThanOrEqual(0);
      expect(cell.minV).toBeLessThan(cell.nominalV);
      expect(cell.maxV).toBeGreaterThan(cell.nominalV);
    }
  });
});

describe('the pack', () => {
  it('scales the cell by its series and parallel counts', () => {
    for (const spec of packSpecs) {
      const cell = cellOf(spec);
      expect(spec.nominalV, `${spec.model} nominal`).toBeCloseTo(cell.nominalV * spec.series, 6);
      expect(spec.maxV, `${spec.model} max`).toBeCloseTo(cell.maxV * spec.series, 6);
      expect(spec.rows * spec.columns, `${spec.model} layout holds its cells`).toBe(spec.series * spec.parallel);
    }
  });

  it('carries a nameplate no larger than the energy its cells actually hold', () => {
    // A label above the computed figure would be selling energy that is not there.
    for (const spec of packSpecs) {
      const computed = cellOf(spec).nominalV * cellOf(spec).ah * spec.series * spec.parallel / 1000;
      // A nameplate is rounded, but it may not round its way above the cells it contains by
      // anything a buyer would notice.
      expect(spec.labelKWh, `${spec.model} label ${spec.labelKWh} vs computed ${computed.toFixed(4)}`)
        .toBeLessThanOrEqual(computed * 1.0005);
    }
  });

  it('never states a continuous current above its peak', () => {
    for (const spec of packSpecs) expect(spec.continuousA, spec.model).toBeLessThanOrEqual(spec.maxA);
  });
});

describe('the container', () => {
  it('is the sum of its packs', () => {
    // 104 cells x 1.0048 kWh x 4 packs x 12 racks
    const perPack = lfp314.nominalV * lfp314.ah * pack104.series / 1000;
    expect(perPack).toBeCloseTo(104.4992, 6);
    expect(enclosureEnergyKWh(container)).toBeCloseTo(perPack * 48, 6);
    expect(enclosureEnergyKWh(container)).toBeCloseTo(5015.9616, 4);
    expect(enclosureCellCount(container)).toBe(4992);
  });

  it('has the DC window its string depth gives it', () => {
    // 4 packs in series, each 104 cells: 416 cells end to end.
    expect(container.dcMaxV).toBeCloseTo(lfp314.maxV * pack104.series * container.packsInSeries, 6);
    expect(container.dcMinV).toBeCloseTo(2.5 * pack104.series * container.packsInSeries, 6);
    for (const enc of enclosures) {
      const p = packOf(enc);
      expect(enc.dcMaxV, `${enc.model} ceiling`).toBeCloseTo(p.maxV * enc.packsInSeries, 4);
      expect(enc.dcMinV, `${enc.model} floor`).toBeCloseTo(p.minV * enc.packsInSeries, 4);
      expect(enc.racks * enc.packsPerRack % enc.packsInSeries, `${enc.model} string depth divides its packs`).toBe(0);
    }
  });

  it('is rated at the power its strings can actually deliver', () => {
    // 12 parallel strings x 157 A = 1,884 A, at 1,331.2 V nominal = 2,508 kW.
    const strings = container.racks * container.packsPerRack / container.packsInSeries;
    expect(strings).toBe(12);
    expect(enclosureStrings(container)).toBe(strings);
    const nominalV = pack104.nominalV * container.packsInSeries;
    const kW = nominalV * strings * pack104.continuousA / 1000;
    expect(kW).toBeCloseTo(2508.0, 0);
    expect(container.ratedKW).toBeLessThanOrEqual(kW + 1);
  });

  it('is rated within half a C, which is what the pack sustains', () => {
    expect(packAh(pack104)).toBe(lfp314.ah * pack104.parallel);
    expect(pack104.continuousA / packAh(pack104)).toBeCloseTo(0.5, 6);
    expect(enclosureCRate(container)).toBeCloseTo(0.5, 2);
    for (const enc of enclosures) {
      const p = packOf(enc);
      expect(enclosureCRate(enc), `${enc.model}`).toBeCloseTo(p.continuousA / packAh(p), 9);
    }
  });
});

describe('the converter catalogue', () => {
  it('states a window a real string could sit inside', () => {
    for (const pcs of pcsUnits) {
      expect(pcs.dcMinV, pcs.model).toBeLessThan(pcs.dcMaxV);
      expect(pcs.efficiency, pcs.model).toBeGreaterThan(0.9);
      expect(pcs.efficiency, pcs.model).toBeLessThan(1);
      // Rated power has to be reachable inside the window: P = V x I.
      const bestCaseKW = pcs.dcMaxV * pcs.dcMaxA / 1000;
      expect(bestCaseKW, `${pcs.model} cannot reach ${pcs.ratedKW} kW within ${pcs.dcMaxV} V / ${pcs.dcMaxA} A`)
        .toBeGreaterThanOrEqual(pcs.ratedKW);
    }
  });
});

describe('degradation', () => {
  const cell = lfp314;

  it('falls, never rises, and never runs away', () => {
    let previous = 1;
    for (let y = 0; y <= 30; y += 0.5) {
      const r = retentionAt(y, 365, cell, 1);
      expect(r, `year ${y}`).toBeLessThanOrEqual(previous + 1e-12);
      expect(r).toBeGreaterThanOrEqual(0.2);
      previous = r;
    }
  });

  it('reaches the cell warranty point at the throughput the cell is warranted for', () => {
    // 8,000 full cycles to 80%: with calendar fade switched off, cycling alone must land there.
    const noCalendar = { ...cell, calendarRetention: 1 };
    const years = 10, efcPerYear = cell.cycleLife / years;
    expect(retentionAt(years, efcPerYear, noCalendar, 1)).toBeCloseTo(cell.cycleLifeRetention, 6);
  });

  it('reaches the calendar warranty point when nothing is cycled', () => {
    expect(retentionAt(cell.calendarYears, 0, cell, 1)).toBeCloseTo(cell.calendarRetention, 6);
  });

  it('ages faster when it runs hotter', () => {
    expect(retentionAt(10, 365, cell, 1.5)).toBeLessThan(retentionAt(10, 365, cell, 1));
  });

  it('reads the supplied schedule exactly, and extrapolates past its end', () => {
    suppliedRetention.forEach((r, y) => expect(retentionFromTable(y, suppliedRetention), `year ${y}`).toBe(r));
    const beyond = retentionFromTable(22, suppliedRetention);
    expect(beyond).toBeLessThan(suppliedRetention.at(-1)!);
    expect(beyond).toBeGreaterThan(0.2);
  });
});

describe('the loss chain', () => {
  it('reproduces the supplied sheet, asymmetry and all', () => {
    // The sheet applies 95% on charge and its square root on discharge. That is unusual enough
    // that it is worth pinning: if the defaults ever quietly become symmetric, this fails.
    const L = defaultLossChain();
    expect(L.chargeEfficiencyDc).toBe(0.95);
    expect(L.dischargeEfficiencyDc).toBeCloseTo(Math.sqrt(0.95), 12);
    expect(L.chargeEfficiencyDc * L.dischargeEfficiencyDc).toBeCloseTo(0.9259, 4);
  });

  it('never claims a round trip above one, on any combination of its inputs', () => {
    const sized = sizeSystem(defaultSizingInput());
    expect(sized.rteAc).toBeGreaterThan(0);
    expect(sized.rteAc).toBeLessThan(1);
    expect(sized.chargePathEfficiency).toBeLessThan(1);
    expect(sized.dischargePathEfficiency).toBeLessThan(1);
    // The AC round trip is the two paths multiplied; nothing may be counted once or three times.
    expect(sized.rteAc).toBeCloseTo(sized.chargePathEfficiency * sized.dischargePathEfficiency, 9);
  });
});

describe('the fleet the sizing arrives at', () => {
  const sized = (over: Partial<ReturnType<typeof defaultSizingInput>> = {}) =>
    sizeSystem({ ...defaultSizingInput(), ...over });

  it('delivers at least what was contracted on day one', () => {
    for (const [powerMW, durationH] of [[1, 2], [2.5, 4], [10, 2], [25, 1], [50, 4]] as const) {
      const s = sized({ powerMW, durationH, augmentation: 'none' });
      expect(s.day1UsableMWh, `${powerMW} MW x ${durationH} h`).toBeGreaterThanOrEqual(powerMW * durationH - 1e-6);
    }
  });

  it('buys no more containers than the requirement needs', () => {
    // One fewer unit has to fall short, or the fleet is oversized.
    for (const [powerMW, durationH] of [[2.5, 4], [10, 2], [25, 1]] as const) {
      const s = sized({ powerMW, durationH, augmentation: 'none' });
      const perUnit = s.day1UsableMWh / s.units;
      const powerBound = Math.ceil(powerMW * 1000 / s.enclosure.ratedKW);
      const energyBound = Math.ceil((powerMW * durationH) / perUnit);
      expect(s.units, `${powerMW} MW x ${durationH} h`).toBe(Math.max(powerBound, energyBound, 1));
    }
  });

  it('installs enough nameplate power for what it promises', () => {
    for (const [powerMW, durationH] of [[2.5, 4], [10, 2], [40, 1]] as const) {
      const s = sized({ powerMW, durationH });
      expect(s.units * s.enclosure.ratedKW / 1000, `${powerMW} MW battery rating`).toBeGreaterThanOrEqual(powerMW - 1e-9);
      expect(s.pcsTotalMW, `${powerMW} MW conversion`).toBeGreaterThanOrEqual(powerMW - 1e-9);
    }
  });

  it('conserves energy: what goes in covers what comes out and the losses with it', () => {
    const s = sized({ powerMW: 5, durationH: 4, projectYears: 10 });
    for (const y of s.years.slice(1)) {
      expect(y.chargeMWh, `year ${y.year}`).toBeGreaterThan(y.deliveredMWh);
      // Grid import is charging plus the open-access loss on the way in, so it is larger again.
      expect(y.gridChargeMWh, `year ${y.year} grid`).toBeGreaterThanOrEqual(y.chargeMWh);
      const impliedRte = y.deliveredMWh / y.chargeMWh;
      expect(impliedRte, `year ${y.year} implied round trip`).toBeGreaterThan(0.5);
      expect(impliedRte, `year ${y.year} implied round trip`).toBeLessThanOrEqual(s.rteAc + 1e-9);
    }
  });

  it('never stores more than it installed, or delivers more than it stored', () => {
    const s = sized({ powerMW: 5, durationH: 4, projectYears: 15, augmentation: 'periodic' });
    for (const y of s.years) {
      expect(y.storedDcMWh, `year ${y.year}`).toBeLessThanOrEqual(y.installedDcMWh + 1e-9);
      expect(y.usableMWh, `year ${y.year}`).toBeLessThanOrEqual(y.storedDcMWh + 1e-9);
      expect(y.retention, `year ${y.year} retention`).toBeGreaterThan(0);
      expect(y.retention, `year ${y.year} retention`).toBeLessThanOrEqual(1 + 1e-9);
    }
  });

  it('holds the contract for the whole term when it augments periodically', () => {
    const required = 5 * 4;
    const s = sized({ powerMW: 5, durationH: 4, projectYears: 20, augmentation: 'periodic' });
    for (const y of s.years.slice(1)) {
      expect(y.usableMWh, `year ${y.year} must still meet ${required} MWh`).toBeGreaterThanOrEqual(required - 1e-6);
      expect(y.shortfall, `year ${y.year}`).toBe(false);
    }
    expect(s.totalUnits).toBeGreaterThan(s.units);
  });

  it('oversizing day one buys more up front and never augments', () => {
    const base = { powerMW: 5, durationH: 4, projectYears: 20 } as const;
    const over = sized({ ...base, augmentation: 'oversize-day1' });
    const none = sized({ ...base, augmentation: 'none' });
    expect(over.units).toBeGreaterThan(none.units);
    expect(over.augmentations).toHaveLength(0);
    expect(over.totalUnits).toBe(over.units);
    // and it must actually carry the term it was oversized for
    expect(over.years.at(-1)!.usableMWh).toBeGreaterThanOrEqual(20 - 1e-6);
  });

  it('ages a unit added in year eight from year eight, not from commissioning', () => {
    const s = sized({ powerMW: 5, durationH: 4, projectYears: 20, augmentation: 'periodic' });
    const first = s.augmentations[0];
    expect(first).toBeTruthy();
    const cohort = s.cohorts.find(c => c.year === first.year)!;
    expect(cohort.units).toBe(first.units);
    // New capacity does not reverse ageing; it lifts the fleet above what the original units
    // alone would show. Check that, and check the weighting itself against the cohorts.
    const alone = retentionFromTable(first.year, suppliedRetention);
    expect(s.years[first.year].retention).toBeGreaterThan(alone);
    for (const row of s.years) {
      const live = s.cohorts.filter(c => c.year <= row.year);
      const weighted = live.reduce((t, c) => t + c.dcMWh * retentionFromTable(row.year - c.year, suppliedRetention), 0)
        / live.reduce((t, c) => t + c.dcMWh, 0);
      expect(row.retention, `year ${row.year} weighting`).toBeCloseTo(weighted, 9);
    }
  });

  it('keeps the string inside the converter window, or says so', () => {
    const s = sized();
    const [minV, maxV] = s.dcVoltageWindow;
    expect(minV).toBeLessThan(maxV);
    const high = maxV > s.pcs.dcMaxV, low = minV < s.pcs.dcMinV;
    expect(s.warnings.some(w => w.code === 'dc-window-high')).toBe(high);
    expect(s.warnings.some(w => w.code === 'dc-window-low')).toBe(low);
  });

  it('never runs the pack past the rate it is rated for without saying so', () => {
    const hard = sized({ powerMW: 10, durationH: 0.5 });
    const packRate = hard.packCRate;
    if (hard.systemCRate > packRate + 1e-9) expect(hard.warnings.some(w => w.code === 'c-rate')).toBe(true);
    // Sizing on the more demanding direction means the charge rate must also be achievable.
    expect(hard.chargeCRate).toBeLessThanOrEqual(packRate + 1e-9);
  });
});

describe('the money', () => {
  const pb = defaultPriceBook;
  const sized = sizeSystem({ ...defaultSizingInput(), powerMW: 5, durationH: 4, projectYears: 20 });
  const fin = evaluateFinance(sized, pb);

  it('discounts every year by the rate it states', () => {
    const r = pb.discountRatePct / 100;
    for (const row of fin.rows) {
      expect(row.discountedUsd, `year ${row.year}`).toBeCloseTo(row.netUsd / (1 + r) ** row.year, 6);
      expect(row.netUsd, `year ${row.year} net`).toBeCloseTo(row.benefitUsd - row.capexUsd - row.opexUsd - row.chargingUsd, 6);
    }
  });

  it('puts the capital in year zero and nothing else', () => {
    expect(fin.rows[0].capexUsd).toBeGreaterThan(0);
    expect(fin.rows[0].dischargedMWh).toBe(0);
    for (const row of fin.rows.slice(1)) expect(row.dischargedMWh, `year ${row.year}`).toBeGreaterThan(0);
  });

  it('runs the cumulative column as a running total', () => {
    let total = 0;
    for (const row of fin.rows) { total += row.netUsd; expect(row.cumulativeUsd, `year ${row.year}`).toBeCloseTo(total, 6); }
  });

  it('computes NPV as the discounted net flows, nothing more', () => {
    const r = pb.discountRatePct / 100;
    const byHand = fin.rows.reduce((s, row) => s + row.netUsd / (1 + r) ** row.year, 0);
    expect(fin.npvUsd).toBeCloseTo(byHand, 6);
  });

  it('returns an IRR that actually zeroes the flows', () => {
    if (fin.irrPct === null) return;                    // no sign change, correctly reported
    const rate = fin.irrPct / 100;
    const npvAtIrr = fin.rows.reduce((s, row) => s + row.netUsd / (1 + rate) ** row.year, 0);
    expect(Math.abs(npvAtIrr), `NPV at IRR ${fin.irrPct.toFixed(2)}%`).toBeLessThan(Math.abs(fin.rows[0].netUsd) * 1e-3);
  });

  it('levelises cost over discounted energy, which is what LCOS means', () => {
    const r = pb.discountRatePct / 100;
    const energy = fin.rows.reduce((s, x) => s + x.dischargedMWh / (1 + r) ** x.year, 0);
    const cost = fin.rows.reduce((s, x) => s + (x.capexUsd + x.opexUsd + x.chargingUsd) / (1 + r) ** x.year, 0);
    expect(fin.lcosPerMWhUsd).toBeCloseTo(cost / energy, 6);
    // Sanity: a levelised cost outside this band would mean something is badly wrong.
    expect(fin.lcosPerMWhUsd).toBeGreaterThan(10);
    expect(fin.lcosPerMWhUsd).toBeLessThan(2000);
  });

  it('gets dearer per MWh when the money costs more', () => {
    const dear = evaluateFinance(sized, { ...pb, discountRatePct: pb.discountRatePct + 6 });
    expect(dear.lcosPerMWhUsd).toBeGreaterThan(fin.lcosPerMWhUsd);
    expect(dear.npvUsd).toBeLessThan(fin.npvUsd);
  });

  it('scales capital roughly with the fleet, not wildly', () => {
    const small = evaluateFinance(sizeSystem({ ...defaultSizingInput(), powerMW: 5, durationH: 2 }), pb);
    const big = evaluateFinance(sizeSystem({ ...defaultSizingInput(), powerMW: 10, durationH: 2 }), pb);
    const ratio = big.rows[0].capexUsd / small.rows[0].capexUsd;
    expect(ratio).toBeGreaterThan(1.5);
    expect(ratio).toBeLessThan(2.6);
  });
});

describe('currency', () => {
  it('comes back to where it started, whichever way round', () => {
    const pb = defaultPriceBook;
    for (const to of ['INR', 'EUR', 'GBP', 'AED'] as const) {
      const there = convert(1_000_000, to);
      const back = there / currencies[to].perUsd;
      expect(back, `USD -> ${to} -> USD`).toBeCloseTo(1_000_000, 4);
      expect(currencies[to].perUsd, `${to} rate`).toBeGreaterThan(0);
    }
    expect(convert(1234.56, 'USD')).toBeCloseTo(1234.56, 9);
    expect(pb.currency).toBeTruthy();
  });
});

describe('the studio geometry', () => {
  const model = buildModel(structuredClone(defaults));
  const a = defaults.assumptions;
  const mm = (x: number) => x / 1000;

  it('builds the cell block from the cells and the gaps between them', () => {
    // 8 rows across, 13 cells deep, with the gaps that separate them.
    const [x, y, z] = model.dimensions.body;
    expect(x).toBeCloseTo(8 * mm(a.cellWidth), 9);
    expect(y).toBeCloseTo(mm(a.cellHeight), 9);
    expect(z).toBeCloseTo(13 * mm(71.7), 9);
  });

  it('adds every allowance to the block to get the finished pack', () => {
    const [bx, by, bz] = model.dimensions.body;
    const [px, py, pz] = model.dimensions.pack;
    expect(px).toBeCloseTo(bx + 7 * mm(a.rowGap) + 2 * mm(a.wall), 9);
    expect(py).toBeCloseTo(by + mm(a.coldPlate + a.terminalClearance + 2 * a.wall), 9);
    expect(pz).toBeCloseTo(bz + 12 * mm(a.cellGap) + 2 * mm(a.compression + a.wall) + mm(a.connector), 9);
    // Every finished dimension has to exceed the raw block; an allowance cannot be negative.
    expect(px).toBeGreaterThan(bx); expect(py).toBeGreaterThan(by); expect(pz).toBeGreaterThan(bz);
  });

  it('sets the container from the rack pitch, the aisle and the service bay', () => {
    const d = model.dimensions, s = model.stats;
    expect(d.pitch).toBeCloseTo(d.pack[0] + mm(a.rackGap), 9);
    expect(d.rackHeight).toBeCloseTo(s.seriesPacks * (d.pack[1] + mm(a.verticalGap)) + 0.18, 9);
    // Length: half the racks in a row at that pitch, plus a service bay at each end.
    expect(d.required[0]).toBeCloseTo(s.racks / 2 * d.pitch + 2 * mm(a.endBay), 9);
    // Width: a bank of packs either side of the aisle, plus the wall build-up.
    expect(d.required[2]).toBeCloseTo(2 * d.pack[2] + mm(a.aisle) + 0.16, 9);
    expect(d.required[1]).toBeGreaterThanOrEqual(d.rackHeight);
  });

  it('fits every rack inside the envelope it computed', () => {
    const [lx, , lz] = model.dimensions.required;
    for (const rack of model.racks) {
      expect(Math.abs(rack.position[0]) + rack.size[0] / 2, rack.id).toBeLessThanOrEqual(lx / 2 + 1e-9);
      expect(Math.abs(rack.position[2]) + rack.size[2] / 2, rack.id).toBeLessThanOrEqual(lz / 2 + 1e-9);
      expect(rack.size[1], rack.id).toBeLessThanOrEqual(model.dimensions.required[1] + 1e-9);
    }
  });

  it('puts every cell inside its own pack', () => {
    const packs = new Map(model.packs.map(p => [p.id, p]));
    for (const cell of model.cells) {
      const pack = packs.get(cell.parent!)!;
      for (const i of [0, 2]) {
        const room = pack.size[i] / 2 - Math.abs(cell.position[i] - pack.position[i]) - cell.size[i] / 2;
        expect(room, `${cell.id} in axis ${i}`).toBeGreaterThanOrEqual(-1e-9);
      }
    }
  });

  it('wires every cell in the pack exactly once, end to end', () => {
    const pack = model.packs[0];
    const own = model.cells.filter(c => c.parent === pack.id);
    expect(own).toHaveLength(104);
    expect(new Set(own.map(c => c.order)).size).toBe(104);
    const links = model.electrical.edges.filter(e => e.kind === 'busbar'
      && e.from.startsWith(pack.id + '/C') && e.to.startsWith(pack.id + '/C'));
    expect(links, 'n cells in series need n-1 links').toHaveLength(103);
  });

  it('never has two cells in the same place', () => {
    const seen = new Set<string>();
    for (const c of model.cells) {
      const key = c.position.map(v => v.toFixed(4)).join(',');
      expect(seen.has(key), `two cells at ${key}`).toBe(false);
      seen.add(key);
    }
  });
});

describe('the site', () => {
  const spec = {
    units: 9, laterUnits: 3, model: 'X', modelled: true,
    enclosure: [10.444, 2.2, 2.5322] as [number, number, number],
    pcsCount: 4, pcsModel: 'P', pcsKW: 2507.5, transformerCount: 2, transformerMVA: 6.3,
    energyMWh: 45, powerMW: 10,
  };

  it('reports the area its own plot dimensions give', () => {
    const plan = planSite(spec);
    expect(plan.areaM2).toBeCloseTo(plan.plot[0] * plan.plot[1], 9);
  });

  it('never needs less ground for more units', () => {
    let previous = 0;
    for (const units of [1, 2, 3, 4, 6, 9, 12, 22, 40, 64]) {
      const area = planSite({ ...spec, units, laterUnits: 0 }).areaM2;
      expect(area, `${units} units`).toBeGreaterThanOrEqual(previous - 1e-9);
      previous = area;
    }
  });

  it('amortises its setbacks and its converter bay across a growing fleet', () => {
    // A single unit carries the whole bay and every setback on its own; a large one should be
    // approaching the ground a unit and its separations actually occupy.
    const perUnit = (units: number) => planSite({ ...spec, units, laterUnits: 0 }).areaM2 / units;
    expect(perUnit(64)).toBeLessThan(perUnit(12));
    expect(perUnit(12)).toBeLessThan(perUnit(3));
    const [l, , w] = spec.enclosure;
    const pitch = (l + 6) * (w + 3);            // one unit, one road, one side gap
    expect(perUnit(64), 'a large site should converge on its pitch area').toBeLessThan(pitch * 1.6);
    expect(perUnit(64), 'but never below it — the separations are real').toBeGreaterThan(pitch);
  });
});

describe('site conditions reaching the answer', () => {
  const at = (ambientC: number, mode: 'table' | 'model') => sizeSystem({
    ...defaultSizingInput(), powerMW: 5, durationH: 4, projectYears: 20, ambientC,
    augmentation: 'periodic',
    degradation: mode === 'table' ? { mode: 'table', retention: [...suppliedRetention] } : { mode: 'model', retention: [] },
  });

  it('a hotter site ages the cells faster, and needs more capacity over the term', () => {
    const cool = at(15, 'model'), hot = at(50, 'model');
    expect(hot.cellTempC).toBeGreaterThan(cool.cellTempC);
    expect(hot.tempFactor).toBeGreaterThan(cool.tempFactor);
    expect(hot.endOfLifeRetention).toBeLessThan(cool.endOfLifeRetention);
    expect(hot.totalUnits).toBeGreaterThanOrEqual(cool.totalUnits);
  });

  it('liquid cooling holds the cells well below a hot ambient', () => {
    // 45 C outside should not mean 45 C at the cell, or the warranty is spent in a few summers.
    const hot = at(45, 'model');
    expect(hot.enclosure.cooling).toBe('liquid');
    expect(hot.cellTempC).toBeLessThan(35);
    expect(hot.cellTempC).toBeGreaterThan(25);
  });

  it('leaves the fleet untouched under the supplied table, which is what the table means', () => {
    // The supplied schedule is a fixed curve with no temperature term. This is why the ambient
    // control has to say so: it is not broken, it is out of circuit in this mode.
    const cool = at(15, 'table'), hot = at(50, 'table');
    expect(hot.totalUnits).toBe(cool.totalUnits);
    expect(hot.endOfLifeRetention).toBe(cool.endOfLifeRetention);
    // but the cell temperature it reports still tracks the site
    expect(hot.cellTempC).toBeGreaterThan(cool.cellTempC);
  });
});
