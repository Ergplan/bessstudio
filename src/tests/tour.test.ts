import { describe, expect, it } from 'vitest';
import { buildModel } from '../domain/model';
import { defaults } from '../config/schema';
import { walkSteps } from '../domain/tour';

const model = buildModel(structuredClone(defaults));

describe('the guided walk', () => {
  it('walks down the assembly and back out', () => {
    const steps = walkSteps(model);
    expect(steps.map(s => s.id)).toEqual(['container', 'banks', 'string', 'pack', 'cell', 'path']);
    steps.forEach((step, i) => {
      expect(step.eyebrow, step.id).toBe(`Step ${i + 1} of ${steps.length}`);
      expect(step.body.length, step.id).toBeGreaterThan(80);
      expect(step.body, step.id).not.toMatch(/undefined|NaN/);
      expect(model.nodes.some(n => n.id === step.target), `${step.id} targets a node that exists`).toBe(true);
    });
  });

  it('never narrates conductors while the view hides them', () => {
    // Routing is dropped from the scene whenever the assembly is exploded, so a step that talks
    // about busbars or the electrical path has to leave the model together.
    for (const step of walkSteps(model)) {
      if (/busbar|link|conductor|combiner|terminal/i.test(step.body)) expect(step.explode, step.id).toBe(0);
    }
  });

  it('reads the design rather than repeating fixed copy', () => {
    const alt = walkSteps(buildModel({ ...structuredClone(defaults), preset: 'alternative' }));
    const ref = walkSteps(model);
    expect(alt.find(s => s.id === 'string')!.body).not.toBe(ref.find(s => s.id === 'string')!.body);
  });
});
