import { useEffect, useState } from 'react';
import { Card, Tabs, TextInput, NumberInput, SelectInput, Slider, Badge, KV, Field } from '../components/ui';
import { useSession } from '../../platform/auth';
import { useWorkspace } from '../../platform/workspace';
import { repository, usingFirestore } from '../../platform/repo';
import { can, roles, type Member, type Role } from '../../platform/types';
import {
  currencies, defaultLandedCost, landedCost, formatMoney,
  type ChargeSource, type CostingMode, type Currency, type PriceBook, type SupplyScope,
} from '../../catalog/pricing';
import { enclosures, pcsUnits, enclosureEnergyKWh, byId } from '../../catalog/products';
import { brand } from '../../brand/brand';

type Tab = 'branding' | 'pricing' | 'team' | 'platform';

export function Settings() {
  const { org, role, refreshOrg, user, mode } = useSession();
  const { priceBook, savePriceBook } = useWorkspace();
  const [tab, setTab] = useState<Tab>('branding');
  const [members, setMembers] = useState<Member[]>([]);
  const [draft, setDraft] = useState<PriceBook>(priceBook);
  const manage = can(role, 'org.manage');

  useEffect(() => setDraft(priceBook), [priceBook]);
  useEffect(() => { if (org) void repository().listMembers(org.id).then(setMembers); }, [org]);

  if (!org) return null;
  const b = org.branding;
  const setBrand = async (patch: Partial<typeof b>) => {
    await repository().saveOrganization({ ...org, branding: { ...b, ...patch } });
    await refreshOrg();
  };
  const setCurrency = async (currency: Currency) => {
    await repository().saveOrganization({ ...org, currency });
    await savePriceBook({ ...draft, currency });
    await refreshOrg();
  };

  return (
    <div className="grid" style={{ gap: 16 }}>
      <Tabs<Tab> active={tab} onChange={setTab} tabs={[
        { id: 'branding', label: 'Branding' }, { id: 'pricing', label: 'Price book' },
        { id: 'team', label: 'Team & roles' }, { id: 'platform', label: 'Platform' }]} />

      {tab === 'branding' && (
        <div className="grid cols-2">
          <Card title="Organization identity" subtitle="Used on the application shell and every customer-facing proposal">
            <TextInput label="Display name" value={b.displayName} onChange={displayName => void setBrand({ displayName })} />
            <TextInput label="Legal name" value={b.legalName} onChange={legalName => void setBrand({ legalName })} />
            <TextInput label="Logo URL" value={b.logo ?? ''} onChange={logo => void setBrand({ logo: logo || null })} hint="A path under /brand or any https image URL." />
            <div className="grid cols-2" style={{ gap: 0, columnGap: 12 }}>
              <Field label="Primary colour"><input type="color" value={b.primary} onChange={e => void setBrand({ primary: e.target.value })} /></Field>
              <Field label="Accent colour"><input type="color" value={b.accent} onChange={e => void setBrand({ accent: e.target.value })} /></Field>
            </div>
            <TextInput label="Website" value={b.website} onChange={website => void setBrand({ website })} />
            <TextInput label="Email" value={b.email} onChange={email => void setBrand({ email })} />
            <TextInput label="Phone" value={b.phone} onChange={phone => void setBrand({ phone })} />
            <TextInput label="Address" value={b.address} onChange={address => void setBrand({ address })} />
          </Card>
          <Card title="Preview">
            <div style={{ border: '1px solid var(--line)', borderRadius: 12, overflow: 'hidden' }}>
              <div style={{ background: b.primary, padding: '18px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
                {b.logo && <img src={b.logo} alt="" style={{ height: 38, background: '#fff', borderRadius: 8, padding: 4 }} />}
                <div><b style={{ color: '#fff', fontSize: 15 }}>{b.displayName}</b><br /><small style={{ color: '#ffffffaa', fontSize: 11 }}>{brand.platform}</small></div>
              </div>
              <div style={{ height: 4, background: b.accent }} />
              <div style={{ padding: 16 }}>
                <KV label="Legal name">{b.legalName}</KV>
                <KV label="Contact">{b.email}</KV>
                <KV label="Quote currency">{org.currency}</KV>
              </div>
            </div>
            <p className="muted" style={{ marginTop: 14 }}>
              The {brand.vendor} credit is shown on the application and on every proposal footer.
            </p>
          </Card>
        </div>
      )}

      {tab === 'pricing' && (
        <div className="grid cols-3">
          <Card title="Landed cost build-up" subtitle="Import basis taken from the supply offer">
            <SelectInput label="Costing basis" value={draft.costingMode}
              options={[{ value: 'landed-import', label: 'Landed import — FOB, duty and clearance' }, { value: 'direct', label: 'Direct price book — rate per kWh' }]}
              onChange={costingMode => setDraft({ ...draft, costingMode: costingMode as CostingMode })} />
            <SelectInput label="Scope of supply" value={draft.supplyScope}
              options={[{ value: 'supply-only', label: 'Supply only — equipment delivered' }, { value: 'turnkey', label: 'Turnkey — with civil, installation and commissioning' }]}
              onChange={supplyScope => setDraft({ ...draft, supplyScope: supplyScope as SupplyScope })} />
            {draft.costingMode === 'landed-import' && <>
              <Slider label="Basic price, FOB" value={draft.landed.basicPriceUsdPerKWh} min={30} max={200} step={1} unit="$/kWh"
                onChange={basicPriceUsdPerKWh => setDraft({ ...draft, landed: { ...draft.landed, basicPriceUsdPerKWh } })} />
              <Slider label="Ocean freight" value={draft.landed.oceanFreightPct} min={0} max={10} step={0.1} decimals={1} unit="%"
                onChange={oceanFreightPct => setDraft({ ...draft, landed: { ...draft.landed, oceanFreightPct } })} hint="Percentage of FOB value." />
              <Slider label="Exchange rate" value={draft.landed.exchangeRateInrPerUsd} min={60} max={140} step={0.25} decimals={2} unit="₹/$"
                onChange={exchangeRateInrPerUsd => setDraft({ ...draft, landed: { ...draft.landed, exchangeRateInrPerUsd } })} />
              <Slider label="Customs duty" value={draft.landed.customsDutyPct} min={0} max={40} step={0.5} decimals={1} unit="%"
                onChange={customsDutyPct => setDraft({ ...draft, landed: { ...draft.landed, customsDutyPct } })} hint="Applied to the CIF value in local currency." />
              <Slider label="Inland freight and clearance" value={draft.landed.inlandClearancePct} min={0} max={10} step={0.1} decimals={1} unit="%"
                onChange={inlandClearancePct => setDraft({ ...draft, landed: { ...draft.landed, inlandClearancePct } })} />
              <Slider label="Power conversion" value={draft.landed.pcsCostInrPerKW} min={200} max={4000} step={10} unit="₹/kW"
                onChange={pcsCostInrPerKW => setDraft({ ...draft, landed: { ...draft.landed, pcsCostInrPerKW } })} />
              <button className="btn sm" onClick={() => setDraft({ ...draft, landed: defaultLandedCost() })}>Reset to offer basis</button>
              {(() => {
                const reference = byId(enclosures, 'enc-5mwh-20ft');
                const b = landedCost(draft.landed, enclosureEnergyKWh(reference), reference.ratedKW);
                const inr = (n: number) => formatMoney(n, 'INR', true);
                return (
                  <div style={{ marginTop: 14 }}>
                    <h4 style={{ fontSize: 11.5, marginBottom: 6 }}>One {reference.model}, {(b.kWh / 1000).toFixed(3)} MWh</h4>
                    <KV label="FOB">{formatMoney(b.fobUsd, 'USD', true)}</KV>
                    <KV label="CIF">{formatMoney(b.cifUsd, 'USD', true)} · {inr(b.cifInr)}</KV>
                    <KV label="Customs duty">{inr(b.customsDutyInr)}</KV>
                    <KV label="Inland clearance">{inr(b.inlandClearanceInr)}</KV>
                    <KV label="Delivered">{inr(b.deliveredInr)}</KV>
                    <KV label="Power conversion">{inr(b.pcsInr)}</KV>
                    <KV label="Total">{inr(b.totalInr)}</KV>
                    <KV label="Rate">₹{Math.round(b.totalInrPerKWh).toLocaleString()} / kWh · ${b.totalUsdPerKWh.toFixed(2)} / kWh</KV>
                  </div>
                );
              })()}
            </>}
          </Card>

          <Card title="Commercial rates" subtitle="Applied to every new quotation">
            <SelectInput label="Quotation currency" value={org.currency} options={(Object.keys(currencies) as Currency[]).map(c => ({ value: c, label: `${c} — ${currencies[c].name}` }))} onChange={c => void setCurrency(c)} />
            <NumberInput label="Margin" value={draft.marginPct} unit="%" min={0} max={60} step={0.5} onChange={marginPct => setDraft({ ...draft, marginPct })} />
            <NumberInput label="Contingency" value={draft.contingencyPct} unit="%" min={0} max={25} step={0.5} onChange={contingencyPct => setDraft({ ...draft, contingencyPct })} />
            <NumberInput label="Default tax" value={draft.taxPct} unit="%" min={0} max={40} step={0.5} onChange={taxPct => setDraft({ ...draft, taxPct })} />
            <NumberInput label="Discount rate" value={draft.discountRatePct} unit="%" min={0} max={30} step={0.25} onChange={discountRatePct => setDraft({ ...draft, discountRatePct })} />
            <NumberInput label="Inflation" value={draft.inflationPct} unit="%" min={0} max={25} step={0.25} onChange={inflationPct => setDraft({ ...draft, inflationPct })} />
            <NumberInput label="Battery price decline" value={draft.batteryPriceDeclinePct} unit="%/yr" min={0} max={20} step={0.5} onChange={batteryPriceDeclinePct => setDraft({ ...draft, batteryPriceDeclinePct })} />
          </Card>
          <Card title="Direct equipment rates" subtitle={draft.costingMode === 'landed-import' ? 'Not in use while the landed build-up is selected' : 'USD basis, converted at quotation time'}>
            {enclosures.map(e => (
              <NumberInput key={e.id} label={`${e.model}`} value={draft.batteryPerKWh[e.id] ?? 110} unit="$/kWh" min={20} max={600}
                onChange={v => setDraft({ ...draft, batteryPerKWh: { ...draft.batteryPerKWh, [e.id]: v } })} />
            ))}
            {pcsUnits.map(p => (
              <NumberInput key={p.id} label={`${p.model}`} value={draft.pcsPerKW[p.id] ?? 45} unit="$/kW" min={5} max={400}
                onChange={v => setDraft({ ...draft, pcsPerKW: { ...draft.pcsPerKW, [p.id]: v } })} />
            ))}
          </Card>
          <Card title="Services, operations and energy">
            <NumberInput label="Balance of plant" value={draft.bopPerKW} unit="$/kW" min={0} max={300} onChange={bopPerKW => setDraft({ ...draft, bopPerKW })} />
            <NumberInput label="Installation" value={draft.epcPerKWh} unit="$/kWh" min={0} max={200} onChange={epcPerKWh => setDraft({ ...draft, epcPerKWh })} />
            <NumberInput label="Civil works" value={draft.civilPerM2} unit="$/m²" min={0} max={2000} step={10} onChange={civilPerM2 => setDraft({ ...draft, civilPerM2 })} />
            <NumberInput label="Freight per unit" value={draft.freightPerUnit} unit="$" min={0} max={200000} step={250} onChange={freightPerUnit => setDraft({ ...draft, freightPerUnit })} />
            <NumberInput label="Operations & maintenance" value={draft.omPerKWYear} unit="$/kW·yr" min={0} max={80} step={0.5} onChange={omPerKWYear => setDraft({ ...draft, omPerKWYear })} />
            <SelectInput label="Charging energy source" value={draft.chargeSource}
              options={[{ value: 'grid', label: 'Grid import at the tariff' }, { value: 'open-access-solar', label: 'Open access from a solar plant' }]}
              onChange={chargeSource => setDraft({ ...draft, chargeSource: chargeSource as ChargeSource })} />
            {draft.chargeSource === 'open-access-solar'
              ? <NumberInput label="Solar PPA price" value={draft.solarPpaPerMWh} unit="$/MWh" min={0} max={400} onChange={solarPpaPerMWh => setDraft({ ...draft, solarPpaPerMWh })}
                  hint="Charging energy is grossed up for the project's wheeling losses before it is priced." />
              : null}
            <NumberInput label="Energy import price" value={draft.energyBuyPerMWh} unit="$/MWh" min={0} max={600} onChange={energyBuyPerMWh => setDraft({ ...draft, energyBuyPerMWh })} />
            <NumberInput label="Energy export price" value={draft.energySellPerMWh} unit="$/MWh" min={0} max={2000} onChange={energySellPerMWh => setDraft({ ...draft, energySellPerMWh })} />
            <NumberInput label="Demand charge" value={draft.demandChargePerKWMonth} unit="$/kW·mo" min={0} max={200} step={0.5} onChange={demandChargePerKWMonth => setDraft({ ...draft, demandChargePerKWMonth })} />
            <NumberInput label="Capacity payment" value={draft.capacityPaymentPerKWYear} unit="$/kW·yr" min={0} max={500} onChange={capacityPaymentPerKWYear => setDraft({ ...draft, capacityPaymentPerKWYear })} />
            <div className="row" style={{ marginTop: 12 }}>
              <button className="btn accent" disabled={!can(role, 'pricebook.write')} onClick={() => void savePriceBook({ ...draft, updatedAt: new Date().toISOString().slice(0, 10) })}>Save price book</button>
              <button className="btn" onClick={() => setDraft(priceBook)}>Revert</button>
            </div>
          </Card>
        </div>
      )}

      {tab === 'team' && (
        <div className="grid cols-2">
          <Card title="Members" subtitle={`${members.length} member${members.length === 1 ? '' : 's'} in ${org.name}`} tight>
            <table className="data">
              <thead><tr><th>Member</th><th>Email</th><th>Role</th></tr></thead>
              <tbody>{members.map(m => (
                <tr key={m.uid}><td><b>{m.displayName}</b>{m.uid === user?.uid && <Badge tone="info">You</Badge>}</td><td className="muted">{m.email}</td>
                  <td>{manage && m.uid !== user?.uid
                    ? <select value={m.role} aria-label={`Role for ${m.displayName}`} onChange={async e => { const next = { ...m, role: e.target.value as Role }; await repository().saveMember(org.id, next); setMembers(list => list.map(x => (x.uid === m.uid ? next : x))); }}
                        style={{ padding: '4px 8px', border: '1px solid var(--line)', borderRadius: 6, fontSize: 12.5 }}>
                        {roles.map(r => <option key={r} value={r}>{r}</option>)}
                      </select>
                    : <Badge tone={m.role === 'owner' ? 'good' : 'neutral'}>{m.role}</Badge>}</td></tr>
              ))}</tbody>
            </table>
          </Card>
          <Card title="What each role can do">
            <KV label="Owner / admin">Everything, including branding, price book and member roles</KV>
            <KV label="Engineer">Customers, projects, sizing and quotations</KV>
            <KV label="Sales">Customers, projects and quotations</KV>
            <KV label="Viewer">Read-only access to the whole workspace</KV>
            <p className="muted" style={{ marginTop: 12 }}>
              {usingFirestore()
                ? 'Invite a colleague by having them sign up with their work email, then add their account to this organization in the Firebase console. Security rules check membership on every read and write.'
                : 'Member management becomes available once a Firebase project is configured. The demo workspace runs as a single owner.'}
            </p>
          </Card>
        </div>
      )}

      {tab === 'platform' && (
        <div className="grid cols-2">
          <Card title="Deployment">
            <KV label="Data store">{mode === 'firestore' ? 'Cloud Firestore' : 'Browser local storage (demo)'}</KV>
            <KV label="Organization id"><span className="mono">{org.id}</span></KV>
            <KV label="Plan"><span style={{ textTransform: 'capitalize' }}>{org.plan}</span></KV>
            <KV label="Price book">{priceBook.name} · {priceBook.updatedAt}</KV>
            <p className="muted" style={{ marginTop: 12 }}>
              {mode === 'firestore'
                ? 'Every customer, project, quotation and activity entry is stored under this organization document in Firestore.'
                : 'Set the VITE_FIREBASE_* environment variables and redeploy to move this workspace into Firestore. Until then all records stay in this browser.'}
            </p>
          </Card>
          <Card title="About">
            <img src={brand.wordmark} alt={brand.vendor} style={{ height: 30, marginBottom: 12 }} />
            <p className="muted">{brand.platform} — {brand.tagline}.</p>
            <p className="muted" style={{ marginTop: 10 }}>{brand.creditLong}</p>
            <p className="muted" style={{ marginTop: 10 }}><a href={brand.vendorUrl} target="_blank" rel="noreferrer">{brand.vendorDomain}</a> · {brand.copyright()}</p>
            <div className="notice info" style={{ marginTop: 14 }}><b>Engineering qualification</b><p>{brand.qualification}</p></div>
          </Card>
        </div>
      )}
    </div>
  );
}
