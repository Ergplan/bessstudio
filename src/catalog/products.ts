// Equipment catalogue. Entries marked `supplied` are transcribed from the Solarworld battery
// product schedule and the Greenko supply offer. Anything marked `indicative` is a platform
// default for concept sizing and must be replaced with the supplier data sheet before issue.
export type Provenance = 'supplied' | 'indicative' | 'assumed';

export type Cell = {
  id: string; model: string; chemistry: 'LFP' | 'NMC' | 'LTO' | 'Na-ion';
  nominalV: number; ah: number; maxV: number; minV: number;
  thicknessMm: number; widthMm: number; heightMm: number; massKg: number;
  /**
   * Cycle life, and the conditions it is quoted at. A cycle-life figure means nothing without the
   * depth of discharge it was tested to: 8 000 cycles at 90% DoD is 7 200 equivalent full cycles,
   * and quoting it against whatever depth a customer happens to operate at both overstates the
   * cell and misrepresents the data sheet.
   */
  cycleLife: number; cycleLifeRetention: number; cycleLifeDod: number;
  calendarYears: number; calendarRetention: number;
  chargeTempC: [number, number]; dischargeTempC: [number, number];
  approvedVendors: string[]; certifications: string[]; provenance: Provenance;
};

export type PackSpec = {
  id: string; model: string; cellId: string; series: number; parallel: number; rows: number; columns: number;
  nominalV: number; maxV: number; minV: number; labelKWh: number;
  continuousA: number; maxA: number; massKg: number;
  certifications: string[]; provenance: Provenance;
};

export type EnclosureSpec = {
  id: string; model: string; family: 'container' | 'cabinet' | 'rack' | 'skid';
  packSpecId: string; racks: number; packsPerRack: number; packsInSeries: number;
  labelKWh: number; ratedKW: number;
  lengthMm: number; widthMm: number; heightMm: number; massKg: number;
  cooling: 'liquid' | 'air'; ipRating: string;
  /** Auxiliary consumption per unit, from the supplied sizing model rather than a rule of thumb. */
  auxMWhPerDayCharge: number; auxMWhPerDayDischarge: number;
  dcMaxV: number; dcMinV: number;
  bms: string; certifications: string[];
  batteryIpRating: string; doorBaysPerSide: number; communications: string;
  operatingRangeC: [number, number]; fireSafety: string;
  studioPreset: 'reference' | 'alternative' | null; provenance: Provenance;
};

export type PcsSpec = { id: string; model: string; ratedKW: number; dcMinV: number; dcMaxV: number; dcMaxA: number; efficiency: number; acV: number; topology: 'string' | 'central' | 'hybrid'; approvedVendors: string[]; provenance: Provenance };
export type TransformerSpec = { id: string; model: string; ratedKVA: number; lvKV: number; hvKV: number; efficiency: number; provenance: Provenance };

const cellVendors = ['Highstar', 'Ganfeng', 'Cornex', 'Cospower'];
const cellCerts = ['UL 1973 or UL 1642', 'IEC 62619 + IEC 63056', 'IS 16270', 'UN 38.3'];
const moduleCerts = ['IS 16270 / IEC 61427-2', 'IEC 62619 & IEC 63056 or UL 1973 or UL 1642', 'UN 38.3'];
const systemCerts = ['UL 9540 or IEC 62933-5-1 + IEC 62933-5-2', 'UL 9540A'];

export const cells: Cell[] = [
  {
    id: 'cell-lfp-314', model: 'LFP 314 Ah prismatic', chemistry: 'LFP',
    nominalV: 3.2, ah: 314, maxV: 3.65, minV: 2.5,
    thicknessMm: 71.7, widthMm: 174, heightMm: 207, massKg: 5.62,
    cycleLife: 8000, cycleLifeRetention: 0.8, cycleLifeDod: 0.9, calendarYears: 20, calendarRetention: 0.9,
    chargeTempC: [0, 55], dischargeTempC: [-10, 55],
    approvedVendors: cellVendors, certifications: cellCerts, provenance: 'supplied',
  },
  {
    id: 'cell-lfp-100', model: 'LFP 100 Ah prismatic', chemistry: 'LFP',
    nominalV: 3.2, ah: 100, maxV: 3.65, minV: 2.5,
    thicknessMm: 36, widthMm: 130, heightMm: 200, massKg: 1.95,
    cycleLife: 6000, cycleLifeRetention: 0.8, cycleLifeDod: 0.9, calendarYears: 15, calendarRetention: 0.88,
    chargeTempC: [0, 55], dischargeTempC: [-10, 55],
    approvedVendors: cellVendors, certifications: cellCerts, provenance: 'supplied',
  },
];

/** Battery packs, as listed in the Solarworld product schedule. */
export const packSpecs: PackSpec[] = [
  { id: 'pack-4s-100', model: 'SB12100', cellId: 'cell-lfp-100', series: 4, parallel: 1, rows: 1, columns: 4, nominalV: 12.8, maxV: 14.6, minV: 10.0, labelKWh: 1.28, continuousA: 50, maxA: 80, massKg: 11.5, certifications: ['IS 16270', 'IEC 62619 or UL 1973', 'UN 38.3'], provenance: 'supplied' },
  { id: 'pack-8s-100', model: 'SB24100', cellId: 'cell-lfp-100', series: 8, parallel: 1, rows: 2, columns: 4, nominalV: 25.6, maxV: 29.2, minV: 20.0, labelKWh: 2.56, continuousA: 50, maxA: 80, massKg: 22, certifications: ['IS 16270', 'IEC 62619 or UL 1973', 'UN 38.3'], provenance: 'supplied' },
  { id: 'pack-16s-100', model: 'SB51100', cellId: 'cell-lfp-100', series: 16, parallel: 1, rows: 2, columns: 8, nominalV: 51.2, maxV: 58.4, minV: 40.0, labelKWh: 5.12, continuousA: 50, maxA: 80, massKg: 42, certifications: ['IS 16270', 'IEC 62619 or UL 1973', 'UN 38.3'], provenance: 'supplied' },
  /**
   * 150 A continuous and 200 A maximum, not the 50 A and 150 A the schedule carried.
   *
   * The schedule's own two figures for this product contradict each other: it rates the cabinet
   * this pack fills at 5 kW, which at 51.2 V is 98 A, against a pack said to sustain 50 A — 2.6 kW.
   * 50 A on a 314 Ah pack is 0.16 C, where every other pack in the same schedule is 0.5 C, and it
   * reads as carried over from the 100 Ah pack it sits beside, for which 50 A is exactly 0.5 C.
   *
   * Checked against the market for this format — 51.2 V, 314 Ah, 16 kWh, 16S1P — because the
   * schedule could not settle it. The standard charge and discharge rate quoted for 314 Ah cells is
   * 0.5 C, which is 157 A; published rack products in this format carry 150 A continuous or a 200 A
   * BMS, and some rate 1 C. Nothing in the format is rated anywhere near 50 A. 150 A is therefore
   * the conservative reading — 0.48 C, in line with the rest of the schedule and at the low end of
   * what the market publishes — and the maximum follows the 200 A BMS that is the commonest
   * fitment. Marked `assumed`: replace both with the supplier's data sheet before issue.
   */
  { id: 'pack-16s-314', model: 'SB51314', cellId: 'cell-lfp-314', series: 16, parallel: 1, rows: 2, columns: 8, nominalV: 51.2, maxV: 58.4, minV: 40.0, labelKWh: 16.076, continuousA: 150, maxA: 200, massKg: 112, certifications: ['IS 16270', 'IEC 62619 or UL 1973', 'UN 38.3'], provenance: 'assumed' },
  { id: 'pack-52s', model: 'SB166314', cellId: 'cell-lfp-314', series: 52, parallel: 1, rows: 4, columns: 13, nominalV: 166.4, maxV: 189.8, minV: 130, labelKWh: 52.25, continuousA: 157, maxA: 157, massKg: 340, certifications: moduleCerts, provenance: 'supplied' },
  { id: 'pack-104s', model: 'SB332314', cellId: 'cell-lfp-314', series: 104, parallel: 1, rows: 8, columns: 13, nominalV: 332.8, maxV: 379.6, minV: 260, labelKWh: 104.45, continuousA: 157, maxA: 157, massKg: 660, certifications: moduleCerts, provenance: 'supplied' },
];

/**
 * Deployable systems. `packsInSeries` is the string depth, so the DC window follows from the pack
 * window rather than being asserted separately.
 */
export const enclosures: EnclosureSpec[] = [
  {
    id: 'enc-5mwh-20ft', model: 'SWESLC1331.2V314Ah', family: 'container', packSpecId: 'pack-104s',
    racks: 12, packsPerRack: 4, packsInSeries: 4, labelKWh: 5015, ratedKW: 2507.5,
    lengthMm: 10444, widthMm: 2532.2, heightMm: 2200, massKg: 42000, cooling: 'liquid', ipRating: 'IP55',
    auxMWhPerDayCharge: 0.5, auxMWhPerDayDischarge: 0.5, dcMaxV: 1518.4, dcMinV: 1040,
    bms: 'Three-level — pack, cluster, rack', certifications: systemCerts,
    batteryIpRating: 'IP67', doorBaysPerSide: 6, communications: 'CAN, RS485, Ethernet',
    operatingRangeC: [-30, 55], fireSafety: 'Multi-stage aerosol suppression, BMS interlocked',
    studioPreset: 'reference', provenance: 'supplied',
  },
  {
    id: 'enc-5mwh-alt', model: 'SWESLC998.4V314Ah', family: 'container', packSpecId: 'pack-104s',
    racks: 16, packsPerRack: 3, packsInSeries: 3, labelKWh: 5015, ratedKW: 2507.5,
    lengthMm: 10444, widthMm: 2532.2, heightMm: 2200, massKg: 42200, cooling: 'liquid', ipRating: 'IP55',
    auxMWhPerDayCharge: 0.5, auxMWhPerDayDischarge: 0.5, dcMaxV: 1138.8, dcMinV: 780,
    bms: 'Three-level — pack, cluster, rack', certifications: systemCerts,
    batteryIpRating: 'IP67', doorBaysPerSide: 6, communications: 'CAN, RS485, Ethernet',
    operatingRangeC: [-30, 55], fireSafety: 'Multi-stage aerosol suppression, BMS interlocked',
    studioPreset: 'alternative', provenance: 'supplied',
  },
  {
    id: 'enc-261-ci', model: 'SWESLC832V314Ah', family: 'cabinet', packSpecId: 'pack-52s',
    racks: 1, packsPerRack: 5, packsInSeries: 5, labelKWh: 261, ratedKW: 125,
    lengthMm: 1400, widthMm: 1200, heightMm: 2200, massKg: 2600, cooling: 'liquid', ipRating: 'IP54',
    auxMWhPerDayCharge: 0.035, auxMWhPerDayDischarge: 0.035, dcMaxV: 949, dcMinV: 650,
    bms: 'BMSer or Simila', certifications: systemCerts,     batteryIpRating: 'IP67', doorBaysPerSide: 2, communications: 'CAN, RS485, Ethernet',
    operatingRangeC: [-20, 55], fireSafety: 'Aerosol suppression, BMS interlocked',
    studioPreset: null, provenance: 'supplied',
  },
  {
    id: 'enc-16-small', model: 'SB51314 cabinet', family: 'rack', packSpecId: 'pack-16s-314',
    racks: 1, packsPerRack: 1, packsInSeries: 1, labelKWh: 16.076, ratedKW: 5,
    lengthMm: 600, widthMm: 400, heightMm: 900, massKg: 130, cooling: 'air', ipRating: 'IP21',
  /**
   * Auxiliary consumption, corrected for a box with no active cooling in it.
   *
   * The schedule gave this rack 4 kWh a day each way — 167 W of continuous standby on a 16 kWh
   * wall battery, a quarter of its nameplate every day, on a product whose only powered parts are
   * a management board and a communications port. It reads as the liquid-cooled figures scaled by
   * energy, which is exactly wrong: what those figures pay for is a chiller and a pump, and an
   * air-cooled rack has neither. Left as it was, the auxiliaries ate a third of a small plant's
   * deliverable energy and bought whole extra enclosures to replace it. A BMS and a display draw
   * of the order of ten watts. Confirm against the product's own standby figure before issue.
   */
    auxMWhPerDayCharge: 0.00024, auxMWhPerDayDischarge: 0.00024, dcMaxV: 58.4, dcMinV: 40,
    bms: 'BMSer or Simila', certifications: ['IS 16270', 'IEC 62619 or UL 1973'],     batteryIpRating: 'IP21', doorBaysPerSide: 1, communications: 'CAN, RS485',
    operatingRangeC: [-10, 45], fireSafety: 'Pack-level detection',
    studioPreset: null, provenance: 'supplied',
  },
  /**
   * The small packs the supplied schedule lists, as deployable systems.
   *
   * The schedule carries SB51100, SB24100 and SB12100 and the catalogue never built an enclosure
   * around any of them, so the smallest thing this studio could propose was a 16 kWh rack. A duty
   * needing six kilowatt-hours of nameplate was therefore answered with sixteen — not a sizing
   * decision, an absence of product. Packaging follows the SB51314 rack it sits beside: one pack,
   * one string, air-cooled, wall or floor mounted. The packs are supplied; how they are cased,
   * cooled and rated as a system is a platform assumption until a system data sheet replaces it.
   */
  {
    id: 'enc-5-small', model: 'SB51100 rack', family: 'rack', packSpecId: 'pack-16s-100',
    racks: 1, packsPerRack: 1, packsInSeries: 1, labelKWh: 5.12, ratedKW: 2.5,
    lengthMm: 480, widthMm: 200, heightMm: 620, massKg: 42, cooling: 'air', ipRating: 'IP21',
    auxMWhPerDayCharge: 0.00012, auxMWhPerDayDischarge: 0.00012, dcMaxV: 58.4, dcMinV: 40,
    bms: 'BMSer or Simila', certifications: ['IS 16270', 'IEC 62619 or UL 1973'],
    batteryIpRating: 'IP21', doorBaysPerSide: 1, communications: 'CAN, RS485',
    operatingRangeC: [-10, 45], fireSafety: 'Pack-level detection',
    studioPreset: null, provenance: 'indicative',
  },
  {
    id: 'enc-2-small', model: 'SB24100 rack', family: 'rack', packSpecId: 'pack-8s-100',
    racks: 1, packsPerRack: 1, packsInSeries: 1, labelKWh: 2.56, ratedKW: 1.25,
    lengthMm: 480, widthMm: 180, heightMm: 400, massKg: 22, cooling: 'air', ipRating: 'IP21',
    auxMWhPerDayCharge: 0.00008, auxMWhPerDayDischarge: 0.00008, dcMaxV: 29.2, dcMinV: 20,
    bms: 'BMSer or Simila', certifications: ['IS 16270', 'IEC 62619 or UL 1973'],
    batteryIpRating: 'IP21', doorBaysPerSide: 1, communications: 'CAN, RS485',
    operatingRangeC: [-10, 45], fireSafety: 'Pack-level detection',
    studioPreset: null, provenance: 'indicative',
  },
  {
    id: 'enc-52-rack', model: 'SB166314 rack', family: 'rack', packSpecId: 'pack-52s',
    racks: 1, packsPerRack: 1, packsInSeries: 1, labelKWh: 52.25, ratedKW: 26,
    lengthMm: 700, widthMm: 600, heightMm: 1400, massKg: 380, cooling: 'air', ipRating: 'IP21',
    // As above: air-cooled, so a management board and comms, not a chiller. 8 kWh a day was 333 W.
    auxMWhPerDayCharge: 0.00036, auxMWhPerDayDischarge: 0.00036, dcMaxV: 189.8, dcMinV: 130,
    bms: 'BMSer or Simila', certifications: moduleCerts,     batteryIpRating: 'IP21', doorBaysPerSide: 1, communications: 'CAN, RS485',
    operatingRangeC: [-10, 45], fireSafety: 'Pack-level detection',
    studioPreset: null, provenance: 'supplied',
  },
];

export const pcsUnits: PcsSpec[] = [
  { id: 'pcs-5000', model: 'PCS 5000 kW', ratedKW: 5000, dcMinV: 1000, dcMaxV: 1500, dcMaxA: 6000, efficiency: 0.9885, acV: 690, topology: 'central', approvedVendors: ['Sungrow', 'Sineng', 'Newen'], provenance: 'supplied' },
  { id: 'pcs-2507', model: 'PCS 2507.5 kW', ratedKW: 2507.5, dcMinV: 1000, dcMaxV: 1500, dcMaxA: 3000, efficiency: 0.985, acV: 690, topology: 'central', approvedVendors: ['Innovance', 'BEELECTRIQ', 'Newen', 'Sungrow', 'Sineng'], provenance: 'supplied' },
  { id: 'pcs-1725', model: 'PCS 1725 kW', ratedKW: 1725, dcMinV: 900, dcMaxV: 1500, dcMaxA: 2200, efficiency: 0.985, acV: 630, topology: 'central', approvedVendors: ['Sungrow', 'Sineng', 'Newen'], provenance: 'indicative' },
  { id: 'pcs-630', model: 'PCS 630 kW', ratedKW: 630, dcMinV: 700, dcMaxV: 1500, dcMaxA: 1000, efficiency: 0.985, acV: 400, topology: 'string', approvedVendors: ['Innovance', 'Sungrow'], provenance: 'indicative' },
  { id: 'pcs-125', model: 'PCS 125 kW', ratedKW: 125, dcMinV: 600, dcMaxV: 1000, dcMaxA: 240, efficiency: 0.98, acV: 400, topology: 'string', approvedVendors: ['Innovance', 'BEELECTRIQ'], provenance: 'supplied' },
  // 5 kW at the bottom of a 40 V window is 129 A after conversion losses, so a 120 A DC limit
  // could not have delivered the rating it was sold at.
  { id: 'pcs-5', model: 'PCS 5 kW hybrid', ratedKW: 5, dcMinV: 40, dcMaxV: 60, dcMaxA: 140, efficiency: 0.97, acV: 230, topology: 'hybrid', approvedVendors: ['Innovance'], provenance: 'indicative' },
];

export const transformers: TransformerSpec[] = [
  { id: 'tx-6300', model: 'IDT 6300 kVA', ratedKVA: 6300, lvKV: 0.69, hvKV: 33, efficiency: 0.99, provenance: 'supplied' },
  { id: 'tx-3150', model: 'IDT 3150 kVA', ratedKVA: 3150, lvKV: 0.69, hvKV: 33, efficiency: 0.99, provenance: 'indicative' },
  { id: 'tx-5000', model: 'IDT 5000 kVA', ratedKVA: 5000, lvKV: 0.69, hvKV: 33, efficiency: 0.99, provenance: 'indicative' },
  { id: 'tx-1600', model: 'IDT 1600 kVA', ratedKVA: 1600, lvKV: 0.4, hvKV: 11, efficiency: 0.99, provenance: 'indicative' },
  // Distribution-class inverter-duty units. Without them the smallest transformer in the catalogue
  // was 1 600 kVA, so a 250 kW plant needing 263 kVA was quoted six times the transformer it wants
  // — ₹37 lakh of iron on a ₹1 crore system, which is not a price anybody would recognise.
  { id: 'tx-1000', model: 'IDT 1000 kVA', ratedKVA: 1000, lvKV: 0.4, hvKV: 11, efficiency: 0.988, provenance: 'indicative' },
  { id: 'tx-500', model: 'IDT 500 kVA', ratedKVA: 500, lvKV: 0.4, hvKV: 11, efficiency: 0.986, provenance: 'indicative' },
];

export const byId = <T extends { id: string }>(list: T[], id: string): T => {
  const found = list.find(x => x.id === id);
  if (!found) throw new Error(`Catalogue entry not found: ${id}`);
  return found;
};
export const cellOf = (spec: PackSpec) => byId(cells, spec.cellId);
export const packOf = (enc: EnclosureSpec) => byId(packSpecs, enc.packSpecId);

/** Nominal DC energy of one pack, kWh, computed from the cell rather than the nameplate label. */
export const packEnergyKWh = (spec: PackSpec) => { const c = cellOf(spec); return c.nominalV * c.ah * spec.series * spec.parallel / 1000; };
/** Nominal DC energy of one system, kWh. */
export const enclosureEnergyKWh = (enc: EnclosureSpec) => packEnergyKWh(packOf(enc)) * enc.racks * enc.packsPerRack;
export const enclosureCellCount = (enc: EnclosureSpec) => { const p = packOf(enc); return p.series * p.parallel * enc.racks * enc.packsPerRack; };
export const enclosureFootprintM2 = (enc: EnclosureSpec) => (enc.lengthMm / 1000) * (enc.widthMm / 1000);
/** Parallel strings in one system, from the rack count and the string depth. */
export const enclosureStrings = (enc: EnclosureSpec) => enc.racks * enc.packsPerRack / enc.packsInSeries;
/** Continuous DC current the system can sustain, from the pack rating and the parallel string count. */
export const enclosureContinuousA = (enc: EnclosureSpec) => packOf(enc).continuousA * enclosureStrings(enc);
/** Discharge rate the pack BMS allows, expressed as a C-rate on the system's own energy. */
export const enclosureCRate = (enc: EnclosureSpec) => {
  const pack = packOf(enc);
  return pack.continuousA / packAh(pack);
};
/** Capacity of one pack, Ah: its cell's capacity times however many sit in parallel. */
export const packAh = (spec: PackSpec) => cellOf(spec).ah * spec.parallel;
