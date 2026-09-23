import { describe, expect, it } from 'vitest';
import { acts, actOf, lessons, nextLesson, defaultControls, type LessonCard } from '../sim/lessons';
import { accounting, simulate } from '../sim/engine';
import { lfpParameterSet } from '../sim/presets';

const built = lessons.filter(l => !l.arrivesIn);
/** The closing sentence a learner would actually read, from a real run of the card's defaults. */
const soWhat = (card: LessonCard, values = defaultControls(card)) => {
  const out = simulate({ ...card.runWith(values), parameters: lfpParameterSet });
  const series = out.series, act = Math.max(0, series.timeSeconds.length - 2);
  return card.story.soWhat({ series, totals: accounting(series), values, act });
};

/**
 * Seven cards in a grid is a list. The catalogue has to make an argument, and each card has to
 * leave the reader holding something they can say out loud.
 */
describe('the catalogue reads as one argument', () => {
  it('places every card in an act, and leaves no act empty', () => {
    for (const l of lessons) expect(acts.some(a => a.id === l.story.actId), l.template.label).toBe(true);
    for (const a of acts) expect(lessons.some(l => l.story.actId === a.id), a.title).toBe(true);
  });

  it('keeps the acts in order, so the argument is the reading order', () => {
    const order = lessons.map(l => acts.findIndex(a => a.id === l.story.actId));
    for (let i = 1; i < order.length; i++) expect(order[i], lessons[i].template.label).toBeGreaterThanOrEqual(order[i - 1]);
    expect(actOf(lessons[0]).id).toBe('machine');
  });

  it('names the next card from every card but the last', () => {
    for (let i = 0; i < lessons.length - 1; i++) {
      expect(nextLesson(lessons[i].template.id)?.template.id).toBe(lessons[i + 1].template.id);
    }
    expect(nextLesson(lessons[lessons.length - 1].template.id)).toBeNull();
    expect(nextLesson('no-such-lesson')).toBeNull();
  });

  it('says what each card leaves the reader holding, without repeating the question', () => {
    for (const l of built) {
      expect(l.story.takeaway.length, l.template.label).toBeGreaterThan(25);
      expect(l.story.situation.length, l.template.label).toBeGreaterThan(80);
      expect(l.story.takeaway).not.toBe(l.template.question);
      expect(l.story.situation).not.toBe(l.template.objective);
    }
    expect(new Set(built.map(l => l.story.takeaway)).size).toBe(built.length);
  });
});

/**
 * The closing beat is a conclusion, not a caption: it is written from the run that happened, so a
 * learner who moves a control gets a different sentence because they produced a different result.
 */
describe('the closing beat comes out of the run', () => {
  it('writes a sentence for every card at its defaults', () => {
    for (const l of built) {
      const text = soWhat(l);
      expect(text.length, l.template.label).toBeGreaterThan(80);
      expect(text, l.template.label).not.toMatch(/NaN|undefined|Infinity/);
    }
  });

  it('changes when the learner changes something', () => {
    const peak = lessons.find(l => l.template.id === 'lesson-2')!;
    const base = defaultControls(peak);
    const high = soWhat(peak, { ...base, target: 2_500_000 });
    const low = soWhat(peak, { ...base, target: 400_000 });
    expect(low).not.toBe(high);
    // A limit far below what the battery can hold all day has to be reported as broken, not as met.
    expect(low).toMatch(/held for|broke|reached/);
  });

  it('states the round trip from the losses, not from a day that does not close', () => {
    const price = lessons.find(l => l.template.id === 'lesson-5')!;
    const text = soWhat(price);
    expect(text).toMatch(/lost [\d,.]+ kWh/);
    // The default day ends at a different charge level from the one it started at, and a claim
    // about a round trip that quietly nets that away is the oldest trick in storage marketing.
    expect(text).toMatch(/did not close|fuller|emptier/);
  });

  it('keeps the UPS sizing labelled as indicative however it is steered', () => {
    const ups = lessons.find(l => l.template.id === 'lesson-7')!;
    for (const duration of [0, 1, 2]) {
      expect(soWhat(ups, { ...defaultControls(ups), duration })).toContain('indicative sizing from contract demand');
    }
  });
});
