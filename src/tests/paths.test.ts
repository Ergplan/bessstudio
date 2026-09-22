import { describe, expect, it } from 'vitest';
import { defaults } from '../config/schema';
import { buildModel } from '../domain/model';
import { pathModeOf, primitives } from '../geometry/primitives';

const cfg = (over: Partial<typeof defaults>) => ({ ...structuredClone(defaults), ...over });
const LIT = '#c6ed5a';

describe('tracing a path through the assembly', () => {
  it('reads the requested path back from the layers that are on', () => {
    expect(pathModeOf(cfg({ highlight: false }))).toBe('none');
    expect(pathModeOf(cfg({ highlight: true, visibility: { ...defaults.visibility, hv: true, busbars: true, coolant: false } }))).toBe('electrical');
    expect(pathModeOf(cfg({ highlight: true, visibility: { ...defaults.visibility, hv: false, busbars: false, coolant: true } }))).toBe('cooling');
  });

  it('lights the electrical path without lighting the coolant with it', () => {
    // The stored flag tinted every route belonging to the rack, so asking for the electrical path
    // lit the pipes and the BMS wiring too.
    const model = buildModel(cfg({ highlight: true, visibility: { ...defaults.visibility, hv: true, busbars: true, coolant: true } }));
    const drawn = primitives(model, 'BESS');
    const lit = drawn.filter(p => p.color === LIT);
    expect(lit.length).toBeGreaterThan(0);
    expect(lit.some(p => p.category === 'coolant'), 'a coolant run was lit by the electrical trace').toBe(false);
    expect(lit.some(p => p.category === 'hv' || p.category === 'busbars')).toBe(true);
  });

  it('lights the cooling path without lighting the conductors with it', () => {
    const model = buildModel(cfg({ highlight: true, visibility: { ...defaults.visibility, hv: false, busbars: false, coolant: true } }));
    const lit = primitives(model, 'BESS').filter(p => p.color === LIT);
    expect(lit.length).toBeGreaterThan(0);
    expect(lit.every(p => p.category === 'coolant')).toBe(true);
  });

  it('leaves everything in its own colour when no path is traced', () => {
    const model = buildModel(cfg({ highlight: false }));
    expect(primitives(model, 'BESS').some(p => p.color === LIT)).toBe(false);
  });
});

describe('what each trace follows', () => {
  const lit = (over: Partial<typeof defaults>) =>
    primitives(buildModel(cfg(over)), 'BESS').filter(p => p.color === LIT);

  it('follows one string for the electrical path and the whole loop for the cooling one', () => {
    // A string is a series path, so tracing it means tracing one rack. A coolant loop is one
    // circuit through every rack in the container, so tracing it means tracing all of them.
    const owners = (ps: { owner: string }[]) => new Set(ps.map(p => p.owner.split('/')[0]));
    const electrical = owners(lit({ highlight: true, visibility: { ...defaults.visibility, hv: true, busbars: true, coolant: false } }));
    const cooling = owners(lit({ highlight: true, visibility: { ...defaults.visibility, hv: false, busbars: false, coolant: true } }));
    expect([...electrical].every(o => o === 'R01' || o === 'EARTH' || o === 'SYSTEM-BMS')).toBe(true);
    expect(cooling.size).toBeGreaterThan(electrical.size);
  });

  it('draws a traced run thicker than the same run untraced', () => {
    const on = lit({ highlight: true, visibility: { ...defaults.visibility, hv: false, busbars: false, coolant: true } })[0];
    const off = primitives(buildModel(cfg({ highlight: false })), 'BESS')
      .find(p => p.category === 'coolant' && p.id === on.id)!;
    expect(on.size[0]).toBeGreaterThan(off.size[0]);
  });
});
