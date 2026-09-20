import { repository } from './repo';
import { defaultPriceBook } from '../catalog/pricing';
import { defaultSizingInput, sizeSystem } from '../sizing/engine';
import { evaluateFinance } from '../sizing/finance';
import { createQuote, nextQuoteNumber } from '../quoting/quote';
import { nowIso, type Activity, type Customer, type Member, type Project, type Segment, type CustomerStage } from './types';

type Sketch = {
  name: string; segment: Segment; stage: CustomerStage; country: string; city: string; website: string;
  contact: { name: string; title: string; email: string; phone: string };
  project: { name: string; reference: string; location: string; gridOperator: string; commissioningTarget: string };
  sizing: Partial<ReturnType<typeof defaultSizingInput>>;
  quote: boolean;
};

/** Reference pipeline used for demonstrations and for a first-run workspace. */
const sketches: Sketch[] = [
  {
    name: 'Rajasthan Renewable Power', segment: 'utility', stage: 'proposal', country: 'India', city: 'Bikaner', website: 'https://example.com',
    contact: { name: 'A. Menon', title: 'Head of Engineering', email: 'engineering@example.com', phone: '+91 98100 00001' },
    project: { name: 'Bikaner 20 MWh solar firming', reference: 'RRP-BES-01', location: 'Bikaner, Rajasthan', gridOperator: 'RVPN', commissioningTarget: '2027-03-31' },
    sizing: { applicationId: 'solar-shifting', powerMW: 5, durationH: 4, ambientC: 45, gridKV: 33, projectYears: 20, augmentation: 'periodic' }, quote: true,
  },
  {
    name: 'Northgate Data Centres', segment: 'data-centre', stage: 'qualified', country: 'United Kingdom', city: 'Slough', website: 'https://example.com',
    contact: { name: 'J. Whitfield', title: 'Critical Power Manager', email: 'power@example.com', phone: '+44 20 7946 0001' },
    project: { name: 'Slough campus grid buffer', reference: 'NDC-BES-02', location: 'Slough, Berkshire', gridOperator: 'SSEN', commissioningTarget: '2027-09-30' },
    sizing: { applicationId: 'backup-power', powerMW: 2.5, durationH: 8, ambientC: 25, gridKV: 11, projectYears: 15, augmentation: 'oversize-day1' }, quote: true,
  },
  {
    name: 'Atacama Mining Group', segment: 'mining', stage: 'negotiation', country: 'Chile', city: 'Calama', website: 'https://example.com',
    contact: { name: 'C. Rivas', title: 'Energy Director', email: 'energia@example.com', phone: '+56 2 2345 0001' },
    project: { name: 'Calama diesel offset microgrid', reference: 'AMG-BES-03', location: 'Calama, Antofagasta', gridOperator: 'Islanded', commissioningTarget: '2027-06-30' },
    sizing: { applicationId: 'microgrid', powerMW: 10, durationH: 4, ambientC: 32, altitudeM: 2260, gridKV: 33, projectYears: 20, augmentation: 'periodic' }, quote: false,
  },
  {
    name: 'Volt Mobility Charging', segment: 'commercial', stage: 'lead', country: 'United Arab Emirates', city: 'Dubai', website: 'https://example.com',
    contact: { name: 'S. Haddad', title: 'Network Operations', email: 'ops@example.com', phone: '+971 4 123 0001' },
    project: { name: 'Jebel Ali fast-charge buffer', reference: 'VMC-BES-04', location: 'Jebel Ali, Dubai', gridOperator: 'DEWA', commissioningTarget: '2026-12-31' },
    sizing: { applicationId: 'ev-charging-buffer', powerMW: 1.5, durationH: 1.5, ambientC: 48, gridKV: 11, projectYears: 12, augmentation: 'oversize-day1' }, quote: false,
  },
  {
    name: 'Baltic Grid Services', segment: 'developer', stage: 'won', country: 'Lithuania', city: 'Vilnius', website: 'https://example.com',
    contact: { name: 'R. Kazlauskas', title: 'Portfolio Manager', email: 'portfolio@example.com', phone: '+370 5 210 0001' },
    project: { name: 'Vilnius FCR-N package', reference: 'BGS-BES-05', location: 'Vilnius', gridOperator: 'Litgrid', commissioningTarget: '2027-01-31' },
    sizing: { applicationId: 'frequency-regulation', powerMW: 8, durationH: 1, ambientC: 22, gridKV: 33, projectYears: 15, augmentation: 'periodic' }, quote: true,
  },
];

export async function seedOrganization(orgId: string, member: Member) {
  const repo = repository();
  if ((await repo.list(orgId, 'customers')).length) return;
  const priceBook = (await repo.getSettings(orgId))?.priceBook ?? defaultPriceBook;
  const quotes = [];
  const ageDays = (n: number) => new Date(Date.now() - n * 864e5).toISOString();

  for (const [i, s] of sketches.entries()) {
    const at = ageDays(sketches.length * 6 - i * 6);
    const customer: Customer = {
      id: `cus_seed_${i + 1}`, orgId, name: s.name, segment: s.segment, stage: s.stage, country: s.country, city: s.city,
      website: s.website, notes: 'Seeded reference record. Replace with the live opportunity.',
      contacts: [{ id: `con_seed_${i + 1}`, ...s.contact, primary: true }],
      ownerUid: member.uid, ownerName: member.displayName, createdAt: at, updatedAt: at,
    };
    const sizing = { ...defaultSizingInput(), ...s.sizing };
    const project: Project = {
      id: `prj_seed_${i + 1}`, orgId, customerId: customer.id, customerName: customer.name,
      name: s.project.name, reference: s.project.reference,
      status: s.stage === 'won' ? 'awarded' : s.quote ? 'quoted' : 'sizing',
      site: { location: s.project.location, latitude: null, longitude: null, gridOperator: s.project.gridOperator, commissioningTarget: s.project.commissioningTarget },
      sizing, studioConfig: null, notes: '', createdAt: at, updatedAt: at, updatedBy: member.displayName,
    };
    await repo.save(orgId, 'customers', customer);
    await repo.save(orgId, 'projects', project);

    if (s.quote) {
      const result = sizeSystem(sizing), finance = evaluateFinance(result, priceBook);
      const quote = createQuote({
        orgId, customer, project, sizing: result, finance, priceBook, currency: priceBook.currency,
        number: nextQuoteNumber(quotes), preparedBy: member.displayName, preparedByEmail: member.email,
      });
      quote.status = s.stage === 'won' ? 'won' : 'sent';
      quote.sentAt = at; quote.createdAt = at; quote.updatedAt = at;
      quotes.push(quote);
      await repo.save(orgId, 'quotes', quote);
    }

    const activity: Activity = {
      id: `act_seed_${i + 1}`, orgId, refType: 'customer', refId: customer.id, refName: customer.name,
      kind: 'created', message: `${customer.name} added to the pipeline at stage ${customer.stage}.`,
      actorUid: member.uid, actorName: member.displayName, at,
    };
    await repo.save(orgId, 'activities', activity);
  }
}
