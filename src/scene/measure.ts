import type { Vec } from '../domain/model';
import type { Measure } from '../state/store';

/**
 * Taking a measurement off the model.
 *
 * The dimension layer measures the bounds of whatever is in view, which answers "how big is this"
 * and not "how far is that from that". Two picked points answer the second, and the axis
 * components matter as much as the distance — an installer wants to know the clearance in one
 * direction, not the diagonal.
 */
export type Span = { distance: number; delta: Vec };

export const spanOf = (a: Vec, b: Vec): Span => ({
  distance: Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]),
  delta: [Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]), Math.abs(b[2] - a[2])],
});

/** Millimetres for anything you could hold, metres once a container is in it. */
export const say = (m: number): string =>
  m >= 5 ? `${m.toFixed(m < 10 ? 2 : 1)} m` : `${(m * 1000).toFixed(m < 0.3 ? 1 : 0)} mm`;

/**
 * What the next pick does. The first click sets the start, the second the end, and a third begins
 * again — so a run of measurements needs no clearing between them.
 */
export const pick = (m: Measure, at: Vec): Measure =>
  !m.a || m.b ? { ...m, a: at, b: null } : { ...m, b: at };
