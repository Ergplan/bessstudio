import type { SizingResult } from '../sizing/engine';
import type { FinanceResult } from '../sizing/finance';
import { cellOf, packOf } from '../catalog/products';
import type { Organization, Quote } from '../platform/types';

/**
 * Narrative content of the offer document. Everything here is editable on the quotation; the
 * defaults are derived from the organization, the sizing result and the price book so a usable
 * offer exists the moment a quotation is raised.
 */
export type OfferContent = {
  reference: string; title: string; subtitle: string; configuration: string;
  submittedTo: string; attentionName: string; attentionEmail: string;
  priceBasis: string; manufacturer: string; suppliedThrough: string;
  deliveryPeriod: string; validityDays: number; confidential: boolean;
  highlights: { title: string; body: string }[];
  qualifications: string[];
  interfaces: { name: string; supplier: string; customer: string }[];
  qaStages: { stage: string; control: string; deliverable: string }[];
  approvedMakes: { item: string; make: string; remark: string }[];
  terms: { title: string; body: string }[];
  addOns: { title: string; body: string }[];
  deliveryNote: string; paymentNote: string; acceptanceNote: string;
  coverImage: string | null;
};

const monthYear = (iso: string) => new Date(iso).toLocaleDateString('en', { month: 'long', year: 'numeric' });

export function defaultOfferContent(args: {
  org: Organization; sizing: SizingResult; customerName: string; projectName: string;
  number: string; deliveryWeeks: number; warrantyYears: number; contactName?: string; contactEmail?: string;
}): OfferContent {
  const { org, sizing } = args, b = org.branding, enc = sizing.enclosure;
  const pack = packOf(enc), cell = cellOf(pack);
  const powerMW = sizing.ratedPowerMW, energyMWh = sizing.requiredUsableMWh;
  const delivery = new Date(Date.now() + args.deliveryWeeks * 7 * 864e5).toISOString();

  return {
    reference: args.number,
    title: `${powerMW >= 1 ? powerMW.toFixed(0) : powerMW.toFixed(2)} MW / ${energyMWh >= 10 ? energyMWh.toFixed(0) : energyMWh.toFixed(1)} MWh`,
    subtitle: `${enc.cooling === 'liquid' ? 'Liquid-Cooled' : 'Air-Cooled'} ${cell.chemistry} Battery Energy Storage System`,
    configuration: `${sizing.units} × ${(sizing.installedDcMWh / sizing.units).toFixed(3)} MWh ${enc.cooling}-cooled ${enc.family === 'container' ? 'enclosures' : enc.family + 's'}`,
    submittedTo: args.customerName,
    attentionName: args.contactName ?? '', attentionEmail: args.contactEmail ?? '',
    priceBasis: 'Inclusive of GST, freight delivered at site',
    manufacturer: `${b.legalName || b.displayName}, ${b.address.split(',')[0]}`,
    suppliedThrough: 'Authorised reseller; EMS optional',
    deliveryPeriod: monthYear(delivery),
    validityDays: 15, confidential: true,
    highlights: [
      { title: 'Backward-integrated manufacturer', body: `Cell-to-pack ${cell.chemistry} line and module plant at ${b.address}, supplying its own projects.` },
      { title: 'Proven at utility scale', body: 'Standalone storage and EPC delivered across utility-scale portfolios, with the plant references available on request.' },
      { title: 'Financially secure counterparty', body: 'Listed counterparty with a published order book and audited accounts; financial statements available on request.' },
      { title: 'Single point of accountability', body: 'Manufacturing, supply, commissioning support and warranty under one contract, serviced from the works.' },
    ],
    qualifications: [
      `Figures are derived from the ${b.displayName} BESS sizing model for a single ${(sizing.installedDcMWh / sizing.units).toFixed(3)} MWh enclosure, scaled linearly to ${sizing.units} enclosures.`,
      `Capacity retention follows the modelled degradation curve at ${Math.round(sizing.input.cyclesPerDay * sizing.input.daysPerYear)} cycles per year and the stated operating window.`,
      'Energy supplied to the customer is measured at the AC delivery point after DC cable, conversion, AC cable and transformer losses and after auxiliary consumption.',
      `Charging energy required includes auxiliary consumption during charging. Where charging is from a generating plant over open access, the energy drawn at the generation end is grossed up for open-access losses, taken as ${(sizing.input.losses.openAccessLoss * 100).toFixed(2)}% in the model.`,
      sizing.augmentations.length
        ? `The model includes ${sizing.augmentations.length} augmentation deliveries, in year${sizing.augmentations.length > 1 ? 's' : ''} ${sizing.augmentations.map(a => a.year).join(', ')}. Augmentation supply is priced separately unless stated in the scope.`
        : 'Figures assume no augmentation. Where the plant is to hold its contracted energy across the term, an augmentation programme must be priced separately.',
      'The model is indicative. Guaranteed energy, round-trip efficiency and availability are fixed in a performance annexure agreed before the order.',
    ],
    interfaces: [
      { name: 'DC power', supplier: `Enclosure DC terminals, nominal ${Math.round(pack.nominalV * enc.packsInSeries).toLocaleString()} V`, customer: 'DC cabling to combiner or converter' },
      { name: 'Communication', supplier: `Container controller — ${enc.communications}`, customer: 'Converter controller, plant SCADA, EMS network' },
      { name: 'Auxiliary supply', supplier: 'Terminal block within the enclosure', customer: 'Reliable LV auxiliary supply to each enclosure' },
      { name: 'Fire and safety', supplier: 'Detection and suppression inside the enclosure, volt-free contacts', customer: 'Site fire alarm panel and emergency systems' },
      { name: 'Civil / earthing', supplier: 'Enclosure base frame and earth bosses', customer: 'Foundations, anchoring, earthing grid' },
    ],
    qaStages: [
      { stage: 'Incoming cells', control: 'Capacity, internal resistance and open-circuit voltage banding against OEM acceptance criteria', deliverable: 'Cell qualification record' },
      { stage: 'Pack assembly', control: 'Automated line with in-process checks at welding, insulation and torque stages', deliverable: 'Process inspection record' },
      { stage: 'Pack test', control: 'Capacity, insulation resistance, BMS communication and protection function on every pack', deliverable: 'Pack test certificate' },
      { stage: 'Enclosure FAT', control: 'String voltage, insulation, BMS hierarchy, coolant circuit integrity, fire system function, communication mapping', deliverable: 'Factory acceptance test report' },
      { stage: 'Dispatch', control: 'Packing, marking and transport compliance for lithium batteries', deliverable: 'Packing list, UN 38.3 summary, certificates' },
    ],
    approvedMakes: [
      { item: 'BESS', make: b.displayName, remark: `${enc.cooling === 'liquid' ? 'Liquid-cooled' : 'Air-cooled'} ${Math.round(sizing.installedDcMWh * 1000 / sizing.units).toLocaleString()} kWh enclosure` },
      { item: 'Cell', make: `${cell.ah} Ah prismatic ${cell.chemistry}`, remark: cell.approvedVendors.join(', ') },
      { item: 'BMS', make: `${enc.bms} or equivalent`, remark: 'Pack, cluster and rack level' },
      { item: 'PCS', make: sizing.pcs.approvedVendors.join(', '), remark: 'Final make confirmed at order' },
      { item: 'EMS', make: 'jouleWise', remark: 'Optional add-on' },
      { item: 'After-sales service', make: `${b.displayName} works, ${b.address.split(',')[0]}`, remark: 'Technical support for the installed fleet' },
      { item: 'Warranty', make: `${args.warrantyYears} years`, remark: 'From the date of delivery' },
    ],
    terms: [
      { title: 'Warranty', body: `${args.warrantyYears} years from the date of delivery, covering defects in material and workmanship under normal use. Capacity-retention terms per the warranty certificate. Extended warranty available as an add-on.` },
      { title: 'Warranty exclusions', body: 'Operation outside stated limits, incorrect installation, incompatible converter, bypassed BMS protections, loss of auxiliary supply disabling cooling, unauthorised repair, transit damage after risk passes, force majeure, normal capacity fade and consumables.' },
      { title: 'After-sales', body: 'Technical support for the installed fleet from the works. Remote and telephonic support during installation and commissioning is included; on-site attendance is chargeable unless ordered as an add-on.' },
      { title: 'Title, risk and inspection', body: 'Title passes on receipt of the full contract value. Risk passes on delivery at the named place. Factory acceptance testing on every enclosure; witness inspection on written request at order stage, at the customer’s cost. Visible damage or shortage to be notified within 7 days of delivery.' },
      { title: 'Validity, order and taxes', body: 'This offer is an invitation to order, not a binding contract. A contract arises on written acknowledgement of the purchase order, which must reference this offer. Amendments are effective only when accepted in writing. Any change in statutory duties, levies, tax rate or a movement in the exchange rate beyond the offer validity is to the customer\u2019s account.' },
      { title: 'Liability, law and disputes', body: 'Aggregate liability capped at the order value. No liability for indirect or consequential loss, including loss of production, revenue, energy not delivered, tariff or market loss, or deviation settlement charges. Amicable resolution within 30 days, failing which arbitration by a sole arbitrator, proceedings in English.' },
    ],
    addOns: [
      { title: 'EMS', body: 'dispatch, SoC/SoH analytics, SCADA' },
      { title: 'Installation & commissioning', body: 'supervision or turnkey' },
      { title: 'Transformers & MV switchgear', body: sizing.transformer ? `${sizing.transformer.ratedKVA / 1000} MVA, ${sizing.transformer.hvKV} kV bays` : 'rating to suit the connection' },
      { title: 'Balance of plant', body: 'DC/AC cabling, earthing, anchoring' },
      { title: 'Extended warranty & AMC', body: `beyond ${args.warrantyYears} years, preventive visits` },
      { title: 'Spares & training', body: 'site spares package, operator training' },
    ],
    deliveryNote: `Delivery in ${monthYear(delivery)}, delivered at the named place. Dispatch in tranches to a schedule agreed at order. The programme runs from a technically and commercially clear purchase order with the advance received and drawings approved, and is subject to cell availability and line loading. Part shipment and part invoicing apply. Unloading and storage at site are to the customer’s account.`,
    paymentNote: 'Payment against the agreed milestones. Where a letter of credit applies it is to be irrevocable, established through a scheduled commercial bank, payable at sight against dispatch documents, and valid until 30 days beyond the delivery window. All bank charges within the customer’s country are to the customer’s account. Interest at 1.5% per month on any overdue amount.',
    acceptanceNote: `Please return a signed copy with your purchase order raised on ${b.legalName || b.displayName}, referencing ${args.number}.`,
    coverImage: null,
  };
}

/** Plant-level rollup for the technical page, from the repeating unit up to the contracted rating. */
export function plantConfiguration(sizing: SizingResult) {
  const enc = sizing.enclosure, pack = packOf(enc), cell = cellOf(pack);
  const unitMWh = sizing.installedDcMWh / sizing.units;
  return [
    { sl: 1, parameter: `Cell — prismatic ${cell.chemistry}`, unit: `${cell.nominalV} V / ${cell.ah} Ah = ${(cell.nominalV * cell.ah / 1000).toFixed(3)} kWh`, total: `${sizing.cells.toLocaleString()} cells` },
    { sl: 2, parameter: `Battery pack — ${pack.model}`, unit: `${pack.parallel}P${pack.series}S, ${pack.nominalV} V, ${pack.labelKWh} kWh`, total: `${sizing.packs.toLocaleString()} packs` },
    { sl: 3, parameter: `Enclosure — ${enc.cooling}-cooled ESS`, unit: `${enc.racks * enc.packsPerRack} packs = ${unitMWh.toFixed(3)} MWh`, total: `${sizing.units} enclosures` },
    { sl: 4, parameter: 'Nominal DC power', unit: `${(enc.ratedKW / 1000).toFixed(3)} MW per enclosure`, total: `${(sizing.units * enc.ratedKW / 1000).toFixed(1)} MW` },
    { sl: 5, parameter: 'Nameplate energy at BOL', unit: `${unitMWh.toFixed(3)} MWh per enclosure`, total: `${sizing.installedDcMWh.toFixed(1)} MWh` },
    { sl: 6, parameter: 'Contracted rating', unit: '—', total: `${sizing.ratedPowerMW.toFixed(1)} MW / ${sizing.requiredUsableMWh.toFixed(0)} MWh` },
    { sl: 7, parameter: 'Duration / C-rate', unit: `${sizing.effectiveDurationH.toFixed(1)} hours`, total: `${sizing.packCRate.toFixed(2)} C charge / ${sizing.packCRate.toFixed(2)} C discharge` },
    { sl: 8, parameter: 'Enclosure footprint', unit: `${(enc.lengthMm / 1000).toFixed(3)} × ${(enc.widthMm / 1000).toFixed(3)} m = ${(enc.lengthMm * enc.widthMm / 1e6).toFixed(1)} m²`, total: `≈ ${Math.round(sizing.footprintM2).toLocaleString()} m² enclosure footprint` },
    { sl: 9, parameter: 'Power conversion', unit: `${sizing.pcs.model}`, total: `${sizing.pcsCount} × ${(sizing.pcs.ratedKW / 1000).toFixed(3)} MW` },
    ...(sizing.transformer ? [{ sl: 10, parameter: 'LV/MV transformer', unit: `${(sizing.transformer.ratedKVA / 1000).toFixed(1)} MVA, ${sizing.transformer.lvKV} / ${sizing.transformer.hvKV} kV`, total: `${sizing.transformerCount} units` }] : []),
  ];
}

/** Twenty-year table for the energy page, in the columns the issued proposal uses. */
export const energySchedule = (sizing: SizingResult) => sizing.years.map(y => ({
  year: y.year, cycles: y.year === 0 ? null : Math.round(sizing.input.cyclesPerDay * sizing.input.daysPerYear),
  retention: y.retention, storedMWh: y.storedDcMWh,
  usablePerCycleMWh: y.usableMWh, suppliedGWh: y.deliveredMWh / 1000, chargingGWh: y.gridChargeMWh / 1000,
}));

export const offerTotals = (sizing: SizingResult) => {
  const rows = energySchedule(sizing).filter(r => r.year > 0);
  return {
    cycles: rows.reduce((s, r) => s + (r.cycles ?? 0), 0),
    suppliedGWh: rows.reduce((s, r) => s + r.suppliedGWh, 0),
    chargingGWh: rows.reduce((s, r) => s + r.chargingGWh, 0),
  };
};

/** Offer content for a quotation, falling back to the defaults for anything not yet edited. */
export const offerOf = (quote: Quote, fallback: OfferContent): OfferContent =>
  ({ ...fallback, ...((quote as Quote & { offer?: Partial<OfferContent> }).offer ?? {}) });

export type { FinanceResult };
