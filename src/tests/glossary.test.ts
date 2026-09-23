import { describe, expect, it } from 'vitest';
import { glossary, termById, termsFirstMetIn, firstUseLabel } from '../sim/glossary';
import { lessons } from '../sim/lessons';
import { defaultSizingInput, sizeSystem } from '../sizing/engine';
import { energyCascade } from '../sizing/cascade';

/** The order a reader meets things: the primer, then the seven cards, then the studio. */
const ORDER = ['primer', ...lessons.map(l => l.template.id), 'studio-cascade'];
const rank = (where: string) => ORDER.indexOf(where);

/**
 * A glossary is only worth having if it is in the right order.
 *
 * A definition that leans on a word the reader has not met yet is not a definition — it is the same
 * wall in smaller type. So each term names what it needs, and this refuses any term whose
 * prerequisite is introduced later than it is. That is the whole discipline: the list can grow, but
 * it cannot get out of order without the suite saying so.
 */
describe('the glossary', () => {
  it('has no duplicates, and every term is placed somewhere a reader goes', () => {
    const ids = glossary.map(t => t.id);
    expect(new Set(ids).size, 'duplicate term ids').toBe(ids.length);
    for (const t of glossary) {
      expect(rank(t.firstMet), `${t.id} is first met in "${t.firstMet}", which is nowhere`).toBeGreaterThanOrEqual(0);
    }
  });

  it('never defines a word using one the reader has not met', () => {
    for (const t of glossary) {
      for (const need of t.needs) {
        const prior = termById(need);
        expect(prior, `${t.id} needs "${need}", which is not in the glossary`).toBeDefined();
        expect(rank(prior!.firstMet), `${t.id} (${t.firstMet}) needs ${need} (${prior!.firstMet}), which comes later`)
          .toBeLessThanOrEqual(rank(t.firstMet));
        // Within one place, the earlier word must also come earlier in the list, because that is
        // the order the strip prints them in.
        if (prior!.firstMet === t.firstMet) {
          expect(glossary.indexOf(prior!)).toBeLessThan(glossary.indexOf(t));
        }
      }
    }
  });

  it('writes a definition a beginner can finish', () => {
    for (const t of glossary) {
      expect(t.plain.length, `${t.id} is too short to be a definition`).toBeGreaterThan(60);
      expect(t.plain.length, `${t.id} is a paragraph, not a definition`).toBeLessThan(420);
      expect(t.plain.trim().endsWith('.'), `${t.id} does not end in a full stop`).toBe(true);
      expect(t.term[0], `${t.id} should read as a name`).toBe(t.term[0].toUpperCase());
    }
  });

  it('spells an abbreviation out the first time, per §15.1', () => {
    const soc = termById('charge-level')!;
    expect(firstUseLabel(soc)).toBe('Battery charge level (state of charge, or SOC)');
    expect(firstUseLabel(termById('power')!)).toBe('Power');
  });
});

/**
 * The gap the glossary exists to close.
 *
 * A learner who finishes all seven cards is shown an energy cascade whose every step is a word no
 * lesson ever used. These tests tie the list to the two places the words actually appear, so the
 * screen and the glossary cannot drift apart.
 */
describe('what the lessons and the studio actually say', () => {
  it('teaches every word a lesson claims to teach, exactly once', () => {
    const taught = lessons.flatMap(l => l.story.teaches);
    expect(new Set(taught).size, 'a word is claimed by two cards').toBe(taught.length);
    for (const l of lessons) {
      for (const id of l.story.teaches) {
        const t = termById(id);
        expect(t, `${l.template.id} teaches "${id}", which is not in the glossary`).toBeDefined();
        expect(t!.firstMet, `${id} is taught by ${l.template.id} but first met in ${t!.firstMet}`)
          .toBe(l.template.id);
      }
      // A strip is read before a run, not studied. Past about half a dozen it stops being read.
      expect(l.story.teaches.length, `${l.template.id} introduces too many words at once`).toBeLessThanOrEqual(6);
    }
  });

  it('covers every step of the cascade the studio shows', () => {
    const s = sizeSystem(defaultSizingInput('solar-shifting'));
    const cascade = energyCascade(s, 0);
    // The cascade's own steps, each mapped to the word that explains it. A step with no word is a
    // step a reader has to guess at, and guessing at the usable window is how a plant gets bought.
    const forStep: Record<string, string> = {
      retention: 'retention', window: 'usable-window', dod: 'dod', path: 'losses', aux: 'auxiliaries',
    };
    for (const step of cascade.steps) {
      const id = forStep[step.id];
      expect(id, `the cascade step "${step.id}" has no glossary entry`).toBeDefined();
      expect(termById(id), `${id} is missing from the glossary`).toBeDefined();
    }
    // And the two ends of it.
    for (const id of ['nameplate', 'deliverable']) expect(termById(id)).toBeDefined();
  });

  it('starts a reader on the distinction the whole studio rests on', () => {
    // Power, energy and the ratio between them. A reader who cannot separate a megawatt from a
    // megawatt-hour cannot read a single figure the studio prints, and nothing taught it.
    const primer = termsFirstMetIn('primer').map(t => t.id);
    expect(primer.slice(0, 3)).toEqual(['power', 'energy', 'duration']);
    expect(primer).toContain('c-rate');
  });
});
