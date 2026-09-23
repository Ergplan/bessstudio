import { describe, expect, it } from 'vitest';
import { defaultSizingInput, sizeSystem, recoveryHours } from '../sizing/engine';
import { energyCascade, retentionAtYear } from '../sizing/cascade';
import { enclosureEnergyKWh } from '../catalog/products';

const plant = (powerMW: number, durationH: number) => {
  const base = defaultSizingInput('peak-shaving');
  return sizeSystem({
    ...base, mode: 'power-duration', powerMW, durationH,
    chargeDurationH: recoveryHours(durationH, base.losses),
  });
};

/**
 * The factors, on screen, checkable by hand.
 *
 * A reader told a container delivers 3.56 MWh out of a 5.02 MWh nameplate has to take five numbers
 * on trust. The cascade exists so they do not have to — which only works if what it shows is
 * arithmetically the same thing the engine did, to the kilowatt-hour.
 */
describe('where the nameplate goes', () => {
  it('lands exactly where the engine landed', () => {
    for (const [mw, h] of [[0.005, 1], [1, 5], [5, 4], [50, 4]] as const) {
      const s = plant(mw, h);
      const c = energyCascade(s, 0);
      // The fleet's deliverable at commissioning is the engine's own day-one figure.
      expect(c.fleetDeliverableKWh / 1000, `${mw} MW × ${h} h`).toBeCloseTo(s.day1UsableMWh, 9);
      expect(c.nameplateKWh, `${mw} MW`).toBeCloseTo(enclosureEnergyKWh(s.enclosure), 9);
      expect(c.units).toBe(s.units);
    }
  });

  it('is a chain: each step starts where the last one stopped', () => {
    const c = energyCascade(plant(1, 5), 0);
    expect(c.steps[0].fromKWh).toBeCloseTo(c.nameplateKWh, 9);
    for (let i = 1; i < c.steps.length; i++) {
      expect(c.steps[i].fromKWh, c.steps[i].id).toBeCloseTo(c.steps[i - 1].toKWh, 9);
      expect(c.steps[i].toKWh, c.steps[i].id).toBeLessThanOrEqual(c.steps[i].fromKWh + 1e-9);
    }
    expect(c.steps.at(-1)!.toKWh).toBeCloseTo(c.deliverableKWh, 9);
  });

  it('multiplies out by hand, which is the entire point', () => {
    const c = energyCascade(plant(1, 5), 0);
    const factors = c.steps.filter(x => x.factor !== null).reduce((a, x) => a * x.factor!, 1);
    const aux = c.steps.find(x => x.id === 'aux')!;
    expect(c.nameplateKWh * factors - (aux.fromKWh - aux.toKWh)).toBeCloseTo(c.deliverableKWh, 6);
  });

  it('follows the years the plant is actually modelled over', () => {
    const s = plant(1, 5);
    const c0 = energyCascade(s, 0), c20 = energyCascade(s, 20);
    expect(c0.retention).toBe(1);
    expect(c20.retention).toBeCloseTo(retentionAtYear(s, 20), 9);
    expect(c20.retention).toBeLessThan(c0.retention);
    expect(c20.deliverableKWh).toBeLessThan(c0.deliverableKWh);
    // And the hours it quotes are the hours somebody would check against the contract.
    expect(c0.hoursAtRatedPower).toBeCloseTo(s.day1UsableMWh / s.ratedPowerMW, 9);
  });

  it('names somebody other than this studio for every factor', () => {
    for (const step of energyCascade(plant(1, 5), 20).steps) {
      expect(step.settledBy.length, step.id).toBeGreaterThan(15);
      expect(step.evidence.length, step.id).toBeGreaterThan(30);
      expect(step.settledBy.toLowerCase(), step.id).not.toContain('studio');
      expect(step.detail.length, step.id).toBeGreaterThan(30);
    }
    // Retention is the one nobody can settle in advance, and the pack has to say so.
    const retention = energyCascade(plant(1, 5), 20).steps.find(x => x.id === 'retention')!;
    expect(retention.settledBy).toMatch(/warrant|advance/i);
  });
});
