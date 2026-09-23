/**
 * The words, before the argument.
 *
 * §15.1 requires that jargon is taught on first use — "the default label is Battery charge level
 * (SOC), not SOC". The lessons honoured the spirit of that in their prose and not the letter of it
 * on screen: a reader meeting the first card is shown a converter, auxiliaries, a battery
 * management system, an energy management system, a reserve floor and a string voltage inside the
 * first minute, and nothing on the page says what any of them is. Somebody who already knows reads
 * past it. Somebody who does not has no way in, and the lessons are for the second person.
 *
 * So the terms are data. Each card declares which it introduces, the player shows those before the
 * run rather than interrupting it, and the catalogue carries the whole list. The definitions are
 * written to one rule: a sentence a person who has never seen a battery plant can finish reading
 * without needing a second definition. Where a term is unavoidably defined in terms of another,
 * `needs` names it, and the test refuses a definition whose prerequisite comes later.
 */
export type Term = {
  id: string;
  /** The full name, as it should be written the first time. */
  term: string;
  /** The abbreviation, where using one is unavoidable. Null where it is not. */
  short: string | null;
  /** The unit it is measured in, so the reader knows what kind of quantity it is. */
  unit: string | null;
  /** One sentence. Plain words. No term the reader has not met. */
  plain: string;
  /**
   * Where the reader first meets it — a lesson id, or the part of the studio that uses it.
   *
   * Terms the studio uses and the lessons never introduce are the gap this list exists to close:
   * a learner who finishes all seven cards still cannot read the energy cascade, because depth of
   * discharge, the usable window and retention are never named in a lesson.
   */
  firstMet: string;
  /** Terms this definition leans on, which must therefore be met no later than this one. */
  needs: string[];
};

/**
 * Ordered as a reader meets them. The order is the argument: a rate, then an amount, then the
 * ratio between them, and only then anything that happens to either.
 */
export const glossary: Term[] = [
  {
    id: 'power', term: 'Power', short: null, unit: 'kW, or MW for a thousand of them', firstMet: 'primer', needs: [],
    plain: 'How fast energy moves at this instant — the size of the flow, not the size of the store. A 5 kW heater and a 5 MW plant differ by a thousand times in how hard they push, and not at all in how long they can keep it up.',
  },
  {
    id: 'energy', term: 'Energy', short: null, unit: 'kWh, or MWh for a thousand of them', firstMet: 'primer', needs: ['power'],
    plain: 'How much there is in total — power multiplied by the time it runs for. One kilowatt for one hour is one kilowatt-hour, and so is two kilowatts for half an hour.',
  },
  {
    id: 'duration', term: 'Duration', short: null, unit: 'hours', firstMet: 'primer', needs: ['power', 'energy'],
    plain: 'How long a plant can hold its rated power before the store is empty: the energy divided by the power. This is why a plant is quoted as two numbers and never one.',
  },
  {
    id: 'cell', term: 'Cell', short: null, unit: 'ampere-hours (Ah)', firstMet: 'primer', needs: [],
    plain: 'The smallest part that actually stores anything — one sealed unit of chemistry, about the size of a thick book. Everything larger is cells wired together in a box.',
  },
  {
    id: 'pack', term: 'Pack, rack, enclosure', short: null, unit: null, firstMet: 'primer', needs: ['cell'],
    plain: 'The three sizes cells are sold in: cells are bolted into a pack, packs are stacked into a rack, and racks fill an enclosure — a cabinet on a wall or a shipping container on a pad.',
  },
  {
    id: 'charge-level', term: 'Battery charge level', short: 'state of charge, or SOC', unit: '%', firstMet: 'lesson-1', needs: ['energy'],
    plain: 'How full the store is right now, from empty to full, in the same sense as a fuel gauge.',
  },
  {
    id: 'converter', term: 'Converter', short: 'power conversion system, or PCS', unit: 'kW', firstMet: 'lesson-1', needs: ['power'],
    plain: 'The machine between the cells and the grid. Cells work in direct current and the grid in alternating current, so nothing reaches the grid without passing through it — which is also why it sets the plant\'s power rating, not the cells.',
  },
  {
    id: 'losses', term: 'Losses', short: null, unit: 'kWh', firstMet: 'lesson-1', needs: ['energy'],
    plain: 'Energy that went in and did not come out, mostly as heat in the converter and in the cells\' own resistance. Not a fault: every pass costs some.',
  },
  {
    id: 'auxiliaries', term: 'Auxiliaries', short: null, unit: 'kWh a day', firstMet: 'lesson-1', needs: ['energy'],
    plain: 'The plant\'s own housekeeping — cooling, fans, controls, fire detection — which runs whether or not the battery is doing anything and is paid for out of the same meter.',
  },
  {
    id: 'round-trip', term: 'Round-trip efficiency', short: null, unit: '%', firstMet: 'lesson-5', needs: ['energy', 'losses'],
    plain: 'Of the energy you put in, the share you get back out again. Below one hundred per cent always, because the losses are paid twice: once going in and once coming out.',
  },
  {
    id: 'bms', term: 'Battery management system', short: 'BMS', unit: null, firstMet: 'lesson-1', needs: ['cell'],
    plain: 'The electronics watching every cell\'s voltage and temperature. It is the only thing that can refuse a request outright, and it is what physically disconnects the battery when it does.',
  },
  {
    id: 'ems', term: 'Energy management system', short: 'EMS', unit: null, firstMet: 'lesson-1', needs: ['converter', 'bms'],
    plain: 'The software that decides what the plant should be doing at each moment — charge now, discharge now, hold — and asks the converter for it. In this studio it is called ergOS. It asks; the layers below it decide what is possible.',
  },
  {
    id: 'c-rate', term: 'C-rate', short: null, unit: 'C', firstMet: 'primer', needs: ['power', 'energy', 'duration'],
    plain: 'The plant\'s power compared with its own energy: 1 C empties it in an hour, 0.5 C in two, 0.25 C in four. It is the honest way to say whether a duty is gentle or hard on the cells, because it does not depend on the plant\'s size.',
  },
  {
    id: 'demand-charge', term: 'Demand charge', short: null, unit: '₹ per kW a month', firstMet: 'lesson-2', needs: ['power'],
    plain: 'A charge on the highest power a site drew in the billing period, not on the energy it used — so a single bad half-hour can cost more than a month of ordinary consumption.',
  },
  {
    id: 'reserve', term: 'Reserve', short: null, unit: '%', firstMet: 'lesson-2', needs: ['charge-level'],
    plain: 'A share of the charge the plant is not allowed to sell or spend, held back for something else — usually so there is something left if the grid fails.',
  },
  {
    id: 'self-consumption', term: 'Self-consumption', short: null, unit: '%', firstMet: 'lesson-3', needs: ['energy'],
    plain: 'The share of what an array generates that the site uses itself rather than exporting. Storage raises it by holding the midday surplus until the evening.',
  },
  {
    id: 'curtailment', term: 'Curtailment', short: null, unit: 'kWh', firstMet: 'lesson-3', needs: ['energy'],
    plain: 'Generation deliberately thrown away, because nothing on site needed it, nothing would store it and the grid would not take it.',
  },
  {
    id: 'contract-demand', term: 'Contract demand', short: null, unit: 'kVA', firstMet: 'lesson-7', needs: ['power'],
    plain: 'The maximum power a site has contracted to be able to draw. It is the ceiling the site agreed to, not a measurement of what it actually uses, which is why sizing from it is a starting estimate rather than an answer.',
  },
  {
    id: 'power-factor', term: 'Power factor', short: null, unit: null, firstMet: 'lesson-7', needs: ['power'],
    plain: 'How much of the apparent power a site draws is doing useful work. It is why a connection is contracted in kVA and the work is measured in kW: the two differ by this factor.',
  },
  // --- The studio's own words. A learner who finishes all seven cards still meets these cold. ---
  {
    id: 'nameplate', term: 'Nameplate capacity', short: null, unit: 'kWh or MWh', firstMet: 'studio-cascade', needs: ['energy', 'cell'],
    plain: 'The energy printed on the label: every cell in the box, counted at its rated capacity, when new. It is the number a container is sold by, and it is not the number that reaches a meter.',
  },
  {
    id: 'usable-window', term: 'Usable charge window', short: null, unit: '%', firstMet: 'studio-cascade', needs: ['charge-level', 'bms'],
    plain: 'The part of full-to-empty the battery management system will actually let you use — typically the middle 95%, because a cell ages fastest at the very top and the very bottom.',
  },
  {
    id: 'dod', term: 'Depth of discharge', short: 'DoD', unit: '%', firstMet: 'studio-cascade', needs: ['usable-window'],
    plain: 'How much of that allowed window a duty uses in one cycle. Deeper means more energy per cycle and a shorter life, so it is a commercial decision written into a contract, not a property of the battery.',
  },
  {
    id: 'retention', term: 'Capacity retention', short: null, unit: '%', firstMet: 'studio-cascade', needs: ['nameplate'],
    plain: 'How much of the original capacity is left after some years of use — about 80% after twenty years is a common warranty. It is why a plant is built larger than the duty on the day it opens.',
  },
  {
    id: 'augmentation', term: 'Augmentation', short: null, unit: null, firstMet: 'studio-cascade', needs: ['retention'],
    plain: 'Adding more battery later, as the first lot fades, instead of buying all of it at the start. It trades a smaller bill today for a truck visit in year seven.',
  },
  {
    id: 'deliverable', term: 'Deliverable energy', short: null, unit: 'kWh or MWh', firstMet: 'studio-cascade', needs: ['nameplate', 'usable-window', 'dod', 'losses', 'auxiliaries'],
    plain: 'What actually reaches the connection in one discharge, after the window, the depth, the losses and the auxiliaries have each taken their share — roughly two-thirds to three-quarters of the nameplate. This is the number a contract should be written against.',
  },
];

export const termById = (id: string) => glossary.find(t => t.id === id);

/** The terms a given lesson or studio surface introduces, in the order the list holds them. */
export const termsFirstMetIn = (where: string) => glossary.filter(t => t.firstMet === where);

/** How the term should be written the first time a reader sees it. §15.1's rule, as a function. */
export const firstUseLabel = (t: Term) => (t.short ? `${t.term} (${t.short})` : t.term);
