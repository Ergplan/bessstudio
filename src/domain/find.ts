import type { Model, Node } from './model';
import type { SitePlan } from '../geometry/site';

/**
 * Finding a component by name.
 *
 * A container holds 4,992 cells and the explorer only goes down to packs, so reaching one meant
 * clicking a rack, clicking a pack, then hunting a numbered button in a grid of a hundred. Typing
 * what you are looking for is faster, and a query that is already an identifier should land on it
 * exactly rather than offer it among forty near-misses.
 */
export type Hit = { id: string; kind: string; where: string };

const label: Record<string, string> = {
  container: 'Container', rack: 'String', pack: 'Pack', cell: 'Cell', ancillary: 'Ancillary',
};

/** Everything a query could name, at the scale it belongs to. */
export function findIn(model: Model, query: string, plan: SitePlan | null, limit = 40): Hit[] {
  const q = query.trim().toUpperCase();
  if (q.length < 1) return [];

  const pool: Hit[] = [
    ...(plan?.placements.map(p => ({ id: p.id, kind: p.kind === 'reserved' ? 'Reserved pad' : 'Unit', where: 'Site' })) ?? []),
    ...model.nodes.map(n => ({ id: n.id, kind: label[n.kind] ?? n.kind, where: whereOf(n) })),
  ];

  const exact = pool.filter(h => h.id.toUpperCase() === q);
  if (exact.length) return exact;

  // A bare number means the cell or pack of that number, which is how anybody reads a schedule.
  const scored = pool
    .map(h => ({ h, score: score(h.id.toUpperCase(), q) }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score || a.h.id.localeCompare(b.h.id));
  return scored.slice(0, limit).map(x => x.h);
}

const whereOf = (n: Node): string =>
  n.kind === 'cell' ? `${n.parent} · row ${(n.row ?? 0) + 1}, column ${(n.column ?? 0) + 1}`
  : n.parent ? `In ${n.parent}` : 'Container';

const score = (id: string, q: string): number => {
  if (id === q) return 100;
  const tail = id.split('/').at(-1) ?? id;
  if (tail === q) return 90;
  if (tail.startsWith(q)) return 70;
  if (id.startsWith(q)) return 60;
  if (tail.replace(/^[A-Z]+0*/, '') === q.replace(/^0+/, '')) return 50;   // "42" finds C042
  if (id.includes(q)) return 20;
  return 0;
};
