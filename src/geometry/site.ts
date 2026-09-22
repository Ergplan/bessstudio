import type { Vec } from '../domain/model';
import type { Primitive } from './primitives';

/**
 * The site.
 *
 * The studio draws one container; a project usually buys several, along with the converters and
 * transformers that go beside them. Without this the only place the fleet appeared was a number on
 * a quotation. The layout is deliberately plain — rows of containers at real separations, the
 * conversion equipment along one end — because its job is to give the plot a size somebody can
 * stand a fence around, not to pass for a civil drawing.
 */
export type SiteSpec = {
  units: number;
  pcsCount: number; pcsModel: string; pcsKW: number;
  transformerCount: number; transformerMVA: number;
  energyMWh: number; powerMW: number;
};

export type SitePlacement = { id: string; kind: 'container' | 'pcs' | 'transformer'; position: Vec; size: Vec };
export type SitePlan = {
  placements: SitePlacement[];
  /** Fenced plot, metres, X by Z. */
  plot: [number, number];
  areaM2: number;
  rows: number; perRow: number;
  /** Separation between neighbouring containers within a row, metres. */
  sideGap: number;
  /** Access road between rows, metres. */
  rowGap: number;
  spec: SiteSpec;
};

const SIDE_GAP = 3;      // separation between containers standing shoulder to shoulder
const ROW_GAP = 6;       // access road wide enough for a vehicle to reach either row
const EDGE = 5;          // setback from the container field to the fence
const PCS_SIZE: Vec = [2.4, 2.3, 1.6];
const TX_SIZE: Vec = [3.2, 2.8, 2.4];

export function planSite(spec: SiteSpec, enclosure: Vec): SitePlan {
  const units = Math.max(1, Math.round(spec.units));
  const [l, h, w] = enclosure;
  const pitchZ = w + SIDE_GAP, pitchX = l + ROW_GAP;

  // Choose the row length that comes closest to a square field, so the plot is a shape somebody
  // would actually lease rather than a 200 m ribbon.
  const perRow = Math.max(1, Math.min(units, Math.round(Math.sqrt(units * pitchX / pitchZ))));
  const rows = Math.ceil(units / perRow);

  const fieldX = rows * pitchX - ROW_GAP, fieldZ = perRow * pitchZ - SIDE_GAP;
  const placements: SitePlacement[] = [];
  for (let i = 0; i < units; i++) {
    const row = Math.floor(i / perRow), col = i % perRow;
    placements.push({
      id: `UNIT-${String(i + 1).padStart(2, '0')}`, kind: 'container',
      position: [-fieldX / 2 + l / 2 + row * pitchX, 0, -fieldZ / 2 + w / 2 + col * pitchZ],
      size: [l, h, w],
    });
  }

  // Conversion sits off the end of the field, on the access side, in one line.
  const bay = fieldX / 2 + ROW_GAP;
  const kit: [SitePlacement['kind'], number, Vec][] = [['pcs', spec.pcsCount, PCS_SIZE], ['transformer', spec.transformerCount, TX_SIZE]];
  let lane = 0;
  for (const [kind, count, size] of kit) {
    for (let i = 0; i < Math.max(0, Math.round(count)); i++) {
      placements.push({
        id: `${kind === 'pcs' ? 'PCS' : 'TX'}-${String(i + 1).padStart(2, '0')}`, kind,
        position: [bay + lane * 4.5, 0, -fieldZ / 2 + size[2] / 2 + i * (size[2] + 2)],
        size,
      });
    }
    lane += 1;
  }

  // The conversion bay hangs off one end, so centring the container field would leave an equal
  // margin of nothing on the other side. Centre everything that was placed instead.
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const p of placements) {
    minX = Math.min(minX, p.position[0] - p.size[0] / 2); maxX = Math.max(maxX, p.position[0] + p.size[0] / 2);
    minZ = Math.min(minZ, p.position[2] - p.size[2] / 2); maxZ = Math.max(maxZ, p.position[2] + p.size[2] / 2);
  }
  const shiftX = (minX + maxX) / 2, shiftZ = (minZ + maxZ) / 2;
  for (const p of placements) p.position = [p.position[0] - shiftX, p.position[1], p.position[2] - shiftZ];

  const plot: [number, number] = [maxX - minX + 2 * EDGE, maxZ - minZ + 2 * EDGE];
  return { placements, plot, areaM2: plot[0] * plot[1], rows, perRow, sideGap: SIDE_GAP, rowGap: ROW_GAP, spec };
}

const colours = { shell: '#cfd9dd', roof: '#e6ecee', frame: '#253f4c', pcs: '#8ba5ad', tx: '#a4b0a2', road: '#161e25', pad: '#1C262E' };

/** The site as drawable boxes. One container is a shell, not 4,992 cells — the fleet has to stay light. */
export function sitePrimitives(plan: SitePlan, selected: string): Primitive[] {
  const out: Primitive[] = [];
  const box = (owner: string, tag: string, position: Vec, size: Vec, color: string): void => {
    out.push({ id: `${owner}#${tag}`, owner, shape: 'box', position, size, color, category: 'structure' });
  };

  const [px, pz] = plan.plot;
  box('SITE', 'pad', [0, -0.12, 0], [px, 0.2, pz], colours.pad);

  // The access roads between rows, so the spacing reads as a decision rather than a gap.
  const units = plan.placements.filter(p => p.kind === 'container');
  const [l, , w] = units[0].size;
  const rowXs = [...new Set(units.map(u => Number(u.position[0].toFixed(4))))].sort((a, b) => a - b);
  const zSpan = plan.perRow * (w + plan.sideGap);
  const zMid = units.reduce((t, u) => t + u.position[2], 0) / units.length;
  for (let r = 1; r < rowXs.length; r++)
    box('SITE', `road${r}`, [(rowXs[r] + rowXs[r - 1]) / 2, -0.015, zMid], [plan.rowGap - 0.6, 0.02, zSpan], colours.road);

  for (const p of plan.placements) {
    const [x, , z] = p.position, [sx, sy, sz] = p.size;
    const lit = selected === p.id;
    if (p.kind === 'container') {
      box(p.id, 'plinth', [x, 0.09, z], [sx + 0.2, 0.18, sz + 0.2], colours.frame);
      box(p.id, 'shell', [x, 0.18 + sy / 2, z], [sx, sy, sz], lit ? '#dfe9c9' : colours.shell);
      box(p.id, 'roof', [x, 0.18 + sy + 0.05, z], [sx + 0.1, 0.1, sz + 0.1], colours.roof);
      for (const dz of [-sz / 2, sz / 2]) box(p.id, `rail${dz}`, [x, 0.18 + sy, z + dz], [sx, 0.09, 0.07], colours.frame);
      for (const dx of [-sx / 2, sx / 2]) for (const dz of [-sz / 2, sz / 2])
        box(p.id, `corner${dx}${dz}`, [x + dx, 0.18 + sy / 2, z + dz], [0.11, sy, 0.11], colours.frame);
      // Door bays on the service face, so the row reads as something you walk along.
      for (let d = 0; d < 6; d++)
        box(p.id, `door${d}`, [x - sx / 2 + sx * (d + 0.5) / 6, 0.18 + sy * 0.46, z + sz / 2 + 0.03], [sx / 6 - 0.3, sy * 0.66, 0.05], colours.frame);
    } else {
      const colour = p.kind === 'pcs' ? colours.pcs : colours.tx;
      box(p.id, 'pad', [x, 0.06, z], [sx + 0.5, 0.12, sz + 0.5], colours.frame);
      box(p.id, 'body', [x, 0.12 + sy / 2, z], [sx, sy, sz], lit ? '#dfe9c9' : colour);
      box(p.id, 'cap', [x, 0.12 + sy + 0.04, z], [sx + 0.12, 0.08, sz + 0.12], colours.roof);
    }
  }
  return out;
}
