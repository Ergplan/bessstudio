import { describe, expect, it } from 'vitest';
import { defaultSizingInput, sizeSystem } from '../sizing/engine';
import { limitsFromSizing } from '../platform/studioBridge';
import { configSchema, defaults } from '../config/schema';
import { buildModel } from '../domain/model';

const sized = (over: Partial<ReturnType<typeof defaultSizingInput>> = {}) =>
  sizeSystem({ ...defaultSizingInput(), ...over });

describe('studio limits from the project', () => {
  it('takes the voltage window from the converter, not the placeholder', () => {
    const sizing = sized();
    const limits = limitsFromSizing(sizing);
    expect(limits.equipment.maxVoltage).toBe(sizing.pcs.dcMaxV);
    expect(limits.equipment.minVoltage).toBe(sizing.pcs.dcMinV);
    expect(limits.label).toContain(sizing.pcs.model);
  });

  it('produces a configuration the studio schema accepts', () => {
    const limits = limitsFromSizing(sized());
    const parsed = configSchema.safeParse({ ...defaults, equipment: limits.equipment, usable: limits.usable });
    expect(parsed.success, parsed.success ? '' : JSON.stringify(parsed.error.issues)).toBe(true);
  });

  it('divides the fleet down to the one enclosure the studio draws', () => {
    // The studio draws one container; the sizing speaks for the whole fleet. The share handed to
    // the studio has to multiply back up to the fleet, and stay inside one enclosure's rating.
    for (const powerMW of [2.5, 25, 100]) {
      const sizing = sized({ powerMW, durationH: 2 });
      const limits = limitsFromSizing(sizing);
      expect(limits.usable.acKW! * sizing.totalUnits).toBeCloseTo(powerMW * 1000, 0);
      expect(limits.usable.acKW!).toBeLessThanOrEqual(sizing.enclosure.ratedKW);
    }
  });

  it('lets the studio report a real over-voltage against the selected converter', () => {
    // The reference container's string reaches 1,518.4 V at full cell voltage; every converter in
    // the catalogue at that class stops at 1,500 V. The finding is the product of supplied data,
    // so it must survive the limits being made project-specific rather than disappear.
    const limits = limitsFromSizing(sized());
    const model = buildModel({ ...defaults, preset: 'reference', equipment: limits.equipment, usable: limits.usable });
    const over = model.warnings.find(w => w.code === 'overvoltage');
    expect(over?.text).toContain(limits.equipment.maxVoltage!.toLocaleString());
  });
});

describe('one container, in the plant the studio is drawing', () => {
  /**
   * The studio draws the day-one plant and says so — "one of five identical units". Dividing the
   * converter capacity by the end-of-life fleet instead handed each container a smaller share of
   * current than it would ever be asked for, and the studio then reported the battery's own
   * capability as an equipment fault.
   */
  it('divides every per-unit figure by the fleet standing on day one', () => {
    for (const augmentation of ['none', 'periodic', 'oversize-day1'] as const) {
      const s = sizeSystem({ ...defaultSizingInput('frequency-regulation'), powerMW: 8, durationH: 1, augmentation });
      const limits = limitsFromSizing(s);
      expect(limits.equipment.maxCurrent, augmentation).toBe(Math.round(s.pcs.dcMaxA * s.pcsCount / s.units));
      expect(limits.usable.acKW, augmentation).toBeCloseTo(s.ratedPowerMW * 1000 / s.units, 3);
      expect(limits.usable.auxKW, augmentation).toBeCloseTo(s.auxMWhPerDay * 1000 / 24 / s.units, 3);
    }
  });

  it('does not call a container that can push more current than it is asked for a fault', () => {
    const s = sizeSystem({ ...defaultSizingInput('frequency-regulation'), powerMW: 8, durationH: 1, augmentation: 'periodic' });
    expect(s.totalUnits, 'this plant augments, so the two fleet counts differ').toBeGreaterThan(s.units);
    const model = buildModel({ ...structuredClone(defaults), equipment: limitsFromSizing(s).equipment });
    expect(model.warnings.some(w => w.code === 'pcs-current'), model.warnings.map(w => w.code).join(', ')).toBe(false);
  });
});
