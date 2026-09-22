import { describe, expect, it } from 'vitest';
import { buildModel } from '../domain/model';
import { defaults } from '../config/schema';
import { findIn } from '../domain/find';
import { planSite } from '../geometry/site';

const model = buildModel(structuredClone(defaults));
const find = (q: string, plan = null) => findIn(model, q, plan);

describe('finding a component by name', () => {
  it('lands exactly on a full identifier instead of offering near-misses', () => {
    const id = model.cells[41].id;
    expect(find(id).map(h => h.id)).toEqual([id]);
    expect(find('R01').map(h => h.id)).toEqual(['R01']);
  });

  it('is case-insensitive and tolerant of a leading fragment', () => {
    expect(find('r01')[0].id).toBe('R01');
    expect(find('R0').some(h => h.id === 'R07')).toBe(true);
  });

  it('reads a bare number the way a schedule does', () => {
    // Somebody reading a component schedule has "42", not "R01/P01/C042".
    const hits = find('42');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every(h => /042|42/.test(h.id))).toBe(true);
    expect(hits.some(h => h.id.endsWith('C042'))).toBe(true);
  });

  it('says where each hit sits, and what it is', () => {
    const cell = find(model.cells[13].id)[0];
    expect(cell.kind).toBe('Cell');
    expect(cell.where).toContain('row');
    expect(find('DC-COMBINER')[0].kind).toBe('Ancillary');
  });

  it('offers the site units when there is a site', () => {
    const plan = planSite({
      units: 4, laterUnits: 1, model: 'X', enclosure: model.dimensions.enclosure, modelled: true,
      pcsCount: 2, pcsModel: 'P', pcsKW: 1, transformerCount: 1, transformerMVA: 1, energyMWh: 20, powerMW: 5,
    });
    expect(findIn(model, 'UNIT-03', plan).map(h => h.id)).toEqual(['UNIT-03']);
    expect(findIn(model, 'RESERVED', plan)[0].kind).toBe('Reserved pad');
  });

  it('returns nothing for an empty query, and caps a broad one', () => {
    expect(find('')).toEqual([]);
    expect(find('   ')).toEqual([]);
    expect(find('C').length).toBeLessThanOrEqual(40);
  });
});
