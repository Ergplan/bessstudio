import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { it } from 'vitest';
import { lessonById, defaultControls } from '../src/sim/lessons';
import { simulate } from '../src/sim/engine';
import { lfpParameterSet } from '../src/sim/presets';

/**
 * Export the first card's four occasions, for the reference plates.
 *
 * The charts in the browser have to be live: §15.1 requires a changed input to run, and a picture
 * rendered on somebody's laptop last Tuesday is not a simulation result. So matplotlib is used
 * where it can be honest — beside the PySAM harness, rendering a fixed reference plate from this
 * same engine that the committed documentation carries and the suite checks the screen against.
 */
it('writes the runs the plates are drawn from', () => {
  const card = lessonById('lesson-1')!;
  const occasions = [
    { id: 'evening', direction: 1, label: 'Evening discharge' },
    { id: 'outage', direction: 2, label: 'Carrying an outage' },
    { id: 'grid', direction: -1, label: 'Charging from the grid' },
    { id: 'solar', direction: -2, label: 'Charging from solar' },
  ];
  const runs = occasions.map(o => {
    const values = { ...defaultControls(card), direction: o.direction };
    const out = simulate({ ...card.runWith(values), parameters: lfpParameterSet });
    const s = out.series;
    return {
      ...o,
      minutes: s.timeSeconds.map(t => t / 60),
      soc: s.soc, cellV: s.cellVoltageV, packA: s.packCurrentA, packV: s.packVoltageV,
      requestedKW: s.requestedPowerW.map(v => v / 1000),
      dcKW: s.dcPowerW.map(v => v / 1000),
      acKW: s.achievedPowerW.map(v => v / 1000),
      converterLossKW: s.converterLossW.map(v => v / 1000),
      batteryLossKW: s.batteryLossW.map(v => v / 1000),
      auxiliaryKW: s.auxiliaryW.map(v => v / 1000),
    };
  });
  writeFileSync(join(__dirname, 'lesson1.json'), JSON.stringify({ runs }, null, 1));
  // eslint-disable-next-line no-console
  console.log(`wrote validation/lesson1.json — ${runs.length} occasions`);
});
