import type { Config } from '../config/schema';
import type { SizingResult } from '../sizing/engine';

/**
 * The studio's own checks only mean something if the limits they check against are the ones the
 * project actually bought. Left alone the studio carries a 1,500 V placeholder, so it reports the
 * same finding for every project. These derive the equipment window and the usable-AC inputs from
 * the converter and the loss chain the sizing settled on.
 *
 * The studio models one enclosure, so the fleet figures are divided down to a single unit.
 */
export type StudioLimits = { equipment: Config['equipment']; usable: Config['usable']; label: string };

export function limitsFromSizing(sizing: SizingResult): StudioLimits {
  const { pcs } = sizing;
  const units = Math.max(1, sizing.units);
  const fleet = Math.max(1, sizing.totalUnits);

  // Converter current is rated per converter; a container may share one with its neighbours, so the
  // comparable figure is the fleet's DC current capacity divided over the containers it serves.
  const currentPerUnit = pcs.dcMaxA * sizing.pcsCount / fleet;

  return {
    equipment: { maxVoltage: pcs.dcMaxV, minVoltage: pcs.dcMinV, maxCurrent: Math.round(currentPerUnit) },
    usable: {
      soc: clamp(sizing.input.losses.usableDcWindow * sizing.input.dod),
      efficiency: clamp(sizing.dischargePathEfficiency),
      auxKW: round(sizing.auxMWhPerDay * 1000 / 24 / units, 3),
      acKW: round(sizing.ratedPowerMW * 1000 / fleet, 3),
      constantDCKW: null,
    },
    label: `${pcs.model} · ${pcs.dcMinV.toLocaleString()}–${pcs.dcMaxV.toLocaleString()} V, ${Math.round(currentPerUnit).toLocaleString()} A per unit`,
  };
}

const clamp = (n: number) => Math.min(1, Math.max(0.001, round(n, 6)));
const round = (n: number, places: number) => Number(n.toFixed(places));
