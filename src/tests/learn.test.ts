import { describe, expect, it } from 'vitest';
import { buildModel } from '../domain/model';
import { defaults } from '../config/schema';
import { lessonFor, remedyFor } from '../domain/learn';
import { walkSteps } from '../domain/tour';
import { AGEING_DOUBLING_K, temperatureFactor } from '../sizing/engine';
import { readFileSync } from 'node:fs';

const model = buildModel(structuredClone(defaults));

describe('the studio learning layer', () => {
  it('explains every level of the assembly', () => {
    const ids = ['BESS', model.racks[0].id, model.packs[0].id, model.cells[0].id, 'DC-COMBINER', 'CHILLER', 'SYSTEM-BMS'];
    for (const id of ids) {
      const lesson = lessonFor(model, id);
      expect(lesson.title, id).toBeTruthy();
      expect(lesson.what.length, id).toBeGreaterThan(80);
      expect(lesson.why.length, id).toBeGreaterThan(0);
      expect(lesson.numbers.length, id).toBeGreaterThan(0);
      for (const [label, value] of lesson.numbers) expect(value, `${id} ${label}`).not.toMatch(/undefined|NaN/);
    }
  });

  it('reads the live design rather than repeating prose', () => {
    const shallower = buildModel({ ...structuredClone(defaults), preset: 'alternative' });
    const a = lessonFor(model, model.racks[0].id), b = lessonFor(shallower, shallower.racks[0].id);
    expect(a.subtitle).not.toBe(b.subtitle);
    expect(a.numbers.find(n => n[0] === 'String voltage')![1])
      .not.toBe(b.numbers.find(n => n[0] === 'String voltage')![1]);
  });

  it('names the cell by its electrical position, not its physical one', () => {
    // The serpentine means the two differ for most cells; the lesson has to say which is which.
    const serpentine = model.cells.find(c => c.row === 1)!;
    const lesson = lessonFor(model, serpentine.id);
    expect(lesson.consequence).toContain(String(serpentine.order! + 1));
    expect(lesson.consequence).toContain(`column ${serpentine.column! + 1}`);
  });

  it('explains every finding the model can raise', () => {
    // A finding with no explanation is a dead end for the reader, so the codes in the model and the
    // codes in the learning layer are kept in step by reading them out of the source.
    const source = readFileSync(new URL('../domain/model.ts', import.meta.url), 'utf8');
    const codes = [...source.matchAll(/code:\s*['"`]([^'"`]+)['"`]\s*,\s*level/g)].map(m => m[1]);
    expect(codes.length).toBeGreaterThan(10);
    for (const code of codes) {
      const resolved = code.includes('${') ? 'fit-length' : code;
      expect(remedyFor(resolved), `no explanation for "${resolved}"`).toBeTruthy();
    }
  });
});

describe('the mechanical assumptions', () => {
  it('explains every one the studio offers', async () => {
    // The Configure tab lists them from the schema; an assumption with no explanation is a number
    // in millimetres that nobody can act on.
    const { assumptionsSchema } = await import('../config/schema');
    const { assumptionNotes } = await import('../domain/learn');
    const keys = Object.keys(assumptionsSchema.shape)
      .filter(k => !['manual', 'length', 'width', 'height'].includes(k));   // the manual envelope, not assumptions
    expect(keys.length).toBeGreaterThan(10);
    for (const key of keys) expect(assumptionNotes[key], `no note for "${key}"`).toBeTruthy();
    for (const key of Object.keys(assumptionNotes)) expect(keys, `stale note for "${key}"`).toContain(key);
  });
});

describe('the equipment and usable-AC inputs', () => {
  it('explains every one the studio offers', async () => {
    const { configSchema } = await import('../config/schema');
    const { equipmentNotes, usableNotes } = await import('../domain/learn');
    const shape = configSchema.shape;
    for (const [group, notes] of [['equipment', equipmentNotes], ['usable', usableNotes]] as const) {
      const keys = Object.keys((shape[group] as unknown as { shape: Record<string, unknown> }).shape);
      for (const key of keys) expect(notes[key], `no note for ${group}.${key}`).toBeTruthy();
      for (const key of Object.keys(notes)) expect(keys, `stale note for ${group}.${key}`).toContain(key);
    }
  });
});

describe('the studio narrates the model it sits beside', () => {
  /**
   * The rule of thumb everybody quotes for cell ageing is ten degrees; the model uses twelve. The
   * lessons and the walk quoted the rule of thumb, so the prose and the arithmetic disagreed on
   * the same screen. Both now read the model's own constant.
   */
  it('quotes the ageing constant the engine actually uses', () => {
    const model = buildModel(structuredClone(defaults));
    const prose = [
      ...walkSteps(model).map(s => s.body),
      ...['BESS', model.packs[0].id, model.cells[0].id, 'CHILLER'].flatMap(id => {
        const l = lessonFor(model, id);
        return [l.what, ...l.why, l.consequence];
      }),
    ].join(' ');
    expect(prose, 'somewhere the doubling is narrated').toMatch(new RegExp(`${AGEING_DOUBLING_K} °C`));
    // And nowhere is a different figure claimed for the same thing.
    for (const wrong of [8, 9, 10, 11, 13, 15, 20]) {
      if (wrong === AGEING_DOUBLING_K) continue;
      expect(prose, `claims doubling every ${wrong} °C`).not.toMatch(new RegExp(`(doubl|twice as fast)[^.]{0,60}${wrong} °C`));
    }
  });

  it('doubles the ageing factor over that many degrees', () => {
    expect(temperatureFactor(25 + AGEING_DOUBLING_K) / temperatureFactor(25)).toBeCloseTo(2, 9);
    expect(temperatureFactor(25 - AGEING_DOUBLING_K) / temperatureFactor(25)).toBeCloseTo(0.5, 9);
  });
});
