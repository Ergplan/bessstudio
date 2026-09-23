import { describe, expect, it } from 'vitest';
import { energy, energyText, power, powerText } from '../domain/units';
import { defaultSizingInput, sizeSystem } from '../sizing/engine';
import { defaultOfferContent, plantConfiguration } from '../quoting/offer';
import { engineeringAppendix } from '../quoting/appendix';
import { defaultBranding } from '../brand/brand';
import type { Organization } from '../platform/types';

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

/**
 * The documents, not just the helper.
 *
 * A proposal that states a 16 kWh cabinet's rated energy as "0.016 MWh", or a contracted energy of
 * "0 MWh", is the same fault as the screen that started this — and it is the one the customer keeps.
 */
describe('a small plant reads as a small plant everywhere it is written down', () => {
  const small = sizeSystem({ ...defaultSizingInput('backup-power'), mode: 'power-duration', powerMW: 0.005, durationH: 1, chargeDurationH: 1 });
  const org = { id: 'o', name: 'Studio', branding: defaultBranding, currency: 'INR', plan: 'trial', createdAt: '', createdBy: '' } as unknown as Organization;
  const offer = (sizing: ReturnType<typeof sizeSystem>) => defaultOfferContent({
    org, sizing, customerName: 'A customer', projectName: 'A project',
    number: 'Q-1', deliveryWeeks: 20, warrantyYears: 5,
  });

  it('never states a real quantity as nothing', () => {
    const written = [
      offer(small).title,
      offer(small).configuration,
      ...plantConfiguration(small).map(r => `${r.unit} ${r.total}`),
      ...offer(small).qualifications,
      ...engineeringAppendix({ sizing: small, designHash: 'x' }).sections.flatMap(s => s.rows.map(r => `${r.label} ${r.value}`)),
    ].join(' | ');
    expect(written).not.toMatch(/(^|[^.\d])0(\.0+)? ?M(W|Wh)\b/);
    expect(written).not.toMatch(/0\.0\d+ MWh/);
  });

  it('writes the contracted rating in the units it was asked for', () => {
    expect(offer(small).title).toBe('5 kW / 5 kWh');
    expect(plantConfiguration(small).find(r => r.parameter === 'Contracted rating')!.total).toBe('5 kW / 5 kWh');
  });

  it('leaves a grid-scale plant in megawatts', () => {
    const big = sizeSystem({ ...defaultSizingInput('energy-arbitrage'), mode: 'power-duration', powerMW: 50, durationH: 4, chargeDurationH: 4 });
    expect(offer(big).title).toBe('50 MW / 200 MWh');
  });
});
