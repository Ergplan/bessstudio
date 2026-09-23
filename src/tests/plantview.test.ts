import { describe, expect, it } from 'vitest';
import { ends } from '../app/components/PlantDashboard';
import type { Readout } from '../sim/lessons';

/** A run with only the fields the flow reads, so the rule can be checked without a simulation. */
const seriesWith = (over: Partial<Record<keyof Readout['series'], number[]>>): Readout['series'] => ({
  timeSeconds: [0], requestedPowerW: [0], achievedPowerW: [0], gridPowerW: [0], soc: [0.5],
  cellTempC: [25], cellTempMaxC: [25], cellVoltageMinV: [3.2], cellVoltageV: [3.2],
  siteLoadW: [0], generationW: [0], gridImportW: [0], gridExportW: [0], curtailedW: [0],
  unservedLoadW: [0], bindingConstraint: [''], dcPowerW: [0], packVoltageV: [1330],
  packCurrentA: [0], cellVoltageMaxV: [3.2], converterLossW: [0], batteryLossW: [0], auxiliaryW: [0],
  ...over,
} as Readout['series']);

/**
 * What is on the other side of the converter, read off the run.
 *
 * The first version of this took the answer from the control the learner had pressed, which worked
 * for exactly one card. Reading it from the series is what lets the same view serve all seven
 * without any of them configuring it — and it is why a card resting at midnight correctly says the
 * grid rather than an array that is not generating.
 */
describe('what the plant view names as the supply and the offtake', () => {
  it('names an array when one is generating, and the grid when none is', () => {
    expect(ends(seriesWith({ generationW: [900_000], achievedPowerW: [-900_000] }), 0).supply.label)
      .toBe('Rooftop array');
    expect(ends(seriesWith({ achievedPowerW: [-900_000] }), 0).supply.label).toBe('The grid');
    // Night on a solar card: the array is in the scenario and making nothing, so it is not the
    // supply. Naming it anyway would be the picture disagreeing with the run.
    expect(ends(seriesWith({ generationW: [0], achievedPowerW: [-500_000] }), 0).supply.label)
      .toBe('The grid');
  });

  it('names the site, and says when it is islanded', () => {
    const grid = ends(seriesWith({ siteLoadW: [600_000], gridImportW: [600_000], achievedPowerW: [400_000] }), 0);
    expect(grid.offtake.label).toBe('The site');

    const island = ends(seriesWith({ siteLoadW: [600_000], achievedPowerW: [600_000] }), 0);
    expect(island.offtake.label).toBe('The site, islanded');
    expect(island.offtake.detail).toContain('600 kW');
  });

  it('knows which way the energy is going', () => {
    expect(ends(seriesWith({ achievedPowerW: [900_000] }), 0).discharging).toBe(true);
    expect(ends(seriesWith({ achievedPowerW: [-900_000] }), 0).discharging).toBe(false);
    // At rest it is not discharging, and nothing claims a rate it is not moving.
    const idle = ends(seriesWith({}), 0);
    expect(idle.discharging).toBe(false);
    expect(idle.acKW).toBe(0);
  });
});
