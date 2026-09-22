import type { Vec } from '../domain/model';
import type { Measure } from '../state/store';
import type { Primitive } from '../geometry/primitives';

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

/** The points a routed run offers: its two ends and its middle. */
export function snapPoints(p: Primitive): Vec[] {
  // A routed run is a cylinder laid along its path: its ends and its middle are the points
  // somebody means, and its axis-aligned box is meaningless.
  const axis = rotate([0, 1, 0], p.rotation);
  const half: Vec = [axis[0] * p.size[1] / 2, axis[1] * p.size[1] / 2, axis[2] * p.size[1] / 2];
  return [p.position, add(p.position, half), add(p.position, [-half[0], -half[1], -half[2]])];
}

/**
 * Snapping a picked point onto the component it landed on.
 *
 * A click on a face lands wherever the pointer happened to be, so two people measuring the same
 * clearance get two different numbers and neither can be repeated.
 *
 * Boxes snap one axis at a time. An axis thinner than the tolerance snaps to its centre-line,
 * since both its faces are within a hair of it and only the centre-line comes back the same
 * whichever face was clicked; a thicker one offers its two faces and its middle. A rack post is
 * 34 mm across and 1.7 m tall, so a click anywhere on it lands exactly on its centre-line in X and
 * Z while staying where it was put in Y — which makes post-to-post spacing exact and still lets a
 * long face be measured from anywhere along it. Routed runs snap whole, to an end or the middle.
 */
export function snap(at: Vec, p: Primitive | undefined, tolerance: number): Vec {
  if (!p || tolerance <= 0) return at;

  if (p.shape === 'cylinder') {
    let best = at, gap = tolerance;
    for (const candidate of snapPoints(p)) {
      const d = Math.hypot(candidate[0] - at[0], candidate[1] - at[1], candidate[2] - at[2]);
      if (d < gap) { gap = d; best = candidate; }
    }
    return best;
  }

  return at.map((v, i) => {
    const centre = p.position[i], half = p.size[i] / 2;
    // Thinner than the tolerance: both faces are within a hair of the centre-line, and the
    // centre-line is the answer that comes back the same whichever face was clicked.
    if (p.size[i] <= tolerance) return centre;
    let best = v, gap = tolerance;
    for (const candidate of [centre - half, centre, centre + half]) {
      const d = Math.abs(candidate - v);
      if (d < gap) { gap = d; best = candidate; }
    }
    return best;
  }) as Vec;
}

const add = (a: Vec, b: Vec): Vec => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

/** Apply a primitive's quaternion to a direction, without pulling three.js into the arithmetic. */
function rotate(v: Vec, q?: [number, number, number, number]): Vec {
  if (!q) return v;
  const [x, y, z, w] = q;
  const ix = w * v[0] + y * v[2] - z * v[1];
  const iy = w * v[1] + z * v[0] - x * v[2];
  const iz = w * v[2] + x * v[1] - y * v[0];
  const iw = -x * v[0] - y * v[1] - z * v[2];
  return [
    ix * w + iw * -x + iy * -z - iz * -y,
    iy * w + iw * -y + iz * -x - ix * -z,
    iz * w + iw * -z + ix * -y - iy * -x,
  ];
}
