import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { lessonById, defaultControls } from '../sim/lessons';
import { simulate } from '../sim/engine';
import { lfpParameterSet } from '../sim/presets';

const card = lessonById('lesson-1')!;
const run = (over: Record<string, number> = {}) =>
  simulate({ ...card.runWith({ ...defaultControls(card), ...over }), parameters: lfpParameterSet });

/**
 * The claim the first card's two gauges rest on.
 *
 * A water cup tells you how full it is by how hard it pushes. This chemistry does not, and the
 * dashboard says so — in a sentence that counts the millivolts off the run on the screen. If the
 * cell ever stopped being flat, that sentence would become a lie told live, so the property is
 * pinned here rather than trusted.
 */
describe('the voltage plateau', () => {
  it('moves the cell by tens of millivolts while the charge level moves tens of points', () => {
    const out = run();
    // The closing sample dispatches nothing and the terminal voltage rebounds to open circuit, so
    // it is excluded: a real effect, and not part of the plateau.
    const volts = out.series.cellVoltageV.slice(0, -1);
    const socs = out.series.soc.slice(0, -1);
    const mV = (Math.max(...volts) - Math.min(...volts)) * 1000;
    const points = (Math.max(...socs) - Math.min(...socs)) * 100;

    expect(points, 'the run should empty a good part of the battery').toBeGreaterThan(25);
    expect(mV, 'the cell should move something, or the model is not modelling a cell').toBeGreaterThan(5);
    expect(mV, 'a flat chemistry does not move a tenth of a volt across the middle').toBeLessThan(100);
    // The point in one number: millivolts per point of charge. Under two is what makes a voltmeter
    // useless as a fuel gauge and a coulomb counter necessary.
    expect(mV / points).toBeLessThan(2);
  });

  it('rebounds when the current stops, which is why the last sample is left out', () => {
    const out = run();
    const v = out.series.cellVoltageV;
    const last = v[v.length - 1], underLoad = v[v.length - 2];
    expect(last).toBeGreaterThan(underLoad);
  });

  it('agrees with the plate the documentation carries, where one has been rendered', () => {
    // `npm run plates` writes this from the same engine. Not required to exist — a clone that has
    // never run Python still passes — but it must agree where it does.
    const file = join(__dirname, '..', '..', 'validation', 'plateau.json');
    if (!existsSync(file)) return;
    const plate = JSON.parse(readFileSync(file, 'utf8')) as { spreadV: number };
    const volts = run().series.cellVoltageV.slice(0, -1);
    expect(Math.max(...volts) - Math.min(...volts)).toBeCloseTo(plate.spreadV, 6);
  });
});
