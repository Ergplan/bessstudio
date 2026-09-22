import { describe, expect, it } from 'vitest';
import { defaultSizingInput, sizeSystem, normaliseSizingInput, defaultLossChain, type SizingInput } from '../sizing/engine';
import { evaluateFinance } from '../sizing/finance';
import { defaultPriceBook } from '../catalog/pricing';
import { buildQuoteLines, quoteTotals } from '../quoting/quote';
import { enclosures, pcsUnits, transformers } from '../catalog/products';
import { applications } from '../sizing/applications';

/**
 * The edges.
 *
 * A sizing engine is easy to get right in the middle of its range. What decides whether somebody
 * trusts it is what it does when a salesperson drags a slider to the end, types a zero, or picks
 * the smallest product in the catalogue for the largest plant.
 */

const finite = (label: string, n: number) => {
  expect(Number.isFinite(n), `${label} is ${n}`).toBe(true);
  expect(Number.isNaN(n), `${label} is NaN`).toBe(false);
};

const soundResult = (s: ReturnType<typeof sizeSystem>, where: string) => {
  finite(`${where} units`, s.units);
  expect(s.units, `${where} units`).toBeGreaterThanOrEqual(1);
  expect(Number.isInteger(s.units), `${where} units must be whole`).toBe(true);
  expect(Number.isInteger(s.pcsCount), `${where} converters must be whole`).toBe(true);
  finite(`${where} installed`, s.installedDcMWh);
  expect(s.installedDcMWh, `${where} installed`).toBeGreaterThan(0);
  finite(`${where} rte`, s.rteAc);
  expect(s.rteAc, `${where} rte`).toBeGreaterThan(0);
  expect(s.rteAc, `${where} rte`).toBeLessThan(1);
  for (const y of s.years) {
    for (const [k, v] of Object.entries(y)) if (typeof v === 'number') finite(`${where} year ${y.year} ${k}`, v);
    expect(y.usableMWh, `${where} year ${y.year} usable`).toBeGreaterThanOrEqual(0);
    expect(y.chargeMWh, `${where} year ${y.year} charge`).toBeGreaterThanOrEqual(0);
    expect(y.retention, `${where} year ${y.year} retention`).toBeGreaterThan(0);
  }
  for (const w of s.warnings) expect(w.text, `${where} warning ${w.code}`).not.toMatch(/undefined|NaN|Infinity/);
};

describe('the ends of every slider', () => {
  const at = (over: Partial<SizingInput>, where: string) => {
    const s = sizeSystem({ ...defaultSizingInput(), ...over });
    soundResult(s, where);
    return s;
  };

  it('survives the smallest plant anybody could ask for', () => {
    const s = at({ powerMW: 0.001, durationH: 0.25 }, '1 kW × 15 min');
    expect(s.units).toBe(1);
  });

  it('survives a plant far larger than the catalogue was drawn for', () => {
    const s = at({ powerMW: 2000, durationH: 8 }, '2 GW × 8 h');
    expect(s.units).toBeGreaterThan(100);
    expect(s.pcsCount).toBeGreaterThan(100);
  });

  it('holds at both ends of depth of discharge', () => {
    const shallow = at({ dod: 0.05 }, '5% DoD'), deep = at({ dod: 1 }, '100% DoD');
    expect(shallow.units).toBeGreaterThan(deep.units);
    expect(deep.warnings.some(w => w.code === 'dod'), 'a full-depth cycle has to be flagged').toBe(true);
  });

  it('holds at both ends of the duty cycle', () => {
    at({ cyclesPerDay: 0.1, daysPerYear: 30 }, 'barely used');
    const hard = at({ cyclesPerDay: 6, daysPerYear: 366 }, 'run into the ground');
    expect(hard.efcPerYear).toBeGreaterThan(1000);
  });

  it('holds at both ends of the term', () => {
    at({ projectYears: 1 }, 'one year');
    const long = at({ projectYears: 40, augmentation: 'periodic' }, 'forty years');
    expect(long.years).toHaveLength(41);
    expect(long.endOfLifeRetention).toBeGreaterThan(0.2);
  });

  it('holds at both ends of the climate', () => {
    at({ ambientC: -20, degradation: { mode: 'model', retention: [] } }, 'arctic');
    const hot = at({ ambientC: 58, degradation: { mode: 'model', retention: [] } }, 'desert');
    expect(hot.warnings.some(w => w.code === 'ambient-high')).toBe(true);
  });

  it('holds when the charge window is almost nothing', () => {
    const s = at({ chargeDurationH: 0.01 }, 'instant charge');
    expect(s.units).toBeGreaterThan(1);
  });

  it('refuses to divide by a zero anybody could type', () => {
    for (const [field, value] of [
      ['powerMW', 0], ['durationH', 0], ['usableEnergyMWh', 0], ['chargeDurationH', 0],
      ['cyclesPerDay', 0], ['daysPerYear', 0], ['dod', 0], ['availability', 0], ['projectYears', 0],
      ['powerFactor', 0], ['gridKV', 0], ['altitudeM', 0],
    ] as const) {
      soundResult(sizeSystem({ ...defaultSizingInput(), [field]: value } as SizingInput), `${field}=0`);
    }
  });

  it('refuses a negative anybody could paste', () => {
    for (const field of ['powerMW', 'durationH', 'chargeDurationH', 'cyclesPerDay', 'daysPerYear', 'dod', 'projectYears'] as const) {
      soundResult(sizeSystem({ ...defaultSizingInput(), [field]: -5 } as SizingInput), `${field}=-5`);
    }
  });

  it('survives a loss chain set to nonsense', () => {
    for (const losses of [
      { ...defaultLossChain(), usableDcWindow: 0, chargeEfficiencyDc: 0, dischargeEfficiencyDc: 0 },
      { ...defaultLossChain(), dcCableLoss: 1, pcsLoss: 1, acCableLoss: 1, idtLoss: 1 },
      { ...defaultLossChain(), availabilityFactor: 0, auxScale: 0 },
      { ...defaultLossChain(), auxScale: 100 },
    ]) soundResult(sizeSystem({ ...defaultSizingInput(), losses }), 'loss chain');
  });

  it('survives a degradation table somebody emptied or inverted', () => {
    for (const retention of [[], [1], [0.2, 0.2, 0.2], [1, 2, 3], [1, 0]]) {
      soundResult(sizeSystem({ ...defaultSizingInput(), degradation: { mode: 'table', retention } }), `table ${retention.join()}`);
    }
  });
});

describe('every combination the catalogue allows', () => {
  it('sizes, prices and quotes without producing a single bad number', () => {
    for (const enclosure of enclosures) for (const pcs of pcsUnits) {
      const s = sizeSystem({ ...defaultSizingInput(), powerMW: 2, durationH: 2, enclosureId: enclosure.id, pcsId: pcs.id });
      const where = `${enclosure.model} + ${pcs.model}`;
      soundResult(s, where);
      const fin = evaluateFinance(s, defaultPriceBook);
      finite(`${where} capex`, fin.capexUsd);
      finite(`${where} lcos`, fin.lcosPerMWhUsd);
      expect(fin.capexUsd, `${where} capex`).toBeGreaterThan(0);
      const lines = buildQuoteLines(s, fin, 'INR', defaultPriceBook);
      for (const l of lines) {
        finite(`${where} ${l.id} rate`, l.unitPrice);
        expect(l.total, `${where} ${l.id} multiplies out`).toBeCloseTo(l.quantity * l.unitPrice, 6);
      }
      expect(quoteTotals(lines, 0, 0, 0).subtotal, `${where} subtotal`).toBeGreaterThan(0);
    }
  });

  it('works with every transformer, and with none at all', () => {
    for (const transformerId of [...transformers.map(t => t.id), null]) {
      const s = sizeSystem({ ...defaultSizingInput(), transformerId });
      soundResult(s, `transformer ${transformerId ?? 'none'}`);
      expect(s.transformerCount, `${transformerId ?? 'none'}`).toBe(transformerId ? s.transformerCount : 0);
    }
  });

  it('works for every application preset', () => {
    for (const app of applications) {
      const s = sizeSystem(defaultSizingInput(app.id));
      soundResult(s, app.name);
      const fin = evaluateFinance(s, defaultPriceBook);
      finite(`${app.name} npv`, fin.npvUsd);
      if (fin.irrPct !== null) finite(`${app.name} irr`, fin.irrPct);
      if (fin.paybackYears !== null) finite(`${app.name} payback`, fin.paybackYears);
    }
  });
});

describe('normalising what a person typed', () => {
  it('pulls every field back into a range the model can use', () => {
    const wild = normaliseSizingInput({
      ...defaultSizingInput(), powerMW: -1, durationH: 0, chargeDurationH: -3, cyclesPerDay: -2,
      daysPerYear: 9999, dod: 5, availability: -1, projectYears: 500, ambientC: 999, altitudeM: -100,
      powerFactor: 9, gridKV: -4,
    } as SizingInput);
    for (const [k, v] of Object.entries(wild)) if (typeof v === 'number') finite(k, v);
    expect(wild.dod).toBeLessThanOrEqual(1);
    expect(wild.dod).toBeGreaterThan(0);
    expect(wild.availability).toBeGreaterThan(0);
    expect(wild.daysPerYear).toBeLessThanOrEqual(366);
    expect(wild.powerFactor).toBeLessThanOrEqual(1);
    expect(wild.projectYears).toBeGreaterThan(0);
  });
});
