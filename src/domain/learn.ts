import { source } from '../config/schema';
import type { Model, Node } from './model';
import type { SitePlan } from '../geometry/site';

/**
 * The explanations behind the assembly.
 *
 * Once a system has been sized and quoted, the studio is where someone learns why it is shaped the
 * way it is. Every figure quoted here is read from the live model rather than written into the
 * prose, so an explanation cannot drift away from the design it is describing.
 */
export type Lesson = {
  title: string;
  subtitle: string;
  /** What the component is, in one paragraph anybody can read. */
  what: string;
  /** The engineering reason it takes this form. */
  why: string[];
  /** The numbers that follow from the design, labelled. */
  numbers: [string, string][];
  /** What moves if this part of the design changes. */
  consequence: string;
};

const v = (n: number, digits = 1) => `${n.toLocaleString('en', { maximumFractionDigits: digits })}`;

export function siteLesson(plan: SitePlan): Lesson {
  const s = plan.spec, units = plan.placements.filter(p => p.kind === 'container').length;
  return {
    title: 'The site',
    subtitle: `${units} units · ${plan.rows} × ${plan.perRow} · ${v(plan.plot[0])} × ${v(plan.plot[1])} m`,
    what: `One ${s.model} holds ${v(s.energyMWh / Math.max(units, 1), 2)} MWh, and this project needs ${v(s.energyMWh, 2)} MWh, so it buys ${units} of them and stands them on a plot with the conversion equipment beside them. What the customer leases, fences and connects is this, not the container.`,
    why: [
      `The units are ${plan.sideGap} m apart shoulder to shoulder and the rows ${plan.rowGap} m apart. The side gap is separation — a thermal event in one enclosure must not propagate to its neighbour — and the row gap is an access road, because a 42-tonne container arrives on a truck and is replaced the same way.`,
      `The field is laid out ${plan.rows} × ${plan.perRow} rather than in one long line so the plot is a shape somebody would lease. A single row of ${units} would be over ${v(units * (plan.plot[0]), 0)} m long and need a road down its whole length.`,
      `The ${s.pcsCount} converters and ${s.transformerCount} transformers sit off the end of the field in their own bay. Keeping conversion together shortens the medium-voltage run to the point of connection, which is the expensive cable.`,
      `The DC side stays inside each container. What leaves the converter bay is AC at ${v(s.powerMW, 2)} MW, and that is the number the grid connection is sized against.`,
    ],
    numbers: [
      ['Units', `${units} × ${s.model}`],
      ['Installed DC energy', `${v(s.energyMWh, 2)} MWh`],
      ['Rated power', `${v(s.powerMW, 2)} MW`],
      ['Conversion', `${s.pcsCount} × ${s.pcsModel}`],
      ['Transformers', s.transformerCount ? `${s.transformerCount} × ${v(s.transformerMVA, 1)} MVA` : 'None'],
      ['Fenced plot', `${v(plan.plot[0])} × ${v(plan.plot[1])} m · ${Math.round(plan.areaM2).toLocaleString()} m²`],
    ],
    consequence: s.modelled
      ? `Plot area moves with the unit count, not with the energy: a longer duration fills the same containers deeper, while more power needs more of them. Double-click a unit to step inside it.`
      : `Plot area moves with the unit count, not with the energy. The units here are drawn at the ${s.model}'s own outside dimensions, so the plot is right; its interior is not modelled yet, and stepping inside shows the reference 5 MWh assembly instead.`,
  };
}

export function lessonFor(model: Model, id: string): Lesson {
  const s = model.stats, d = model.dimensions;
  const node = model.nodes.find(n => n.id === id);
  const kind = node?.kind ?? 'container';

  if (kind === 'cell') return cellLesson(model, node!);
  if (kind === 'pack') return packLesson(model, node!);
  if (kind === 'rack') return rackLesson(model, node!);
  if (kind === 'ancillary') return ancillaryLesson(model, node!);

  return {
    title: 'The container',
    subtitle: `${s.racks} racks · ${s.packs} packs · ${v(s.cells, 0)} cells`,
    what: `Everything that makes the system a product rather than a pile of batteries sits in this enclosure: the racks in two banks either side of a walkway, the combiner that parallels the strings into one pair of DC terminals, the chiller that moves heat out of the cells, and the system controller that speaks for all of it.`,
    why: [
      `The racks are split into two banks facing a ${v(d.aisle * 1000, 0)} mm aisle because somebody has to be able to stand inside and pull a pack. The aisle is not spare room — it is the reason the enclosure is this wide.`,
      `All ${s.parallelStrings} strings are paralleled at the combiner, so the converter sees one DC connection instead of ${s.parallelStrings}. Strings in parallel never sit at exactly the same voltage, so each one keeps its own fuse and contactor; without them a weak string would be charged by its neighbours.`,
      `Heat is the thing that ages the cells, and liquid cooling is here because ${s.packs} packs dissipating even a few hundred watts each cannot be moved by air at Indian summer ambients.`,
    ],
    numbers: [
      ['Nominal DC energy', `${v(s.energy, 0)} kWh`],
      ['Nominal DC power', `${v(s.power / 1000, 3)} MW`],
      ['String voltage', `${v(s.minVoltage)}–${v(s.maxVoltage)} V`],
      ['Aggregate current', `${v(s.current, 0)} A`],
      ['Required envelope', `${d.required.map(x => v(x, 2)).join(' × ')} m`],
    ],
    consequence: `The enclosure length follows from the rack pitch and the service bays, and the height from the string depth. Change the string depth and the container changes shape, not just its label.`,
  };
}

function cellLesson(model: Model, node: Node): Lesson {
  const s = model.stats;
  return {
    title: 'The cell',
    subtitle: `LFP prismatic · ${source.cellVoltage} V · ${source.cellAh} Ah`,
    what: `This is the smallest part of the system that actually stores anything. One prismatic lithium iron phosphate cell holds ${s.cellEnergy.toFixed(3)} kWh — about what a ceiling fan uses in a day. Everything above it exists to hold ${v(s.cells, 0)} of these at the right temperature and connect them without losing the energy on the way out.`,
    why: [
      `Lithium iron phosphate is the chemistry of choice for stationary storage in India: it gives up some energy per kilogram against NMC, and in exchange it is markedly harder to drive into thermal runaway and it lasts longer at high ambient. Floor space is cheaper than a fire.`,
      `Cells are put in series rather than parallel wherever possible. Series raises voltage; for a given power that means less current; and conduction loss goes with the square of current. Running the string near ${v(s.maxVoltage, 0)} V instead of a few hundred volts is what keeps the busbars from being the size of a wrist.`,
      `Charging below 0 °C plates metallic lithium on the anode, which is permanent and dangerous. That is why the cell carries a charge window of ${source.chargeTemperature[0]} to ${source.chargeTemperature[1]} °C, narrower than its discharge window of ${source.dischargeTemperature[0]} to ${source.dischargeTemperature[1]} °C, and why the thermal system has to heat as well as cool.`,
    ],
    numbers: [
      ['Nominal voltage', `${source.cellVoltage} V`],
      ['Capacity', `${source.cellAh} Ah`],
      ['Energy', `${s.cellEnergy.toFixed(4)} kWh`],
      ['Position in the string', `${(node.order ?? 0) + 1} of ${source.seriesCells}`],
      ['Physical row / column', `${(node.row ?? 0) + 1} / ${(node.column ?? 0) + 1}`],
      ['Operating current', `${source.current} A at ${s.cRate.toFixed(2)} C`],
    ],
    consequence: `Its electrical position is not its physical position. Cells are wired in a serpentine, so cell ${(node.order ?? 0) + 1} in the circuit sits at row ${(node.row ?? 0) + 1}, column ${(node.column ?? 0) + 1} in the tray.`,
  };
}

function packLesson(model: Model, node: Node): Lesson {
  const s = model.stats, a = model.config.assumptions;
  return {
    title: 'The pack',
    subtitle: `${source.packModel} · ${source.seriesCells}S${source.parallelCells}P · ${s.packVoltage} V`,
    what: `A pack is ${source.seriesCells} cells clamped as one block, laid on a liquid cold plate, wired nose to tail and watched by its own controller. It is the smallest unit anyone replaces in the field: a rack is built by stacking packs, and a pack is the heaviest thing two people can still handle on a trolley.`,
    why: [
      `The cells are held under compression with a ${a.compression} mm allowance at each end. Prismatic cells swell as they cycle — the electrode stack breathes — and if nothing holds them the layers separate and the internal resistance climbs. Compression is not packaging, it is part of the electrical design.`,
      `The ${source.rows} × ${source.columns} arrangement is wired as a serpentine: each row runs the opposite way to the one before it, so the end of the last row finishes near the start of the first. That keeps the two terminals close together and the ${source.seriesCells - 1} links between cells as short as they can be.`,
      `A ${a.coldPlate} mm cold plate runs under the whole tray. Ageing in an LFP cell roughly doubles for every 10 °C, so a few degrees of difference between the hottest and coldest cell in a pack shows up years later as a spread in capacity — and a string is only as good as its weakest pack.`,
      `The ${a.terminalClearance} mm above the cells is terminal and busbar clearance, and the ${a.connector} mm at the end is room for the cables to leave without bending tighter than they are allowed to.`,
    ],
    numbers: [
      ['Nominal voltage', `${s.packVoltage} V`],
      ['Capacity', `${source.packAh} Ah`],
      ['Calculated energy', `${s.packEnergy.toFixed(3)} kWh`],
      ['Nameplate label', `${source.packEnergyLabel} kWh`],
      ['Nominal power', `${s.packPower.toFixed(1)} kW`],
      ['Finished size', `${(node.size ?? [0, 0, 0]).map(x => v(x * 1000, 0)).join(' × ')} mm`],
    ],
    consequence: `The finished pack is considerably bigger than the cells inside it — gaps, compression, the cold plate, terminal clearance and the connector allowance all add up. Those allowances are what set the rack pitch, and the rack pitch is what sets the container length.`,
  };
}

function rackLesson(model: Model, node: Node): Lesson {
  const s = model.stats, c = model.config;
  const ceiling = c.equipment.maxVoltage;
  return {
    title: 'The string',
    subtitle: `${node.id} · ${s.seriesPacks} packs in series`,
    what: `A rack is one electrical string: ${s.seriesPacks} packs stacked and wired in series, with its own protection at the top. The container holds ${s.parallelStrings} of them, all paralleled at the combiner. This is the level at which the system is switched, fused and isolated.`,
    why: [
      `String depth is the single most consequential choice in the whole design. ${s.seriesPacks} packs in series gives ${v(s.minVoltage)}–${v(s.maxVoltage)} V across the state of charge${ceiling ? `, against a converter that accepts up to ${v(ceiling)} V` : ''}. Too deep and the string over-volts the converter at full charge; too shallow and it drops out of the converter's window before the batteries are empty, and that energy is simply lost.`,
      `Each string carries a fuse-disconnect, a contactor, a precharge circuit and a current sensor. The precharge is there because a DC bus has capacitance: closing a contactor straight onto it draws an inrush of thousands of amps and welds the contacts. A resistor brings the bus up first, then the main contactor closes onto a matched voltage.`,
      `Strings are fused individually because parallel strings never sit at exactly the same voltage. A fault in one would otherwise be fed by every other string in the container at once.`,
      `The packs are spaced ${c.assumptions.verticalGap} mm apart vertically — room for the inter-pack cable to turn without going below its bend radius, and for a hand.`,
    ],
    numbers: [
      ['Packs in series', `${s.seriesPacks}`],
      ['String voltage', `${v(s.minVoltage)}–${v(s.maxVoltage)} V`],
      ['String current', `${source.current} A`],
      ['Parallel strings', `${s.parallelStrings}`],
      ['Rack height', `${v(model.dimensions.rackHeight * 1000, 0)} mm`],
      ['Cell equivalent', s.equivalent],
    ],
    consequence: `Dropping one pack from every string lowers the ceiling voltage and the rack height, and raises the number of strings needed for the same energy. That is the trade the two topology presets show.`,
  };
}

const ancillaries: Record<string, { title: string; what: string; why: string[] }> = {
  'DC-COMBINER': {
    title: 'The DC combiner',
    what: 'Where every string in the container is paralleled into a single pair of DC terminals for the converter.',
    why: [
      'Without it the converter would need one input per string. Combining is cheaper, but it means all the strings share one bus and any difference between them shows up as circulating current.',
      'This is why each string keeps its own fuse and contactor upstream of the combiner, rather than relying on one device for the whole container.',
    ],
  },
  CHILLER: {
    title: 'The thermal unit',
    what: 'A liquid loop — pump, reservoir and refrigeration — that feeds coolant to the cold plate under every pack and takes the heat away.',
    why: [
      'Cells age roughly twice as fast for every 10 °C, so the thermal system is a warranty instrument as much as a comfort one.',
      'It heats as well as cools: below 0 °C the cells must not be charged at all, and an Indian winter at altitude reaches that.',
      'Liquid rather than air because the heat comes from inside a sealed block of cells; air can only reach their faces.',
    ],
  },
  'SYSTEM-BMS': {
    title: 'The system controller',
    what: 'The top level of a three-level battery management system: pack, cluster and system. It aggregates every cell measurement and is what the plant controller and the converter actually talk to.',
    why: [
      'Protection is layered deliberately. A pack controller can open its own string in milliseconds without asking anyone; the system controller decides strategy, not safety.',
      'It owns balancing across strings, the state-of-charge estimate the converter trusts, and the interlocks that stop the fire system and the contactors disagreeing.',
    ],
  },
  PROTECTION: {
    title: 'String protection',
    what: 'The fuse-disconnect, contactor, precharge circuit and current sensor that sit at the top of each string.',
    why: [
      'The fuse clears a short circuit; the contactor opens the string on command; the precharge brings the DC bus up before the contactor closes; the sensor is what tells the controller any of this is working.',
      'They are drawn here as reserved volume. Ratings — fault withstand, breaking capacity, insulation coordination — are equipment selection, not geometry, and are not asserted by this model.',
    ],
  },
};

function ancillaryLesson(model: Model, node: Node): Lesson {
  const key = Object.keys(ancillaries).find(k => node.id.endsWith(k)) ?? 'PROTECTION';
  const entry = ancillaries[key];
  return {
    title: entry.title,
    subtitle: node.id,
    what: entry.what,
    why: entry.why,
    numbers: [
      ['Reserved volume', `${node.size.map(x => v(x * 1000, 0)).join(' × ')} mm`],
      ['Serves', key === 'PROTECTION' ? 'One string' : `${model.racks.length} strings`],
    ],
    consequence: 'Ancillaries are drawn to reserve space and show where cables have to reach. They are not equipment selections.',
  };
}

/** What a design-review finding means, and what to do about it. */
export type Remedy = { meaning: string; remedy: string };

export const remedies: Record<string, Remedy> = {
  overvoltage: {
    meaning: 'At full charge every cell reaches its maximum voltage at the same time, and the string adds them all up. That peak — not the nominal voltage — is what the converter has to survive.',
    remedy: 'Either take one pack out of each string, or have the battery management system cap the charge voltage below the cell maximum. Capping costs usable energy at the top of the range, so it belongs in the sizing, not in commissioning.',
  },
  undervoltage: {
    meaning: 'As the batteries empty the string voltage falls. Below the converter minimum it simply stops, whatever is left in the cells.',
    remedy: 'Add a pack to each string, or accept the curtailment and size for the energy that is actually reachable rather than the nameplate.',
  },
  'voltage-unknown': {
    meaning: 'No converter limit has been entered, so the voltage compatibility of this string has not been checked against anything.',
    remedy: 'Open the project, or enter the converter DC window under Configure. Until then treat every voltage figure here as unverified.',
  },
  'pcs-current': {
    meaning: 'The strings together can deliver more current than the converter is rated to take.',
    remedy: 'Add converter capacity, or reduce the number of parallel strings per converter. Current, not energy, is what sets this.',
  },
  'constant-current': {
    meaning: 'A constant DC power demand draws its highest current at the lowest voltage — at the end of a discharge, exactly when the string is weakest.',
    remedy: 'Check feasibility at minimum voltage rather than nominal. Either raise the string voltage, add strings, or accept a lower power at low state of charge.',
  },
  'ac-current': {
    meaning: 'The AC output target plus the auxiliaries needs more current at minimum voltage than the batteries can supply.',
    remedy: 'Lower the AC target, add parallel strings, or narrow the depth of discharge so the string never reaches that voltage.',
  },
  aisle: {
    meaning: 'The walkway is narrower than the access width the design calls for.',
    remedy: 'Widen the aisle or narrow the racks. Service access is usually a code requirement, not a preference.',
  },
  connector: {
    meaning: 'There is less room at the end of the pack than the cable needs to turn in.',
    remedy: 'Increase the connector allowance or use a cable with a smaller bend radius. Bending power cable tighter than its rating damages the insulation.',
  },
  'rack-collision': {
    meaning: 'The gap between racks does not leave room for the frame and for the cables to route between them.',
    remedy: 'Increase the rack gap, or reduce the bend radius by changing cable type.',
  },
  'service-interference': {
    meaning: 'The service bay is too short for the ancillary equipment that has to stand in it.',
    remedy: 'Lengthen the end bay. The combiner, thermal unit and controller all need a clear face.',
  },
  'route-intersection': {
    meaning: 'A cable or coolant route has been drawn through the body of a cell, which cannot be built.',
    remedy: 'Increase the clearances the routes are given — terminal clearance, connector allowance or vertical gap — until the routes find a path around.',
  },
  'source-energy': {
    meaning: 'The nameplate energy on the pack and the energy computed from the cells do not agree. Nameplates are usually rounded or conservatively stated.',
    remedy: 'Nothing to fix. The studio uses the computed figure; the difference is recorded so a reader can see which number came from where.',
  },
  'pcs-review': {
    meaning: 'A voltage comparison is not a compatibility statement. Fault current, insulation coordination, earthing and control interfaces are all still open.',
    remedy: 'Send the string parameters to the converter supplier for confirmation before the design is issued.',
  },
};

export const remedyFor = (code: string): Remedy | undefined =>
  remedies[code] ?? (code.startsWith('fit-') ? {
    meaning: 'The enclosure chosen is smaller in this direction than the racks and service bays need, so the assembly penetrates its own walls.',
    remedy: 'Either turn off the manual enclosure and let the studio size it, or increase that dimension until it clears the required envelope.',
  } : undefined);
