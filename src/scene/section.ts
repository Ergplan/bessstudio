import type { Vec } from '../domain/model';

/** Where the section plane stands, in the units of whatever is on screen. */
export type Cut = { axis: 0 | 1 | 2; at: number } | null;

/**
 * Whether a component is on the near side of the cut.
 *
 * The plane clips geometry in the renderer, but labels are DOM and have to be filtered by the same
 * rule or a rack that is no longer drawn keeps its name floating in space. Node positions are not
 * consistent — a rack and a pack sit on their base, a cell on its centre — so the test is made
 * against the point the eye judges the component by.
 */
export const keeps = (cut: Cut) => (n: { position: Vec; size: Vec; kind?: string }): boolean => {
  if (!cut) return true;
  const centre = [n.position[0], n.kind === 'cell' ? n.position[1] : n.position[1] + n.size[1] / 2, n.position[2]];
  return centre[cut.axis] <= cut.at;
};
