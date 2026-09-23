// Third-party sources for figures the supplied schedules do not settle.
//
// The catalogue carries a `provenance` on every product, which says how much to trust an entry but
// not what was consulted to arrive at it. This register carries the other half: each external
// document, how much of it was actually read, and — figure by figure — what it corroborates or
// contradicts in the catalogue and the validation harness. It exists because the standing rule on
// this project is that an assumption must be visible before a quantity or a price is approved, and
// an assumption checked against a manufacturer's data sheet is a different thing from one checked
// against a search result. `src/tests/sources.test.ts` holds the catalogue to what is written here.

/** How much of the document was in front of us when the figures below were written down. */
export type Retrieval =
  /** The document itself was read. */
  | 'read'
  /** The document could not be reached; figures come from published summaries of it. */
  | 'secondary'
  /** The document could not be reached and nothing was taken from it. */
  | 'unreachable';

/** What one published figure does to one thing this repository already asserts. */
export type SourceFigure = {
  /** What the manufacturer publishes, in their words. */
  label: string;
  /** The published value, as published — units and all, not normalised. */
  value: string;
  /** The catalogue id, or the file and constant, this figure bears on. */
  bearsOn: string;
  verdict:
    /** Our figure survives this source. */
    | 'corroborates'
    /** Our figure does not survive this source, and something has to change. */
    | 'contradicts'
    /** Neither: it is about a different product, or it opens a question rather than closing one. */
    | 'open';
  /** Why the verdict is that and not another. Never empty; the test enforces it. */
  note: string;
};

export type ExternalSource = {
  id: string;
  publisher: string;
  document: string;
  url: string;
  retrieval: Retrieval;
  /** What happened when it was fetched. Named so a later reader knows whether to try again. */
  retrievalNote: string;
  /** ISO date the figures were taken. */
  accessed: string;
  figures: SourceFigure[];
};

/**
 * Both manufacturer documents below were requested directly and both were refused by this
 * environment's network policy — `www.catl.com:443` and `www.reptbattero.com:443` each answered
 * 403 to CONNECT at the egress proxy. Nothing was read from either. The REPT figures recorded
 * here come from published specification summaries of the same products, which is weaker evidence
 * and is marked as such on every entry.
 */
export const externalSources: ExternalSource[] = [
  {
    id: 'rept-314ah-cell',
    publisher: 'REPT Battero',
    document: 'Energy Storage Battery Solution brochure — 314 Ah LFP prismatic cell (CB71 / CB75)',
    url: 'https://www.reptbattero.com/wp-content/uploads/2026/09/REPT-Energy-Storage-Battery-Solution-Brochure_EN_0904.pdf',
    retrieval: 'secondary',
    retrievalNote: 'Host blocked by the environment network policy (403 to CONNECT). Figures from published specification summaries of the CB71/CB75, not from the brochure.',
    accessed: '2026-09-23',
    figures: [
      {
        label: 'Continuous discharge current',
        value: '314 A continuous, 628 A peak (1 C / 2 C)',
        bearsOn: 'pack-16s-314',
        verdict: 'corroborates',
        note: 'The schedule rated this pack at 50 A — 0.16 C — which no published 314 Ah cell comes near. Our 150 A stands as the conservative reading: it is under half what this cell is published to sustain continuously, so the pack, not the cell, is the limit. Still `assumed`: this corroborates the direction, it does not replace the supplier sheet.',
      },
      {
        label: 'Cell dimensions and mass',
        value: '71 × 173 × 207 mm, 5.60 ± 0.15 kg',
        bearsOn: 'cell-lfp-314',
        verdict: 'corroborates',
        note: 'Within a millimetre and 20 g of the catalogue entry (71.7 × 174 × 207 mm, 5.62 kg). The catalogue is describing the same industry-standard 314 Ah format.',
      },
      {
        label: 'Internal resistance',
        value: '≤ 0.3 mΩ',
        bearsOn: 'validation/sam_reference.py RESISTANCE_MOHM',
        verdict: 'contradicts',
        note: 'The harness took 0.18 mΩ as its optimistic floor and attributed it to "the published AC impedance for the 314 Ah prismatic in this catalogue" — a figure the catalogue does not in fact carry, there being no impedance field on `Cell`. This is the only externally published resistance for the format we have, so the band now runs from it rather than from an unsourced number.',
      },
      {
        label: 'Cycle life',
        value: '10 000 cycles (12 000 in the ultra-long-life variant)',
        bearsOn: 'cell-lfp-314',
        verdict: 'open',
        note: 'A different manufacturer\'s cell. Our entry is `supplied` at 8 000 cycles from the Solarworld schedule, and 8 000 is the more conservative of the two, so it is left alone: taking a competitor\'s cycle life would improve every retention and augmentation number in the studio on evidence about a cell nobody has quoted.',
      },
    ],
  },
  {
    id: 'rept-20ft-container',
    publisher: 'REPT Battero',
    document: 'Energy Storage Battery Solution brochure — 20 ft liquid-cooled container',
    url: 'https://www.reptbattero.com/wp-content/uploads/2026/09/REPT-Energy-Storage-Battery-Solution-Brochure_EN_0904.pdf',
    retrieval: 'secondary',
    retrievalNote: 'Host blocked by the environment network policy (403 to CONNECT). Figures from published summaries and trade reporting, not from the brochure.',
    accessed: '2026-09-23',
    figures: [
      {
        label: '20 ft container energy',
        value: '6.26 MWh on 392 Ah cells; > 95% maximum round-trip efficiency; 12 000 cycles',
        bearsOn: 'enc-5mwh-20ft',
        verdict: 'open',
        note: 'The current generation of this form factor is a quarter larger than our 5.015 MWh reference container, which is what makes a 5 MWh duty cost two containers instead of one. Not added to the catalogue: there is no price for it here, and adding a unit at an invented price would move every quotation on a number nobody supplied.',
      },
    ],
  },
  {
    id: 'catl-enerone',
    publisher: 'CATL',
    document: 'Energy storage product brochure (Japanese site)',
    url: 'https://www.catl.com/jp/uploads/1/file/public/202303/20230308134740_lbcosxqygb.pdf',
    retrieval: 'unreachable',
    retrievalNote: 'Host blocked by the environment network policy (403 to CONNECT). Nothing taken from it.',
    accessed: '2026-09-23',
    figures: [],
  },
];
