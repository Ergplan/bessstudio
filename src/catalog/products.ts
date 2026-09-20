// Equipment catalogue. Figures are indicative platform defaults for concept sizing and must be
// replaced with the supplier data sheet before any figure is issued to a customer.
export type Provenance = 'supplied' | 'indicative' | 'assumed';

export type Cell = {
  id: string; model: string; chemistry: 'LFP' | 'NMC' | 'LTO' | 'Na-ion';
  nominalV: number; ah: number; maxV: number; minV: number;
  thicknessMm: number; widthMm: number; heightMm: number; massKg: number;
  cycleLife: number; cycleLifeRetention: number; calendarYears: number; calendarRetention: number;
  dcEfficiency: number; chargeC: number; dischargeC: number;
  chargeTempC: [number, number]; dischargeTempC: [number, number]; provenance: Provenance;
};

export type PackSpec = { id: string; model: string; cellId: string; series: number; parallel: number; rows: number; columns: number; massKg: number; provenance: Provenance };

export type EnclosureSpec = {
  id: string; model: string; family: 'container' | 'cabinet' | 'skid';
  packSpecId: string; racks: number; packsPerRack: number;
  lengthMm: number; widthMm: number; heightMm: number; massKg: number;
  cooling: 'liquid' | 'air'; ipRating: string; auxKWPerMWh: number;
  dcMaxV: number; dcMinV: number; studioPreset: 'reference' | 'alternative' | null; provenance: Provenance;
};

export type PcsSpec = { id: string; model: string; ratedKW: number; dcMinV: number; dcMaxV: number; dcMaxA: number; efficiency: number; acV: number; topology: 'string' | 'central' | 'hybrid'; provenance: Provenance };
export type TransformerSpec = { id: string; model: string; ratedKVA: number; lvKV: number; hvKV: number; efficiency: number; provenance: Provenance };

export const cells: Cell[] = [
  { id: 'cell-lfp-314', model: 'SB314-LFP', chemistry: 'LFP', nominalV: 3.2, ah: 314, maxV: 3.65, minV: 2.5, thicknessMm: 71.7, widthMm: 174, heightMm: 207, massKg: 5.62, cycleLife: 8000, cycleLifeRetention: 0.8, calendarYears: 20, calendarRetention: 0.9, dcEfficiency: 0.985, chargeC: 0.5, dischargeC: 0.5, chargeTempC: [0, 55], dischargeTempC: [-10, 55], provenance: 'supplied' },
  { id: 'cell-lfp-280', model: 'SB280-LFP', chemistry: 'LFP', nominalV: 3.2, ah: 280, maxV: 3.65, minV: 2.5, thicknessMm: 71.7, widthMm: 174, heightMm: 207, massKg: 5.32, cycleLife: 6000, cycleLifeRetention: 0.8, calendarYears: 20, calendarRetention: 0.88, dcEfficiency: 0.98, chargeC: 0.5, dischargeC: 0.5, chargeTempC: [0, 55], dischargeTempC: [-10, 55], provenance: 'indicative' },
  { id: 'cell-lfp-587', model: 'SB587-LFP', chemistry: 'LFP', nominalV: 3.2, ah: 587, maxV: 3.65, minV: 2.5, thicknessMm: 115, widthMm: 200, heightMm: 218, massKg: 10.4, cycleLife: 10000, cycleLifeRetention: 0.8, calendarYears: 25, calendarRetention: 0.91, dcEfficiency: 0.988, chargeC: 0.5, dischargeC: 0.5, chargeTempC: [0, 55], dischargeTempC: [-20, 55], provenance: 'indicative' },
  { id: 'cell-nmc-120', model: 'NM120-NMC', chemistry: 'NMC', nominalV: 3.7, ah: 120, maxV: 4.2, minV: 2.8, thicknessMm: 45, widthMm: 148, heightMm: 102, massKg: 2.05, cycleLife: 4500, cycleLifeRetention: 0.8, calendarYears: 15, calendarRetention: 0.85, dcEfficiency: 0.975, chargeC: 1, dischargeC: 2, chargeTempC: [0, 45], dischargeTempC: [-20, 55], provenance: 'indicative' },
];

export const packSpecs: PackSpec[] = [
  { id: 'pack-104s', model: 'SB332314', cellId: 'cell-lfp-314', series: 104, parallel: 1, rows: 8, columns: 13, massKg: 660, provenance: 'supplied' },
  { id: 'pack-52s', model: 'SB166314', cellId: 'cell-lfp-314', series: 52, parallel: 1, rows: 4, columns: 13, massKg: 340, provenance: 'indicative' },
  { id: 'pack-96s-587', model: 'SB307587', cellId: 'cell-lfp-587', series: 96, parallel: 1, rows: 8, columns: 12, massKg: 1160, provenance: 'indicative' },
  { id: 'pack-16s-nmc', model: 'NM059120', cellId: 'cell-nmc-120', series: 16, parallel: 1, rows: 2, columns: 8, massKg: 42, provenance: 'indicative' },
];

export const enclosures: EnclosureSpec[] = [
  { id: 'enc-5mwh-20ft', model: 'JW-EC-5015', family: 'container', packSpecId: 'pack-104s', racks: 12, packsPerRack: 4, lengthMm: 12000, widthMm: 3500, heightMm: 2600, massKg: 42000, cooling: 'liquid', ipRating: 'IP55', auxKWPerMWh: 8, dcMaxV: 1500, dcMinV: 1040, studioPreset: 'reference', provenance: 'supplied' },
  { id: 'enc-5mwh-alt', model: 'JW-EC-5015-A', family: 'container', packSpecId: 'pack-104s', racks: 16, packsPerRack: 3, lengthMm: 12200, widthMm: 3500, heightMm: 2600, massKg: 42200, cooling: 'liquid', ipRating: 'IP55', auxKWPerMWh: 8, dcMaxV: 1200, dcMinV: 780, studioPreset: 'alternative', provenance: 'supplied' },
  { id: 'enc-3745-20ft', model: 'JW-EC-3745', family: 'container', packSpecId: 'pack-104s', racks: 9, packsPerRack: 4, lengthMm: 6058, widthMm: 2438, heightMm: 2896, massKg: 32000, cooling: 'liquid', ipRating: 'IP55', auxKWPerMWh: 9, dcMaxV: 1500, dcMinV: 1040, studioPreset: null, provenance: 'indicative' },
  { id: 'enc-cabinet-418', model: 'JW-CB-0418', family: 'cabinet', packSpecId: 'pack-52s', racks: 1, packsPerRack: 8, lengthMm: 1400, widthMm: 1200, heightMm: 2200, massKg: 3600, cooling: 'liquid', ipRating: 'IP54', auxKWPerMWh: 14, dcMaxV: 1500, dcMinV: 1040, studioPreset: null, provenance: 'indicative' },
  { id: 'enc-6mwh-587', model: 'JW-EC-6100', family: 'container', packSpecId: 'pack-96s-587', racks: 10, packsPerRack: 4, lengthMm: 12200, widthMm: 3500, heightMm: 2896, massKg: 48000, cooling: 'liquid', ipRating: 'IP55', auxKWPerMWh: 7, dcMaxV: 1500, dcMinV: 1050, studioPreset: null, provenance: 'indicative' },
  { id: 'enc-skid-nmc', model: 'JW-SK-0250', family: 'skid', packSpecId: 'pack-16s-nmc', racks: 4, packsPerRack: 11, lengthMm: 3200, widthMm: 1600, heightMm: 2100, massKg: 4200, cooling: 'air', ipRating: 'IP44', auxKWPerMWh: 22, dcMaxV: 1000, dcMinV: 600, studioPreset: null, provenance: 'indicative' },
];

export const pcsUnits: PcsSpec[] = [
  { id: 'pcs-2500', model: 'JW-PCS-2500', ratedKW: 2500, dcMinV: 950, dcMaxV: 1500, dcMaxA: 3200, efficiency: 0.9885, acV: 690, topology: 'central', provenance: 'indicative' },
  { id: 'pcs-1725', model: 'JW-PCS-1725', ratedKW: 1725, dcMinV: 900, dcMaxV: 1500, dcMaxA: 2200, efficiency: 0.988, acV: 630, topology: 'central', provenance: 'indicative' },
  { id: 'pcs-630', model: 'JW-PCS-0630', ratedKW: 630, dcMinV: 700, dcMaxV: 1500, dcMaxA: 1000, efficiency: 0.985, acV: 400, topology: 'string', provenance: 'indicative' },
  { id: 'pcs-125', model: 'JW-PCS-0125', ratedKW: 125, dcMinV: 600, dcMaxV: 1000, dcMaxA: 240, efficiency: 0.98, acV: 400, topology: 'string', provenance: 'indicative' },
];

export const transformers: TransformerSpec[] = [
  { id: 'tx-3150', model: 'JW-TX-3150', ratedKVA: 3150, lvKV: 0.69, hvKV: 33, efficiency: 0.994, provenance: 'indicative' },
  { id: 'tx-5000', model: 'JW-TX-5000', ratedKVA: 5000, lvKV: 0.69, hvKV: 33, efficiency: 0.995, provenance: 'indicative' },
  { id: 'tx-1600', model: 'JW-TX-1600', ratedKVA: 1600, lvKV: 0.4, hvKV: 11, efficiency: 0.99, provenance: 'indicative' },
];

export const auxDutyFactor = 0.35;

export const byId = <T extends { id: string }>(list: T[], id: string): T => {
  const found = list.find(x => x.id === id);
  if (!found) throw new Error(`Catalogue entry not found: ${id}`);
  return found;
};
export const cellOf = (spec: PackSpec) => byId(cells, spec.cellId);
export const packOf = (enc: EnclosureSpec) => byId(packSpecs, enc.packSpecId);

/** Nominal DC energy of one pack, kWh, at full cell precision. */
export const packEnergyKWh = (spec: PackSpec) => { const c = cellOf(spec); return c.nominalV * c.ah * spec.series * spec.parallel / 1000; };
/** Nominal DC energy of one enclosure, kWh. */
export const enclosureEnergyKWh = (enc: EnclosureSpec) => packEnergyKWh(packOf(enc)) * enc.racks * enc.packsPerRack;
export const enclosureCellCount = (enc: EnclosureSpec) => { const p = packOf(enc); return p.series * p.parallel * enc.racks * enc.packsPerRack; };
export const enclosureFootprintM2 = (enc: EnclosureSpec) => (enc.lengthMm / 1000) * (enc.widthMm / 1000);
