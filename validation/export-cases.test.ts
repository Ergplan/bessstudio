import { describe, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  defaultSizingInput, sizeSystem, recoveryHours, retentionAt, retentionFromTable,
  cellTemperature, temperatureFactor, suppliedRetention, AGEING_DOUBLING_K,
} from '../src/sizing/engine';
import { packOf, cellOf, enclosureEnergyKWh, enclosureStrings, enclosureCRate } from '../src/catalog/products';
import type { ApplicationId } from '../src/sizing/applications';

/**
 * The studio's own answers, in a form an independent model can be asked the same questions in.
 *
 * Not a test: a writer. `npm run validate` runs this, then puts the same cases through NREL's SAM
 * via PySAM and reports where the two disagree. Kept out of `npm test` because SAM is a 47 MB
 * optional dependency and a suite that needs one is a suite people learn to skip.
 */
const YEARS = [1, 5, 10, 15, 20];

const duties: [string, number, number, ApplicationId][] = [
  ['5 kW backup, 1 h', 0.005, 1, 'backup-power'],
  ['50 kW peak shaving, 2 h', 0.05, 2, 'peak-shaving'],
  ['250 kW peak shaving, 2 h', 0.25, 2, 'peak-shaving'],
  ['2.5 MW solar shifting, 4 h', 2.5, 4, 'solar-shifting'],
  ['10 MW arbitrage, 4 h', 10, 4, 'energy-arbitrage'],
  ['20 MW frequency regulation, 1 h', 20, 1, 'frequency-regulation'],
];

describe('validation cases', () => {
  it('writes what the studio says, for SAM to be asked the same', () => {
    const cases = duties.map(([label, powerMW, durationH, applicationId]) => {
      const base = defaultSizingInput(applicationId);
      const s = sizeSystem({
        ...base, mode: 'power-duration', powerMW, durationH,
        chargeDurationH: recoveryHours(durationH, base.losses),
      });
      const enc = s.enclosure, pack = packOf(enc), cell = cellOf(pack), L = s.input.losses;
      const cellsInSeries = pack.series * enc.packsInSeries;
      const strings = enclosureStrings(enc);
      const unitKWh = enclosureEnergyKWh(enc);
      const tempFactor = temperatureFactor(cellTemperature(s.input.ambientC, enc.cooling));

      return {
        id: label.split(',')[0].replace(/\W+/g, '-').toLowerCase(),
        label,
        duty: {
          powerMW, durationH, applicationId,
          contractedUsableKWh: s.requiredUsableMWh * 1000,
          cyclesPerDay: s.input.cyclesPerDay, daysPerYear: s.input.daysPerYear,
          projectYears: s.input.projectYears,
        },
        /** The plant the studio chose, so SAM is given the same equipment rather than a generic one. */
        plant: {
          enclosureId: enc.id, enclosureModel: enc.model, units: s.units,
          pcsModel: s.pcs.model, pcsCount: s.pcsCount,
          unitNominalKWh: unitKWh,
          unitNominalVoltageV: cell.nominalV * cellsInSeries,
          unitRatedKW: enc.ratedKW,
          cellsInSeries, stringsInParallel: strings,
          cell: {
            id: cell.id, chemistry: cell.chemistry, nominalV: cell.nominalV, ah: cell.ah,
            maxV: cell.maxV, minV: cell.minV,
            cycleLife: cell.cycleLife, cycleLifeRetention: cell.cycleLifeRetention,
            cycleLifeDod: cell.cycleLifeDod, calendarYears: cell.calendarYears,
            calendarRetention: cell.calendarRetention,
          },
        },
        /** Every assumption SAM has to be given so the two are answering the same question. */
        conditions: {
          ambientC: s.input.ambientC, cellTempC: s.cellTempC, tempFactor,
          dod: s.input.dod, usableDcWindow: L.usableDcWindow,
          /** SAM works in state of charge; the studio's window and depth become a SOC band. */
          maxSoc: 100 * (0.5 + L.usableDcWindow / 2),
          minSoc: 100 * (0.5 + L.usableDcWindow / 2 - L.usableDcWindow * s.input.dod),
          systemCRate: s.systemCRate, packCRate: enclosureCRate(enc),
          efcPerYear: s.efcPerYear, ageingDoublingK: AGEING_DOUBLING_K,
        },
        /** What the studio says, in the units SAM reports. */
        studio: {
          /** DC energy between the window limits, per enclosure, before the conversion path. */
          storedDcKWh: unitKWh * L.usableDcWindow * s.input.dod,
          /** Taken from the supplied sheet rather than computed: the figure under test. */
          dcRoundTrip: L.chargeEfficiencyDc * L.dischargeEfficiencyDc,
          acRoundTrip: s.rteAc,
          /** The flat rate limit the studio applies, as power for one enclosure. */
          dischargeableKW: enclosureCRate(enc) * unitKWh,
          retentionModel: Object.fromEntries(YEARS.map(y => [y, retentionAt(y, s.efcPerYear, cell, tempFactor)])),
          retentionSupplied: Object.fromEntries(YEARS.map(y => [y, retentionFromTable(y, suppliedRetention)])),
          basis: s.input.degradation.mode,
        },
      };
    });

    const out = { years: YEARS, generatedFrom: 'src/sizing/engine.ts', cases };
    writeFileSync(join(import.meta.dirname, 'cases.json'), JSON.stringify(out, null, 2) + '\n');
    process.stdout.write(`\nwrote validation/cases.json — ${cases.length} cases\n`);
  });
});
