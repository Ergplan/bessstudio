// Application presets seed a sizing run with duty-cycle defaults. Every value stays editable:
// the preset is a starting point for the conversation with the customer, not a specification.
export type ApplicationId =
  | 'peak-shaving' | 'energy-arbitrage' | 'frequency-regulation' | 'solar-shifting'
  | 'backup-power' | 'microgrid' | 'ev-charging-buffer' | 'grid-forming';

export type Application = {
  id: ApplicationId; name: string; summary: string;
  durationH: number; cyclesPerDay: number; daysPerYear: number; dod: number;
  cRate: number; availability: number; responseMs: number;
  revenueModel: 'demand-charge' | 'spread' | 'capacity-payment' | 'self-consumption' | 'reliability' | 'fuel-offset';
  /** Share of discharged energy that must be bought at the import price. Round-trip losses are charged on top. */
  chargeFactor: number;
  keyRisks: string[];
};

export const applications: Application[] = [
  { id: 'peak-shaving', name: 'C&I peak shaving', summary: 'Clips site demand peaks to cut monthly demand charges and contracted-capacity penalties.', durationH: 2, cyclesPerDay: 1, daysPerYear: 250, dod: 0.9, cRate: 0.5, availability: 0.97, responseMs: 200, revenueModel: 'demand-charge', chargeFactor: 1.0, keyRisks: ['Peak forecast accuracy', 'Tariff change risk', 'Metering point definition'] },
  { id: 'energy-arbitrage', name: 'Wholesale energy arbitrage', summary: 'Charges in low-price intervals and discharges into high-price intervals in a day-ahead or real-time market.', durationH: 4, cyclesPerDay: 1.2, daysPerYear: 340, dod: 0.95, cRate: 0.25, availability: 0.97, responseMs: 500, revenueModel: 'spread', chargeFactor: 1.0, keyRisks: ['Price spread compression', 'Throughput warranty limits', 'Market access'] },
  { id: 'frequency-regulation', name: 'Frequency regulation / FCAS', summary: 'High-cycle, shallow-depth response to grid frequency deviations under an ancillary-services contract.', durationH: 1, cyclesPerDay: 6, daysPerYear: 360, dod: 0.4, cRate: 1, availability: 0.98, responseMs: 100, revenueModel: 'capacity-payment', chargeFactor: 0.1, keyRisks: ['Cycle-life consumption', 'Thermal duty at high C-rate', 'Availability penalties'] },
  { id: 'solar-shifting', name: 'Solar shifting / RE firming', summary: 'Stores midday renewable surplus and releases it into the evening ramp; sized against the generation profile.', durationH: 4, cyclesPerDay: 1, daysPerYear: 330, dod: 0.92, cRate: 0.25, availability: 0.96, responseMs: 500, revenueModel: 'self-consumption', chargeFactor: 0.35, keyRisks: ['Curtailment assumptions', 'Co-location export limit', 'Charging from grid restrictions'] },
  { id: 'backup-power', name: 'Backup / UPS resilience', summary: 'Holds reserve energy for outage ride-through; cycled rarely and sized on critical-load duration.', durationH: 8, cyclesPerDay: 0.05, daysPerYear: 365, dod: 0.95, cRate: 0.125, availability: 0.99, responseMs: 20, revenueModel: 'reliability', chargeFactor: 1.0, keyRisks: ['State-of-charge reserve policy', 'Transfer-time coordination', 'Calendar ageing dominates'] },
  { id: 'microgrid', name: 'Microgrid / diesel offset', summary: 'Islanded or weak-grid operation with generator offset and black-start capability.', durationH: 4, cyclesPerDay: 1.5, daysPerYear: 360, dod: 0.9, cRate: 0.5, availability: 0.98, responseMs: 50, revenueModel: 'fuel-offset', chargeFactor: 0.6, keyRisks: ['Grid-forming control scope', 'Generator interaction', 'Fuel price basis'] },
  { id: 'ev-charging-buffer', name: 'EV charging buffer', summary: 'Buffers fast-charger demand so the site can avoid or defer a grid connection upgrade.', durationH: 1.5, cyclesPerDay: 3, daysPerYear: 350, dod: 0.85, cRate: 0.75, availability: 0.97, responseMs: 100, revenueModel: 'demand-charge', chargeFactor: 1.0, keyRisks: ['Charger utilisation profile', 'Simultaneity factor', 'Connection upgrade cost avoided'] },
  { id: 'grid-forming', name: 'Grid-forming / inertia', summary: 'Grid-forming inverter duty providing synthetic inertia and system strength in weak networks.', durationH: 2, cyclesPerDay: 2, daysPerYear: 360, dod: 0.7, cRate: 0.5, availability: 0.98, responseMs: 20, revenueModel: 'capacity-payment', chargeFactor: 0.1, keyRisks: ['Grid-code compliance scope', 'Fault-current contribution', 'Controller validation'] },
];

export const application = (id: ApplicationId) => applications.find(a => a.id === id) ?? applications[0];
