import { describe, expect, it } from 'vitest';
import { energy, energyText, power, powerText } from '../domain/units';

/**
 * The unit follows the number.
 *
 * Written from the case that exposed it: a five-kilowatt backup supply read "0.01 MW" and, worse,
 * "0.0 MWh" — five kilowatt-hours of contracted energy displayed as nothing at all.
 */
describe('power and energy are written at the scale they are', () => {
  it('shows a small plant in kilowatts rather than in hundredths of a megawatt', () => {
    expect(power(0.005)).toEqual({ value: '5', unit: 'kW' });
    expect(power(0.025)).toEqual({ value: '25', unit: 'kW' });
    expect(power(0.25)).toEqual({ value: '250', unit: 'kW' });
    expect(powerText(0.005)).toBe('5 kW');
  });

  it('keeps a grid-scale plant in megawatts', () => {
    expect(power(2.5)).toEqual({ value: '2.5', unit: 'MW' });
    expect(power(100)).toEqual({ value: '100', unit: 'MW' });
    expect(power(1)).toEqual({ value: '1', unit: 'MW' });
  });

  it('never rounds an energy that exists down to nothing', () => {
    expect(energy(0.005)).toEqual({ value: '5', unit: 'kWh' });
    expect(energy(0.0005)).toEqual({ value: '0.5', unit: 'kWh' });
    expect(energyText(0.016)).toBe('16 kWh');
    // The figure that started this: five kilowatt-hours, previously shown as "0.0 MWh".
    expect(energyText(0.005)).not.toMatch(/^0/);
  });

  it('carries enough figures to be read, and no more', () => {
    expect(energy(25.08)).toEqual({ value: '25.1', unit: 'MWh' });
    expect(energy(877.793)).toEqual({ value: '878', unit: 'MWh' });
    expect(energy(2.6)).toEqual({ value: '2.6', unit: 'MWh' });
  });

  it('says nothing is nothing, in the unit the reader expects', () => {
    expect(energy(0)).toEqual({ value: '0', unit: 'MWh' });
    expect(power(0)).toEqual({ value: '0', unit: 'MW' });
  });
});
