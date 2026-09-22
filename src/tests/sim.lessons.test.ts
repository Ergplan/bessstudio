import { describe, expect, it } from 'vitest';
import { defaultControls, lessonById, lessons, type LessonCard, type Readout } from '../sim/lessons';
import { learningTemplateSchema, scenarioSchema, sealIntact } from '../sim/records';
import { simulate, accounting, type RunOutput } from '../sim/engine';
import { comparePolicies } from '../sim/compare';
import { lfpParameterSet, manualPolicy } from '../sim/presets';

/**
 * The lesson catalogue, against the limits §15 puts on a beginner card.
 *
 * Three controls, four headline figures, two charts. Those are caps rather than suggestions, and
 * the schema enforces them — these check that the cards actually shipped inside them, that every
 * card actually runs, that what the figures say agrees with what the charts draw, and that a card
 * which has not been built says so rather than opening onto nothing.
 */

const run = (card: LessonCard, values = defaultControls(card)) =>
  simulate({ ...card.runWith(values), parameters: lfpParameterSet });

const readoutOf = (card: LessonCard, out: RunOutput, values: Record<string, number>): Readout => ({
  series: out.series, totals: accounting(out.series), values,
  act: Math.max(0, out.series.timeSeconds.length - 2),
});

const built = () => lessons.filter(l => !l.arrivesIn);

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
    expect(built()).toHaveLength(6);
    expect(built().map(l => l.template.id)).toEqual(['lesson-1', 'lesson-2', 'lesson-3', 'lesson-4', 'lesson-5', 'lesson-6']);
    for (const later of lessons.filter(l => l.arrivesIn)) {
      expect(later.controls, `${later.template.label}`).toHaveLength(0);
      expect(later.arrivesIn).toMatch(/^S\d+$/);
    }
  });

  it('holds every built card inside the beginner limits', () => {
    for (const l of built()) {
      expect(l.controls.length, `${l.template.label} controls`).toBeLessThanOrEqual(3);
      expect(l.template.metrics.length, `${l.template.label} metrics`).toBeLessThanOrEqual(4);
      expect(l.template.charts.length, `${l.template.label} charts`).toBeLessThanOrEqual(2);
      expect(l.template.estimatedMinutes, `${l.template.label} is a short card`).toBeLessThanOrEqual(5);
      expect(l.template.expectedOutcomes.length, `${l.template.label} states what it teaches`).toBeGreaterThan(0);
    }
  });

  it('draws no more than it declared, on every card', () => {
    for (const card of built()) {
      const values = defaultControls(card);
      const r = readoutOf(card, run(card, values), values);
      expect(card.readout(r).length, `${card.template.label} figures`).toBeLessThanOrEqual(4);
      expect(card.plots(r).length, `${card.template.label} charts`).toBeLessThanOrEqual(2);
      expect(card.readout(r).length, `${card.template.label} declared ${card.template.metrics.length}`).toBe(card.template.metrics.length);
      expect(card.plots(r).length).toBe(card.template.charts.length);
    }
  });

  it('gives every control a hint in words rather than in jargon', () => {
    for (const card of built()) {
      for (const c of card.controls) {
        expect(c.hint.length, `${card.template.label} ${c.id}`).toBeGreaterThan(20);
        expect(c.hint, `${card.template.label} ${c.id}`).not.toMatch(/\bSOC\b|\bPCS\b|\bBMS\b/);
        expect(c.label, `${card.template.label} ${c.id}`).not.toMatch(/\bSOC\b/);
      }
    }
  });
});

describe('every card runs, and shows something happening', () => {
  it('completes on its own defaults', () => {
    for (const card of built()) {
      const out = run(card);
      expect(out.run.status, `${card.template.label}: ${out.run.failure}`).toBe('complete');
      expect(out.series.timeSeconds.length, card.template.label).toBeGreaterThan(10);
    }
  });

  it('does something on its own defaults, rather than opening on a flat line', () => {
    for (const card of built()) {
      const out = run(card);
      const moved = accounting(out.series);
      expect(moved.deliveredAcWh + moved.drawnAcWh, `${card.template.label} moves energy`).toBeGreaterThan(1000);
      const soc = out.series.soc;
      expect(Math.max(...soc) - Math.min(...soc), `${card.template.label} charge level moves`).toBeGreaterThan(0.01);
    }
  });

  it('produces a figure and a chart for every value it promises', () => {
    for (const card of built()) {
      const values = defaultControls(card);
      const r = readoutOf(card, run(card, values), values);
      for (const m of card.readout(r)) {
        expect(m.value, `${card.template.label} ${m.label}`).not.toMatch(/NaN|Infinity|undefined/);
        expect(m.label.length).toBeGreaterThan(2);
      }
      for (const p of card.plots(r)) {
        expect(p.lines.length, `${card.template.label} ${p.title}`).toBeGreaterThan(0);
        for (const line of p.lines) {
          expect(line.values.length, `${card.template.label} ${p.title} ${line.name}`).toBe(r.series.timeSeconds.length);
          for (const v of line.values) expect(Number.isFinite(v), `${card.template.label} ${line.name}`).toBe(true);
        }
      }
    }
  });

  it('agrees between what the figures say and what the charts draw', () => {
    // The headline figure and the chart are two readings of one run. Where a card reports a peak,
    // the chart has to reach it; where it reports a charge level, the charge chart has to end there.
    for (const card of built()) {
      const values = defaultControls(card);
      const out = run(card, values);
      const r = readoutOf(card, out, values);
      const charge = card.plots(r).find(p => p.title === 'Charge level');
      if (charge) {
        const drawn = charge.lines[0].values;
        expect(drawn[drawn.length - 1] / 100, `${card.template.label} closing charge`).toBeCloseTo(out.series.soc[out.series.soc.length - 1], 9);
      }
      const peak = card.readout(r).find(m => m.label === 'Highest import');
      if (peak) {
        const line = card.plots(r)[0].lines.find(l => l.name === 'From the grid')!;
        expect(Math.max(...line.values).toFixed(0)).toBe(peak.value.replace(/,/g, ''));
      }
    }
  });
});

describe('the lesson loop', () => {
  it('replays from the same initial state after a control moves, so a comparison is fair', () => {
    for (const card of built()) {
      const base = defaultControls(card);
      const control = card.controls.find(c => c.id !== 'initialSoc');
      if (!control) continue;
      const moved = { ...base, [control.id]: control.kind === 'slider' ? control.start * 0.6 : control.options[1].value };
      const runs = [base, moved].map(v => run(card, v));
      expect(runs[1].series.soc[0], `${card.template.label} both begin alike`).toBe(runs[0].series.soc[0]);
      expect(runs[1].run.status, card.template.label).toBe('complete');
    }
  });

  it('resets to exactly what it opened with', () => {
    for (const card of built()) {
      const opened = run(card, defaultControls(card));
      const fiddled = run(card, { ...defaultControls(card), initialSoc: 0.42 });
      const reset = run(card, defaultControls(card));
      expect(reset.run.scenarioHash, card.template.label).toBe(opened.run.scenarioHash);
      expect(reset.series.soc, card.template.label).toEqual(opened.series.soc);
      expect(fiddled.run.scenarioHash, `${card.template.label} really did change in between`).not.toBe(opened.run.scenarioHash);
    }
  });

  it('changes the scenario only through the control that is meant to change it', () => {
    const card = lessonById('lesson-1')!;
    const base = card.runWith(defaultControls(card)).scenario;
    const started = card.runWith({ ...defaultControls(card), initialSoc: 0.55 }).scenario;
    expect(started.initialSoc).toBe(0.55);
    expect(started.configHash, 'a different starting point is a different scenario').not.toBe(base.configHash);
    // The power dial is not part of the scenario: it is what the learner asks of it.
    const louder = card.runWith({ ...defaultControls(card), power: 2_000_000 });
    expect(louder.scenario.configHash).toBe(base.configHash);
    expect(louder.manualRequestW).toBe(2_000_000);
  });

  it('reverses when the direction control is flipped, and nothing else changes', () => {
    const card = lessonById('lesson-1')!;
    const out = card.runWith(defaultControls(card));
    const back = card.runWith({ ...defaultControls(card), direction: -1 });
    expect(out.manualRequestW).toBeGreaterThan(0);
    expect(back.manualRequestW).toBe(-out.manualRequestW);
    expect(back.scenario.configHash).toBe(out.scenario.configHash);
  });

  it('keeps every card’s scenario and policy valid, and pointing at each other', () => {
    for (const card of built()) {
      const setup = card.runWith(defaultControls(card));
      expect(() => scenarioSchema.parse(setup.scenario), card.template.label).not.toThrow();
      expect(setup.scenario.policyId, card.template.label).toBe(setup.policy.id);
      expect(setup.scenario.plantId, card.template.label).toBe(setup.plant.id);
    }
  });
});

describe('what each card is actually for', () => {
  it('lesson 1 moves a megawatt for two hours', () => {
    const out = run(lessonById('lesson-1')!);
    expect(accounting(out.series).deliveredAcWh / 1e6).toBeCloseTo(2, 2);
    expect(out.series.soc[out.series.soc.length - 1]).toBeGreaterThan(manualPolicy.reserveSoc + 0.05);
  });

  it('lesson 2 holds the import at the target, and a target set too low is not held all day', () => {
    const card = lessonById('lesson-2')!;
    const peakOf = (v: Record<string, number>) => Math.max(...run(card, v).series.gridImportW);
    const values = defaultControls(card);
    // At the default target the plant holds it, near enough: the shortfall is one reporting
    // interval's worth of the site climbing between samples.
    expect(peakOf(values)).toBeLessThanOrEqual(values.target * 1.02);
    expect(peakOf(values), 'and the site really would have gone higher').toBeLessThan(Math.max(...run(card, values).series.siteLoadW));

    // A target set too low is the second thing this lesson teaches: the battery empties trying to
    // hold it, and the evening peak then arrives unshaved and higher than the one that was held.
    const tooLow = peakOf({ ...values, target: 1_000_000 });
    expect(tooLow).toBeGreaterThan(1_000_000 * 1.02);
    expect(tooLow).toBeGreaterThan(peakOf(values));
  });

  it('lesson 3 stores the surplus a bigger array makes, and says what could not be kept', () => {
    const card = lessonById('lesson-3')!;
    const figure = (array: number, label: string) => {
      const values = { ...defaultControls(card), array };
      const r = readoutOf(card, run(card, values), values);
      return Number(card.readout(r).find(x => x.label === label)!.value.replace(/,/g, ''));
    };
    // A bigger array makes more surplus, so more goes into the battery and more leaves the site.
    expect(figure(4_000_000, 'Stored for later')).toBeGreaterThan(figure(1_000_000, 'Stored for later'));
    expect(figure(4_000_000, 'Exported')).toBeGreaterThan(figure(1_000_000, 'Exported'));
    // And the four figures account for everything the array made, with nothing left over.
    for (const array of [1_000_000, 2_000_000, 4_000_000]) {
      const generated = figure(array, 'Generated');
      const accounted = figure(array, 'Used as it was made') + figure(array, 'Stored for later') + figure(array, 'Exported');
      expect(accounted, `${array / 1e6} MW array`).toBeLessThanOrEqual(generated * 1.02);
    }
  });

  it('lesson 4 carries the outage it was given the reserve for, and says when it cannot', () => {
    const card = lessonById('lesson-4')!;
    const short = run(card, { ...defaultControls(card), outageHours: 1 });
    const during = short.series.timeSeconds.map((t, i) => ({ t, i })).filter(({ t }) => t >= 18 * 3600 && t < 19 * 3600);
    for (const { i } of during) expect(short.series.unservedLoadW[i], `sample ${i}`).toBeLessThan(1);

    const starved = run(card, { ...defaultControls(card), reserve: 0.1, outageHours: 5, initialSoc: 0.15 });
    expect(starved.series.unservedLoadW.some(w => w > 0), 'a reserve too small does not carry it, and says so').toBe(true);
  });

  it('lesson 5 buys in the cheap window and sells in the dear one', () => {
    const card = lessonById('lesson-5')!;
    const out = run(card);
    const at = (hour: number) => out.series.timeSeconds.findIndex(t => t >= hour * 3600);
    expect(out.series.achievedPowerW[at(2)], 'charging overnight').toBeLessThan(0);
    expect(out.series.achievedPowerW[at(19)], 'discharging in the evening').toBeGreaterThan(0);
  });

  it('lesson 6 gets a different answer in each condition, from a different subsystem', () => {
    const card = lessonById('lesson-6')!;
    const named = (condition: number) => {
      const values = { ...defaultControls(card), condition };
      const r = readoutOf(card, run(card, values), values);
      return card.readout(r).find(m => m.label === 'What held it back')!.value;
    };
    const hottest = (condition: number) => Math.max(...run(card, { ...defaultControls(card), condition }).series.cellTempMaxC);
    expect(hottest(1), 'the hot day really is hotter').toBeGreaterThan(hottest(0));
    expect(named(1), 'and something holds it back on a hot day').not.toBe('Nothing');
  });
});

describe('the baseline comparisons', () => {
  it('only offers a baseline that keeps every protection', () => {
    for (const card of built()) {
      if (!card.baseline) continue;
      expect(card.compareOn, card.template.label).toBeTruthy();
      expect(card.baseline.label.length).toBeGreaterThan(5);
      // The baseline is a policy the engine runs in full, not a switch that turns anything off.
      const setup = card.runWith(defaultControls(card));
      const c = comparePolicies(
        { scenario: setup.scenario, plant: setup.plant, parameters: lfpParameterSet, manualRequestW: setup.manualRequestW },
        card.baseline.policy, setup.policy,
      );
      expect(c.baseline.complete, `${card.template.label} baseline`).toBe(true);
      expect(c.candidate.complete, `${card.template.label} candidate`).toBe(true);
      expect(c.baseline.endingSoc).toBeGreaterThanOrEqual(0);
      expect(c.baseline.endingSoc).toBeLessThanOrEqual(1);
      expect(c.disclosures.join(' '), 'the ending charge is disclosed either way').toMatch(/finish|ended at/i);
      expect(c.disclosures.join(' ')).toMatch(/illustrative/i);
    }
  });
});

describe('what a lesson may and may not claim', () => {
  it('names an owner for every constraint it names, and none for a request that was met', () => {
    for (const card of built()) {
      const out = run(card);
      for (let i = 0; i < out.series.bindingConstraint.length; i++) {
        const named = out.series.bindingConstraint[i];
        const owner = out.series.bindingOwner[i];
        if (named && named !== 'Request met in full') {
          expect(['PCS', 'BMS', 'EMS', 'grid', 'battery'], `${card.template.label} sample ${i}: "${named}" owned by "${owner}"`).toContain(owner);
        } else {
          expect(owner, `${card.template.label} sample ${i}`).toBe('');
        }
      }
    }
  });

  it('calls its prices illustrative wherever it quotes one', () => {
    const card = lessonById('lesson-5')!;
    const out = run(card);
    const quoting = out.decisions.decisions.filter(d => d.rule.startsWith('price-schedule/charge') || d.rule.startsWith('price-schedule/discharge'));
    expect(quoting.length).toBeGreaterThan(10);
    for (const d of quoting) expect(d.explanation, d.rule).toMatch(/illustrative/i);
    expect(card.template.expectedOutcomes.join(' ')).toMatch(/illustrative/i);
  });

  it('runs the backup lesson on a plant that can actually form an island', () => {
    const setup = lessonById('lesson-4')!.runWith(defaultControls(lessonById('lesson-4')!));
    expect(setup.plant.islandCapable, 'a backup lesson on a plant that cannot island teaches a lie').toBe(true);
    expect(setup.scenario.outage).toBeTruthy();
  });

  it('keeps a beginner card to one policy it can name, rather than a stack of them', () => {
    for (const card of built()) {
      const setup = card.runWith(defaultControls(card));
      expect(setup.policy.policyVersion, card.template.label).toMatch(/-\d+$/);
    }
  });
});
