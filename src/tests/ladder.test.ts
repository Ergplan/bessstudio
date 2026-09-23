import { describe, expect, it } from 'vitest';
import { defaultSizingInput, sizeSystem, recoveryHours } from '../sizing/engine';
import { containerLadder, designYear } from '../sizing/ladder';
import { energyCascade } from '../sizing/cascade';
import { publishedContainerLadder } from '../catalog/sources';
import { enclosures, enclosureEnergyKWh } from '../catalog/products';

const plant = (powerMW: number, durationH: number) => {
  const base = defaultSizingInput('solar-shifting');
  return sizeSystem({
    ...base, mode: 'power-duration', powerMW, durationH,
    chargeDurationH: recoveryHours(durationH, base.losses),
  });
};

/**
 * "Would a bigger container have done it in one?"
 *
 * The question a buyer asks when a 5 MWh duty comes back as two containers. It is answerable only
 * if the ladder is the sizes that exist and the arithmetic is the same arithmetic that sized the
 * plant — otherwise it is a second opinion from a second model, which is worth nothing.
 */
describe('the container ladder', () => {
  it('agrees with the engine on the rung the engine actually picked', () => {
    for (const [p, h] of [[1, 5], [5, 1], [5, 5], [2.5, 4]] as [number, number][]) {
      const s = plant(p, h);
      const rung = containerLadder(s).rungs.find(r => r.isCatalogue)!;
      const c = energyCascade(s, designYear(s));
      // Same deliverable per unit, and the same fleet, as the sizing that produced the quotation.
      expect(rung.deliverableKWh, `${p} MW / ${h} h`).toBeCloseTo(c.deliverableKWh, 6);
      expect(rung.units, `${p} MW / ${h} h`).toBe(s.unitsForEnergy);
    }
  });

  it('carries every published rung, in order, unpriced', () => {
    const s = plant(1, 5);
    const l = containerLadder(s);
    expect(l.rungs).toHaveLength(publishedContainerLadder.length);
    expect(l.rungs.map(r => r.nameplateKWh)).toEqual([...l.rungs.map(r => r.nameplateKWh)].sort((a, b) => a - b));
    // Every published rung is carried at the nameplate the register records.
    for (const r of publishedContainerLadder.filter(x => x.evidence !== 'catalogue')) {
      expect(l.rungs.map(x => x.nameplateKWh)).toContain(r.nameplateKWh);
    }
    // Exactly one rung is ours, it is the only quotable one, and it is the design's own enclosure
    // to the kilowatt-hour rather than the register's rounded label for it.
    const catalogue = l.rungs.filter(r => r.isCatalogue);
    expect(catalogue).toHaveLength(1);
    expect(catalogue[0].evidence).toBe('catalogue');
    expect(catalogue[0].nameplateKWh).toBe(enclosureEnergyKWh(s.enclosure));
    const quotable = new Set(enclosures.map(e => Math.round(enclosureEnergyKWh(e))));
    for (const r of l.rungs.filter(x => !x.isCatalogue)) {
      expect(r.evidence, `${r.label}`).not.toBe('catalogue');
      expect(quotable.has(Math.round(r.nameplateKWh)), `${r.label} must not be quotable`).toBe(false);
    }
  });

  it('needs more nameplate on a bigger rung to deliver the same energy — monotonically', () => {
    const l = containerLadder(plant(1, 5));
    const sorted = [...l.rungs].sort((a, b) => a.nameplateKWh - b.nameplateKWh);
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i].deliverableKWh).toBeGreaterThan(sorted[i - 1].deliverableKWh);
      expect(sorted[i].units).toBeLessThanOrEqual(sorted[i - 1].units);
    }
  });

  it('says what nameplate a single container would have to carry, and checks it inverts', () => {
    const s = plant(1, 5);
    const l = containerLadder(s);
    // Feed the answer back through the same line: it must land on the requirement, to the kWh.
    const rung = l.rungs.find(r => r.isCatalogue)!;
    const perKWh = rung.deliverableKWh / rung.nameplateKWh;
    expect(l.singleUnitNeedsKWh * perKWh).toBeCloseTo(l.requiredKWh, 6);
    // And it must be above every rung that still needs two, and at or below any that needs one.
    for (const r of l.rungs) {
      if (r.units > 1) expect(r.nameplateKWh).toBeLessThan(l.singleUnitNeedsKWh);
      else expect(r.nameplateKWh).toBeGreaterThanOrEqual(l.singleUnitNeedsKWh - 1e-6);
    }
    expect(l.singleUnitAtKWh === null || l.singleUnitAtKWh >= l.singleUnitNeedsKWh - 1e-6).toBe(true);
  });

  it('scales the auxiliaries with the box rather than flattering the larger rungs', () => {
    const s = plant(1, 5);
    const l = containerLadder(s);
    const ours = l.rungs.find(r => r.isCatalogue)!;
    const big = l.rungs.find(r => r.nameplateKWh > ours.nameplateKWh)!;
    // Deliverable per kWh of nameplate is the same on every rung: the auxiliaries grew with it.
    expect(big.deliverableKWh / big.nameplateKWh).toBeCloseTo(ours.deliverableKWh / ours.nameplateKWh, 9);
  });
});
