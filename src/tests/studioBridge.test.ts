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
