import { describe, expect, it } from 'vitest';
import { defaultControls, lessonById, lessons, requestFrom, withControls } from '../sim/lessons';
import { learningTemplateSchema, scenarioSchema, sealIntact } from '../sim/records';
import { simulate, accounting } from '../sim/engine';
import { lfpParameterSet, manualPolicy, teachingPlant } from '../sim/presets';

/**
 * The lesson catalogue, against the limits §15 puts on a beginner card.
 *
 * Three controls, four headline figures, two charts. Those are caps rather than suggestions, and
 * the schema enforces them — these check that the cards actually shipped inside them, and that a
 * card which has not been built says so rather than opening onto nothing.
 */

describe('the catalogue', () => {
  it('carries the seven cards §15 names, each asking one question', () => {
    expect(lessons).toHaveLength(7);
    for (const l of lessons) {
      expect(() => learningTemplateSchema.parse(l.template), l.template.label).not.toThrow();
      expect(l.template.question.endsWith('?'), `${l.template.label} asks a question`).toBe(true);
      expect(sealIntact(l.template as never)).toBe(true);
    }
    expect(new Set(lessons.map(l => l.template.id)).size).toBe(7);
  });

  it('says which cards are not built yet, and gives them no controls to pretend with', () => {
    const built = lessons.filter(l => !l.arrivesIn);
    expect(built).toHaveLength(1);
    expect(built[0].template.id).toBe('lesson-1');
    for (const later of lessons.filter(l => l.arrivesIn)) {
      expect(later.controls, `${later.template.label}`).toHaveLength(0);
      expect(later.arrivesIn).toMatch(/^S\d+$/);
    }
  });

  it('holds every built card inside the beginner limits', () => {
    for (const l of lessons.filter(x => !x.arrivesIn)) {
      expect(l.controls.length, `${l.template.label} controls`).toBeLessThanOrEqual(3);
      expect(l.template.metrics.length, `${l.template.label} metrics`).toBeLessThanOrEqual(4);
      expect(l.template.charts.length, `${l.template.label} charts`).toBeLessThanOrEqual(2);
      expect(l.template.estimatedMinutes, `${l.template.label} is a short card`).toBeLessThanOrEqual(5);
      expect(l.template.expectedOutcomes.length, `${l.template.label} states what it teaches`).toBeGreaterThan(0);
    }
  });

  it('gives every control a hint in words rather than in jargon', () => {
    for (const c of lessonById('lesson-1')!.controls) {
      expect(c.hint.length, c.id).toBeGreaterThan(20);
      expect(c.hint, c.id).not.toMatch(/\bSOC\b|\bPCS\b|\bBMS\b/);
      expect(c.label, c.id).not.toMatch(/\bSOC\b/);
    }
  });
});

describe('the lesson loop', () => {
  const card = lessonById('lesson-1')!;

  it('opens on a scenario that runs, and defaults that show something happening', () => {
    const values = defaultControls(card);
    const out = simulate({
      scenario: withControls(card, values), plant: teachingPlant, policy: manualPolicy,
      parameters: lfpParameterSet, manualRequestW: requestFrom(values),
    });
    expect(out.run.status).toBe('complete');
    const a = accounting(out.series);
    // One megawatt for two hours is two megawatt-hours, and the default has to actually move.
    expect(a.deliveredAcWh / 1e6).toBeCloseTo(2, 2);
    const soc = out.series.soc;
    expect(soc[0], 'starts where the scenario says').toBeCloseTo(card.scenario.initialSoc, 9);
    expect(soc[soc.length - 1], 'and ends somewhere visibly different').toBeLessThan(soc[0] - 0.2);
    expect(soc[soc.length - 1], 'without bottoming out on the reserve').toBeGreaterThan(manualPolicy.reserveSoc + 0.05);
  });

  it('replays from the same initial state after a control moves, so a comparison is fair', () => {
    const base = defaultControls(card);
    const louder = { ...base, power: 2_000_000 };
    const runs = [base, louder].map(v => simulate({
      scenario: withControls(card, v), plant: teachingPlant, policy: manualPolicy,
      parameters: lfpParameterSet, manualRequestW: requestFrom(v),
    }));
    expect(runs[1].series.soc[0], 'both begin at the same charge level').toBe(runs[0].series.soc[0]);
    expect(accounting(runs[1].series).deliveredAcWh).toBeGreaterThan(accounting(runs[0].series).deliveredAcWh);
  });

  it('reverses when the direction control is flipped, and nothing else changes', () => {
    const out = defaultControls(card);
    expect(requestFrom(out)).toBeGreaterThan(0);
    expect(requestFrom({ ...out, direction: -1 })).toBe(-requestFrom(out));
  });

  it('changes the scenario only through the control that is meant to change it', () => {
    const base = withControls(card, defaultControls(card));
    const started = withControls(card, { ...defaultControls(card), initialSoc: 0.55 });
    expect(started.initialSoc).toBe(0.55);
    expect(started.configHash, 'a different starting point is a different scenario').not.toBe(base.configHash);
    // The power dial is not part of the scenario: it is what the learner asks of it.
    const louder = withControls(card, { ...defaultControls(card), power: 2_000_000 });
    expect(louder.configHash).toBe(base.configHash);
  });

  it('keeps every card’s scenario valid', () => {
    for (const l of lessons) expect(() => scenarioSchema.parse(l.scenario), l.template.label).not.toThrow();
  });
});
