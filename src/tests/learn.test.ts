import { describe, expect, it } from 'vitest';
import { buildModel } from '../domain/model';
import { defaults } from '../config/schema';
import { lessonFor, remedyFor } from '../domain/learn';
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
