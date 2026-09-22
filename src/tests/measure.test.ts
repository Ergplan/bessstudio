import { describe, expect, it } from 'vitest';
import { pick, say, snap, snapPoints, spanOf } from '../scene/measure';
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

describe('snapping a pick onto the component it landed on', () => {
  const box = (position: [number, number, number], size: [number, number, number]) =>
    ({ id: 'x#1', owner: 'x', shape: 'box' as const, position, size, color: '#fff', category: 'structure' as const });

  it('always catches the centre-line of something thin, wherever along it you click', () => {
    // A rack post is 34 mm across and 1.7 m tall. Two people measuring post-to-post spacing must
    // get the same number, whatever height each of them happened to click at.
    const post = box([2.5, 0.85, -1.2], [0.034, 1.7, 0.034]);
    const low = snap([2.507, 0.30, -1.19], post, 0.25);
    const high = snap([2.494, 1.41, -1.21], post, 0.25);
    expect(low[0]).toBe(2.5); expect(low[2]).toBe(-1.2);
    expect(high[0]).toBe(2.5); expect(high[2]).toBe(-1.2);
    // and the long axis is left where it was put, so a face can still be measured along its length
    expect(low[1]).toBe(0.30);
    expect(high[1]).toBe(1.41);
  });

  it('makes the spacing between two posts exact', () => {
    const a = box([0, 0.85, 0], [0.034, 1.7, 0.034]);
    const b = box([1.2, 0.85, 0], [0.034, 1.7, 0.034]);
    const first = spanOf(snap([0.01, 0.4, 0.005], a, 0.25), snap([1.19, 0.45, -0.01], b, 0.25));
    const again = spanOf(snap([-0.012, 1.3, -0.008], a, 0.25), snap([1.21, 1.28, 0.012], b, 0.25));
    expect(first.delta[0]).toBeCloseTo(1.2, 9);
    expect(again.delta[0]).toBeCloseTo(1.2, 9);
    expect(first.delta[2]).toBe(0);
    expect(again.delta[2]).toBe(0);
  });

  it('snaps a long face only near its ends or its middle', () => {
    // Otherwise a wall could not be measured from an arbitrary point on it, which is the whole
    // reason somebody clicks a wall.
    const wall = box([0, 0, 0], [10, 3, 0.04]);
    expect(snap([4.97, 0, 0], wall, 0.25)[0]).toBe(5);        // near the end
    expect(snap([0.06, 0, 0], wall, 0.25)[0]).toBe(0);        // near the middle
    expect(snap([2.4, 0, 0], wall, 0.25)[0]).toBe(2.4);       // nowhere near either
    expect(snap([2.4, 0, 0.019], wall, 0.25)[2]).toBe(0);     // but its 40 mm thickness snaps
  });

  it('leaves a point alone when there is nothing to snap to', () => {
    const b = box([0, 0, 0], [10, 10, 10]);
    const at: [number, number, number] = [1.3, -2.4, 3.1];
    expect(snap(at, undefined, 0.25)).toEqual(at);
    expect(snap(at, b, 0)).toEqual(at);
  });

  it('snaps a routed run to its ends and its middle, along the way it was laid', () => {
    // A cylinder is drawn along +Y and rotated onto its run, so its ends are not axis-aligned.
    const turn = Math.SQRT1_2;   // 90 degrees about Z: +Y becomes +X
    const run = { ...box([0, 0, 0], [0.01, 4, 0.01]), shape: 'cylinder' as const,
      rotation: [0, 0, -turn, turn] as [number, number, number, number] };
    const points = snapPoints(run);
    expect(points).toHaveLength(3);
    expect(points.map(p => Number(p[0].toFixed(6))).sort((a, b) => a - b)).toEqual([-2, 0, 2]);
    for (const p of points) { expect(p[1]).toBeCloseTo(0, 6); expect(p[2]).toBeCloseTo(0, 6); }
    expect(snap([1.98, 0.02, 0], run, 0.25)[0]).toBeCloseTo(2, 6);
  });
});
