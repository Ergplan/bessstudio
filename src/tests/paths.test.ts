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

describe('the section plane', () => {
  it('keeps what is on the near side of the cut and drops the rest', async () => {
    // The plane clips geometry in the renderer, but labels are DOM and have to be filtered by the
    // same rule, or a rack that is no longer drawn keeps its name floating in space.
    const { keeps } = await import('../scene/section');
    const model = buildModel(cfg({}));
    const racks = model.racks.map(r => ({ position: r.position, size: r.size, kind: r.kind }));
    const xs = racks.map(r => r.position[0]);
    const mid = (Math.min(...xs) + Math.max(...xs)) / 2;
    const near = racks.filter(keeps({ axis: 0, at: mid }));
    expect(near.length).toBeGreaterThan(0);
    expect(near.length).toBeLessThan(racks.length);
    expect(near.every(r => r.position[0] <= mid)).toBe(true);
    expect(racks.filter(keeps(null))).toHaveLength(racks.length);
  });

  it('measures a rack from its base and a cell from its middle', () => {
    // Node positions are not consistent: a rack and a pack sit on their base, a cell on its centre.
    // A cut in Y has to use the same point the eye judges the component by.
    return import('../scene/section').then(({ keeps }) => {
      const rack = { position: [0, 0, 0] as [number, number, number], size: [1, 2, 1] as [number, number, number], kind: 'rack' };
      const cell = { position: [0, 1, 0] as [number, number, number], size: [1, 2, 1] as [number, number, number], kind: 'cell' };
      expect(keeps({ axis: 1, at: 1.5 })(rack)).toBe(true);    // centre at 1.0
      expect(keeps({ axis: 1, at: 0.5 })(rack)).toBe(false);
      expect(keeps({ axis: 1, at: 1.5 })(cell)).toBe(true);    // centre at 1.0
      expect(keeps({ axis: 1, at: 0.5 })(cell)).toBe(false);
    });
  });
});
