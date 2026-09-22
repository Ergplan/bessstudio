import { describe, expect, it } from 'vitest';
import { pick, say, spanOf } from '../scene/measure';
import type { Measure } from '../state/store';

const empty: Measure = { on: true, a: null, b: null };

describe('taking a measurement off the model', () => {
  it('gives the distance and the axis components', () => {
    // The diagonal is not what an installer wants; the clearance in one direction is.
    const span = spanOf([0, 0, 0], [3, 4, 0]);
    expect(span.distance).toBeCloseTo(5, 9);
    expect(span.delta).toEqual([3, 4, 0]);
    expect(spanOf([1, 2, 3], [1, 2, 3]).distance).toBe(0);
  });

  it('is symmetric, whichever point was picked first', () => {
    const a: [number, number, number] = [-1.5, 0.25, 4], b: [number, number, number] = [2, -3, 0.5];
    expect(spanOf(a, b)).toEqual(spanOf(b, a));
  });

  it('starts again on the third click, so a run of measurements needs no clearing', () => {
    const one = pick(empty, [1, 0, 0]);
    expect([one.a, one.b]).toEqual([[1, 0, 0], null]);
    const two = pick(one, [2, 0, 0]);
    expect([two.a, two.b]).toEqual([[1, 0, 0], [2, 0, 0]]);
    const three = pick(two, [9, 0, 0]);
    expect([three.a, three.b]).toEqual([[9, 0, 0], null]);
  });

  it('reads in the units of what is being measured', () => {
    expect(say(0.0717)).toBe('71.7 mm');     // a cell
    expect(say(0.85)).toBe('850 mm');        // an aisle
    expect(say(11.32)).toBe('11.3 m');       // a container
    expect(say(49.03)).toBe('49.0 m');       // a plot
  });
});
