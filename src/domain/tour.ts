import { source, type Config } from '../config/schema';
import type { Model } from './model';
import type { SitePlan } from '../geometry/site';

/**
 * The guided walk.
 *
 * The landing sequence builds a container in front of the customer and earns their attention. This
 * is the same idea one level in: rather than leaving someone to find the aisle, the serpentine and
 * the combiner on their own, the studio walks them down from the enclosure to a single cell and
 * back out through the electrical path, setting the view for each step and narrating it with the
 * figures this design actually produced.
 */
export type WalkStep = {
  id: string;
  eyebrow: string;
  title: string;
  body: string;
  /** What the camera settles on. */
  target: string;
  visibility: Partial<Config['visibility']>;
  explode: number;
  highlight: boolean;
};

const v = (n: number, digits = 1) => n.toLocaleString('en', { maximumFractionDigits: digits });

export function walkSteps(model: Model, plan: SitePlan | null = null): WalkStep[] {
  const s = model.stats, d = model.dimensions, a = model.config.assumptions;
  const rack = model.racks[0]?.id ?? 'BESS';
  const pack = model.packs.find(p => p.parent === rack)?.id ?? rack;
  const cell = model.cells.find(c => c.parent === pack)?.id ?? pack;

  // With a fleet the walk starts one level out, on the plot the customer actually leases.
  const site: WalkStep[] = plan ? [{
    id: 'site', eyebrow: '', target: 'SITE',
    title: 'The whole site',
    body: `${plan.spec.units} containers on a ${v(plan.plot[0], 0)} × ${v(plan.plot[1], 0)} m plot, with ${plan.spec.pcsCount} converters beside them. ${plan.sideGap} m between units so a fault in one cannot reach the next, ${plan.rowGap} m between rows because each one arrives and leaves on a truck.${plan.spec.laterUnits ? ` ${plan.spec.laterUnits} more pads stand empty: augmentation is years away, but the fence is not moving.` : ''}`,
    visibility: { labels: true }, explode: 0, highlight: false,
  }] : [];

  return numbered([...site,
    {
      id: 'container', eyebrow: '', target: 'BESS',
      title: 'One container',
      body: `${v(s.energy, 0)} kWh of storage and ${v(s.power / 1000, 2)} MW of power, in an envelope of ${d.required.map(x => v(x, 1)).join(' × ')} m. Everything from here on is inside this box.`,
      visibility: { roof: false, walls: true, lids: true, labels: true }, explode: 0, highlight: false,
    },
    {
      id: 'banks', eyebrow: '', target: 'BESS',
      title: 'Two banks and a walkway',
      body: `${s.racks} racks stand in two banks, facing an aisle of ${v(a.aisle, 0)} mm. The aisle is not spare room — somebody has to stand inside and pull a pack out, and that requirement is what sets the width of the container.`,
      visibility: { roof: false, walls: false, lids: true, labels: true }, explode: 0, highlight: false,
    },
    {
      id: 'string', eyebrow: '', target: rack,
      title: 'One string',
      body: `Each rack is ${s.seriesPacks} packs wired in series: ${v(s.minVoltage)}–${v(s.maxVoltage)} V as the batteries fill and empty. How deep this stack goes is the most consequential number in the design — it has to land inside the converter's DC window at both ends.`,
      visibility: { roof: false, walls: false, lids: true, labels: false }, explode: 0, highlight: false,
    },
    {
      id: 'pack', eyebrow: '', target: pack,
      title: 'One pack, opened',
      body: `${source.seriesCells} cells in ${source.rows} rows of ${source.columns}, clamped under compression on a ${a.coldPlate} mm liquid cold plate. The rows alternate direction, so the string finishes where it started and the ${source.seriesCells - 1} links between cells stay short.`,
      visibility: { roof: false, walls: false, lids: false, cells: true, busbars: true, labels: false }, explode: 0, highlight: false,
    },
    {
      id: 'cooling', eyebrow: '', target: rack,
      title: 'How the heat gets out',
      body: `Every rack is fed from a header running the length of the container. Inside one, coolant crosses the plate under each of its packs and returns warmer — ${s.packs} plates in parallel across the ${s.racks} racks. Cells age about twice as fast for every 10 °C, so this loop is a warranty instrument: the spread between the hottest and coldest cell in a container is what shows up in year eight as a spread in capacity.`,
      visibility: { roof: false, walls: false, lids: true, coolant: true, hv: false, busbars: false, labels: false }, explode: 0, highlight: true,
    },
    {
      id: 'cell', eyebrow: '', target: cell,
      title: 'One cell',
      body: `${source.cellVoltage} V and ${source.cellAh} Ah — ${s.cellEnergy.toFixed(3)} kWh, about a day of a ceiling fan. It takes ${v(s.cells, 0)} of them to fill the container, and every allowance you have just seen exists to hold them at the right temperature and pressure.`,
      visibility: { roof: false, walls: false, lids: false, cells: true, busbars: true, coolant: false, labels: false }, explode: 0, highlight: false,
    },
    {
      id: 'path', eyebrow: '', target: 'BESS',
      title: 'The path out',
      body: `All ${s.parallelStrings} strings are paralleled at the combiner into one pair of DC terminals, each behind its own fuse and contactor. ${v(s.current, 0)} A leaves the container at ${v(s.minVoltage)}–${v(s.maxVoltage)} V.`,
      visibility: { roof: false, walls: false, lids: true, hv: true, busbars: true, labels: true }, explode: 0, highlight: true,
    },
  ]);
}

/** The step counter is written once, here, so adding a step cannot leave it saying 1 of 6. */
const numbered = (steps: WalkStep[]): WalkStep[] =>
  steps.map((step, i) => ({ ...step, eyebrow: `Step ${i + 1} of ${steps.length}` }));
