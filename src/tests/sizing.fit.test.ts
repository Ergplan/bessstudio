import { describe, expect, it } from 'vitest';
import { connectionKV, defaultSizingInput, enclosureHierarchy, fitEquipment, recoveryHours, sizeSystem, type SizingInput } from '../sizing/engine';
import { evaluateFinance, landedForSizing } from '../sizing/finance';
import { defaultPriceBook, landedRatesFor, offerPcsInrPerKW } from '../catalog/pricing';
import { enclosures, packSpecs, transformers, enclosureCRate, enclosureEnergyKWh } from '../catalog/products';
import { newProject } from '../platform/projects';
import type { ApplicationId } from '../sizing/applications';

const fx = defaultPriceBook.landed.exchangeRateInrPerUsd;
/** A duty as the studio states it, sized and priced the way the workbench prices it. */
const plant = (powerMW: number, durationH: number, applicationId: ApplicationId, over: Partial<SizingInput> = {}) => {
  // The charge window is left at the derived default — the discharge duration grossed up for the
  // round trip — because that is what the studio opens with. Forcing it equal to the discharge
  // duration asserts a recharge requirement nobody stated and sizes the plant to meet it.
  const base = defaultSizingInput(applicationId);
  const sizing = sizeSystem({
    ...base, mode: 'power-duration', powerMW, durationH,
    chargeDurationH: recoveryHours(durationH, base.losses), ...over,
  });
  const finance = evaluateFinance(sizing, defaultPriceBook);
  return { sizing, finance, capexInr: finance.capexUsd * fx, inrPerKWhDc: finance.capexUsd * fx / (sizing.installedDcMWh * 1000) };
};

/** The ladder the studio is expected to answer across, from a wall socket to a grid-scale plant. */
const ladder: [string, number, number, ApplicationId][] = [
  ['5 kW backup', 0.005, 1, 'backup-power'],
  ['10 kW backup', 0.01, 2, 'backup-power'],
  ['50 kW peak shaving', 0.05, 2, 'peak-shaving'],
  ['250 kW peak shaving', 0.25, 2, 'peak-shaving'],
  ['1 MW microgrid', 1, 4, 'microgrid'],
  ['2.5 MW solar shifting', 2.5, 4, 'solar-shifting'],
  ['10 MW arbitrage', 10, 4, 'energy-arbitrage'],
  ['100 MW arbitrage', 100, 4, 'energy-arbitrage'],
];

/**
 * The equipment follows the duty.
 *
 * Written from a real answer the studio gave: five kilowatts of backup came back as one
 * five-megawatt-hour container, one 2 507.5 kW converter and ₹5.55 crore — a thousand times the
 * plant that was asked for, with warnings attached, which is not the same as an answer.
 */
describe('fitting equipment to the duty', () => {
  it('answers a five-kilowatt backup supply with a wall rack, not a shipping container', () => {
    const { sizing, capexInr } = plant(0.005, 1, 'backup-power');
    expect(sizing.enclosure.family).toBe('rack');
    expect(sizing.pcs.ratedKW).toBe(5);
    expect(sizing.pcsCount).toBe(1);
    expect(sizing.transformer).toBeNull();
    expect(capexInr).toBeLessThan(1e6);                      // lakhs, not crores

    // Nominal capacity is a consequence, not a default. Five kilowatt-hours contracted, through a
    // 95% depth of discharge inside a 95% usable window, across a 95.5% discharge path, with the
    // year-one retention the design is sized at, needs about 6.1 kWh of nameplate — which the
    // catalogue supplies in 5.12 kWh steps.
    const nominalKWh = sizing.installedDcMWh * 1000;
    const minimum = 5 / (sizing.input.dod * sizing.input.losses.usableDcWindow * sizing.dischargePathEfficiency * 0.95);
    expect(nominalKWh).toBeGreaterThanOrEqual(minimum);
    expect(nominalKWh).toBeLessThan(minimum + enclosureEnergyKWh(sizing.enclosure));
    expect(nominalKWh).toBeLessThan(12);
    // And it is stated separately from the energy the plant can actually deliver on day one.
    expect(sizing.day1UsableMWh * 1000).toBeGreaterThanOrEqual(5);
    expect(sizing.day1UsableMWh * 1000).toBeLessThan(nominalKWh);
  });

  it('recharges in the time the losses say, not in the time it discharged', () => {
    const { sizing } = plant(0.005, 1, 'backup-power');
    // 5 kWh at the meter takes 5 ÷ RTE to put back, so an hour out is more than an hour in.
    expect(sizing.recoveryDurationH).toBeCloseTo(1 / sizing.rteAc, 6);
    expect(sizing.recoveryDurationH).toBeGreaterThan(1);
    // At the derived window the plant charges at no more than its rated power, so charging buys
    // neither an extra converter nor an extra enclosure.
    expect(sizing.chargePowerMW).toBeLessThanOrEqual(sizing.ratedPowerMW + 1e-9);
    expect(sizing.warnings.some(w => w.code === 'charge-limited')).toBe(false);

    // Ask for the same hour back and the physics says so out loud, rather than silently.
    const forced = plant(0.005, 1, 'backup-power', { chargeDurationH: 1 });
    expect(forced.sizing.chargePowerMW).toBeGreaterThan(forced.sizing.ratedPowerMW);
    expect(forced.sizing.warnings.some(w => w.code === 'charge-limited')).toBe(true);
  });

  it('still gives a container to whoever pins one, and says what it costs them', () => {
    const pinned = plant(0.005, 1, 'backup-power', { equipment: 'pinned' });
    expect(pinned.sizing.enclosure.id).toBe('enc-5mwh-20ft');
    expect(pinned.sizing.pcs.ratedKW).toBe(2507.5);
    expect(pinned.sizing.warnings.some(w => w.code === 'oversize' || w.code === 'pcs-granularity')).toBe(true);
    // A selector that is obeyed is the point: the price is the honest consequence, not a bug.
    // This is the ₹5.55 crore the studio used to quote whether or not anybody had asked for it.
    expect(pinned.capexInr).toBeGreaterThan(5e7);
    expect(pinned.capexInr / plant(0.005, 1, 'backup-power').capexInr).toBeGreaterThan(50);
  });

  it('keeps the reference 2.5 MW plant on the supplied container and converter', () => {
    const { sizing } = plant(2.5, 4, 'solar-shifting');
    expect(sizing.enclosure.id).toBe('enc-5mwh-20ft');
    expect(sizing.pcs.id).toBe('pcs-2507');
    // Three day-one containers for 10 MWh contracted, topped up across the term. Oversizing on day
    // one bought five up front and needed nothing afterwards; both are honest answers to the same
    // duty, and which one is the default is a commercial decision rather than an engineering one.
    expect(sizing.units).toBe(3);
    expect(sizing.augmentations.length).toBeGreaterThan(0);
    expect(sizing.years.at(-1)!.usableMWh).toBeGreaterThanOrEqual(sizing.requiredUsableMWh - 1e-9);
    expect(plant(2.5, 4, 'solar-shifting', { augmentation: 'oversize-day1' }).sizing.units).toBe(5);
  });

  it('never proposes a design that cannot carry the duty while one that can is available', () => {
    for (const [name, mw, h, app] of ladder) {
      const { sizing } = plant(mw, h, app);
      expect(sizing.warnings.filter(w => w.level === 'error'), `${name}: ${sizing.warnings.filter(w => w.level === 'error').map(w => w.text).join(' / ')}`).toHaveLength(0);
    }
  });

  it('pairs a converter whose input window covers the whole string where one exists', () => {
    // 630 kW is the cheaper converter for half a megawatt, and its 700 V floor sits above the
    // cabinet's 650 V: everything below that floor is bought and never delivered.
    const { sizing } = plant(0.5, 1.5, 'ev-charging-buffer');
    expect(sizing.pcs.dcMinV).toBeLessThanOrEqual(sizing.enclosure.dcMinV);
    expect(sizing.warnings.some(w => w.code === 'dc-window-low')).toBe(false);
  });

  it('sizes a transformer to the plant, or leaves it out where the connection is low voltage', () => {
    expect(plant(0.25, 2, 'peak-shaving').sizing.transformer!.ratedKVA).toBe(500);
    expect(plant(0.5, 0.5, 'backup-power').sizing.transformer!.ratedKVA).toBe(1000);
    expect(plant(0.1, 2, 'peak-shaving').sizing.transformer).toBeNull();
    // Supply-only scope is a decision, not an omission to be corrected.
    expect(plant(2.5, 2, 'peak-shaving', { transformerId: null }).sizing.transformer).toBeNull();
  });

  it('fits the large plants too rather than falling back on whatever the form already held', () => {
    // A cap of twenty-four rejected every candidate for fifty megawatts, after which the design
    // silently kept the input's own defaults — seventeen 3 150 kVA transformers chosen by nobody.
    const { sizing } = plant(50, 4, 'energy-arbitrage');
    expect(sizing.transformer!.ratedKVA).toBe(6300);
    expect(sizing.transformerCount * 6300).toBeGreaterThanOrEqual(sizing.ratedPowerMW * 1000 / 0.95);
    expect(fitEquipment({ ...defaultSizingInput('energy-arbitrage'), powerMW: 100, equipment: 'pinned' })).not.toBeNull();
  });
});

/**
 * Cost has to be monotone and it has to be believable, because it is the number the customer reads.
 */
describe('what the ladder costs', () => {
  const priced = ladder.map(([name, mw, h, app]) => ({ name, ...plant(mw, h, app) }));

  it('never charges less for a larger plant of the same duty', () => {
    const same = [0.1, 0.25, 0.5, 1, 2.5, 5, 10, 25, 50].map(mw => plant(mw, 4, 'energy-arbitrage').capexInr);
    for (let i = 1; i < same.length; i++) expect(same[i], `step ${i}`).toBeGreaterThan(same[i - 1]);
  });

  it('holds the installed cost inside a band a buyer would recognise, at every scale', () => {
    for (const p of priced) {
      // Grid-scale containers land near ₹1 crore per installed MWh; a wall rack is dearer per
      // kilowatt-hour, as it is in any shop. Neither is ₹2.5 lakh per kilowatt-hour, which is what
      // a flat per-enclosure converter allowance produced for a five-kilowatt system.
      expect(p.inrPerKWhDc, `${p.name} at ₹${Math.round(p.inrPerKWhDc)}/kWh DC`).toBeGreaterThan(7_000);
      // The small wall racks are the dear end, as they are in any shop: the case, the management
      // board and the certification cost much the same whatever is inside them.
      expect(p.inrPerKWhDc, `${p.name} at ₹${Math.round(p.inrPerKWhDc)}/kWh DC`).toBeLessThan(35_000);
    }
  });

  it('charges for the converter that is installed, not the one the offer was struck against', () => {
    const small = plant(0.005, 1, 'backup-power');
    // The breakdown is per enclosure, so the fleet's converter spend is that times the fleet.
    const fleetPcsInr = landedForSizing(small.sizing, defaultPriceBook).pcsInr * small.sizing.units;
    const perKW = fleetPcsInr / (small.sizing.pcs.ratedKW * small.sizing.pcsCount);
    expect(perKW).toBeCloseTo(defaultPriceBook.pcsPerKW['pcs-5'] * fx, 6);
    // A five-kilowatt hybrid inverter used to carry the container's ₹32.5 lakh allowance, which was
    // eighty-one per cent of that system's price.
    expect(fleetPcsInr).toBeLessThan(100_000);

    // The bundled allowance still stands where it was quoted: 2 507.5 kW with a container.
    const reference = plant(2.5, 4, 'solar-shifting');
    expect(landedForSizing(reference.sizing, defaultPriceBook).pcsInr).toBeCloseTo(3_250_000, 6);
    expect(offerPcsInrPerKW * 2507.5).toBeCloseTo(3_250_000, 6);
  });

  it('charges each enclosure its own import rate rather than the container rate', () => {
    const container = landedRatesFor(defaultPriceBook, 'enc-5mwh-20ft').basicPriceUsdPerKWh;
    const cabinet = landedRatesFor(defaultPriceBook, 'enc-261-ci').basicPriceUsdPerKWh;
    const rack = landedRatesFor(defaultPriceBook, 'enc-16-small').basicPriceUsdPerKWh;
    expect(container).toBe(defaultPriceBook.landed.basicPriceUsdPerKWh);
    expect(cabinet).toBeGreaterThan(container);
    expect(rack).toBeGreaterThan(cabinet);
    expect(cabinet / container).toBeCloseTo(defaultPriceBook.batteryPerKWh['enc-261-ci'] / defaultPriceBook.batteryPerKWh['enc-5mwh-20ft'], 9);

    // With one rate for every product, forty-six cabinets undercut three containers for 2.5 MW,
    // because cabinets fit a duty more tightly and cost nothing extra per kilowatt-hour to do it.
    const reference = plant(2.5, 2, 'peak-shaving');
    expect(reference.sizing.enclosure.family).toBe('container');
    expect(reference.sizing.units).toBeLessThan(10);
  });

  it('compares candidates at the cost of installing them, whatever the scope of the offer is', () => {
    // Supply-only pays for boxes and nothing else, so eighty-eight cabinets genuinely undercut five
    // containers on that basis — the eighty-three extra foundations and commissioning visits appear
    // on nobody's invoice. The choice of equipment is a question about the installed plant.
    const supplyOnly = evaluateFinance(plant(2.5, 4, 'solar-shifting').sizing, defaultPriceBook);
    const turnkey = evaluateFinance(plant(2.5, 4, 'solar-shifting').sizing, { ...defaultPriceBook, supplyScope: 'turnkey' });
    expect(turnkey.capexUsd).toBeGreaterThan(supplyOnly.capexUsd);
    expect(plant(20, 1, 'frequency-regulation').sizing.units).toBeLessThan(40);
  });
});

/** Catalogue arithmetic that has to agree with itself before anything above can be trusted. */
describe('the catalogue agrees with itself', () => {
  it('rates every system within what its own pack sustains', () => {
    for (const enc of enclosures) {
      const pack = packSpecs.find(p => p.id === enc.packSpecId)!;
      const packKW = pack.nominalV * pack.continuousA * enc.racks * enc.packsPerRack / 1000;
      expect(enc.ratedKW, `${enc.model} rated ${enc.ratedKW} kW against ${packKW.toFixed(1)} kW of pack`).toBeLessThanOrEqual(packKW + 1);
      expect(enclosureCRate(enc), `${enc.model}`).toBeGreaterThan(0.2);
    }
  });

  it('carries a price for every product it will propose', () => {
    for (const enc of enclosures) expect(defaultPriceBook.batteryPerKWh[enc.id], enc.model).toBeGreaterThan(0);
    for (const t of transformers) expect(defaultPriceBook.transformerPerKVA[t.id], t.model).toBeGreaterThan(0);
  });

  it('offers a transformer small enough for a plant that needs one at all', () => {
    const smallest = Math.min(...transformers.map(t => t.ratedKVA));
    expect(smallest).toBeLessThanOrEqual(500);
  });
});

/**
 * What the plant presents at its boundary, against the connection it says it makes.
 */
describe('the connection voltage', () => {
  it('says so when nothing in the design can reach the stated voltage', () => {
    const small = sizeSystem({
      ...defaultSizingInput('backup-power'), mode: 'power-duration',
      powerMW: 0.005, durationH: 1, chargeDurationH: 1, gridKV: 33,
    });
    expect(small.transformer).toBeNull();
    const w = small.warnings.find(x => x.code === 'grid-voltage');
    expect(w?.text).toContain('230 V');
  });

  it('is quiet where the design already makes the connection it claims', () => {
    const small = sizeSystem({
      ...defaultSizingInput('backup-power'), mode: 'power-duration',
      powerMW: 0.005, durationH: 1, chargeDurationH: 1, gridKV: 0.23,
    });
    expect(small.warnings.some(w => w.code === 'grid-voltage')).toBe(false);
    expect(connectionKV(small)).toBeCloseTo(0.23, 6);

    const big = sizeSystem({ ...defaultSizingInput('solar-shifting'), mode: 'power-duration', powerMW: 2.5, durationH: 4, chargeDurationH: 4, gridKV: 33 });
    expect(connectionKV(big)).toBe(33);
    expect(big.warnings.some(w => w.code === 'grid-voltage')).toBe(false);
  });
});

/**
 * Three decisions taken on the evidence, each of which moves every number the customer reads.
 */
describe('the commercial defaults', () => {
  it('augments when capacity falls short rather than buying twenty years up front', () => {
    for (const [name, mw, h, app] of ladder) {
      const { sizing } = plant(mw, h, app);
      expect(sizing.input.augmentation, name).toBe('periodic');
      // Whatever the strategy, the plant must still meet its contract in its final year.
      expect(sizing.years.at(-1)!.usableMWh, name).toBeGreaterThanOrEqual(sizing.requiredUsableMWh - 1e-9);
    }
    // The 2.5 MW reference: 25 MWh installed on day one became 15 MWh with top-ups across the term.
    const periodic = plant(2.5, 4, 'solar-shifting');
    const upfront = plant(2.5, 4, 'solar-shifting', { augmentation: 'oversize-day1' });
    expect(periodic.sizing.installedDcMWh).toBeLessThan(upfront.sizing.installedDcMWh * 0.7);
    expect(periodic.capexInr).toBeLessThan(upfront.capexInr);
    expect(upfront.sizing.augmentations).toHaveLength(0);
  });

  it('carries the installed cost beside a price that is only the equipment', () => {
    const { finance } = plant(2.5, 4, 'solar-shifting');
    expect(defaultPriceBook.supplyScope).toBe('supply-only');
    // Everything a supply-only order value leaves out: switchgear and cabling, foundations and
    // site works, installation, commissioning, and detailed engineering.
    expect(finance.indicativeInstalledUsd).not.toBeNull();
    expect(finance.indicativeInstalledUsd!).toBeGreaterThan(finance.capexUsd);
    expect(finance.lines.some(l => l.category === 'balance-of-plant')).toBe(false);

    const turnkey = evaluateFinance(plant(2.5, 4, 'solar-shifting').sizing, { ...defaultPriceBook, supplyScope: 'turnkey' });
    // Where the book already sells the installed plant, the order value is the installed cost and
    // printing a second figure beside it would only invite the reader to add them together.
    expect(turnkey.indicativeInstalledUsd).toBeNull();
    expect(finance.indicativeInstalledUsd!).toBeCloseTo(turnkey.capexUsd, 6);
  });

  it('rates the 314 Ah rack pack at what the market rates it, not at a sixth of it', () => {
    const rack = packSpecs.find(p => p.id === 'pack-16s-314')!;
    // 0.5 C is the standard charge and discharge rate quoted for 314 Ah cells, and every other pack
    // in the supplied schedule carries it. 50 A on this one was 0.16 C, and read as carried over
    // from the 100 Ah pack beside it, for which 50 A is exactly 0.5 C.
    expect(rack.continuousA / 314).toBeGreaterThan(0.4);
    expect(rack.continuousA).toBeLessThanOrEqual(rack.maxA);
    // And it has to support the rating its own cabinet is sold at.
    const cabinet = enclosures.find(e => e.id === 'enc-16-small')!;
    expect(rack.nominalV * rack.continuousA / 1000).toBeGreaterThanOrEqual(cabinet.ratedKW);
    expect(rack.provenance).toBe('assumed');
  });
});

/**
 * A lot rate quoted for a grid-scale plant, charged in full against a wall battery.
 */
describe('what it costs to install', () => {
  const installedOver = (mw: number, h: number, app: ApplicationId) => {
    const p = plant(mw, h, app);
    return p.finance.indicativeInstalledUsd! / p.finance.capexUsd;
  };

  it('does not charge a grid-scale engineering lot against a wall battery', () => {
    // ₹27 lakh of detailed engineering and ₹4.7 lakh of commissioning, both quoted for a plant of
    // the reference scale, made the installed cost of a ₹3.9 lakh system ₹42 lakh.
    const small = plant(0.005, 1, 'backup-power');
    expect(small.finance.indicativeInstalledUsd! * fx).toBeLessThan(1_000_000);
    for (const [name, mw, h, app] of ladder) {
      const ratio = installedOver(mw, h, app);
      expect(ratio, `${name} installs at ${ratio.toFixed(2)}× its equipment`).toBeGreaterThan(1.1);
      expect(ratio, `${name} installs at ${ratio.toFixed(2)}× its equipment`).toBeLessThan(1.7);
    }
  });

  it('leaves the reference plant own lot rate where the book put it', () => {
    // The scale is anchored on the platform's default design, so the book's figures still mean
    // what a person setting them in Settings thinks they mean.
    const reference = plant(2.5, 4, 'solar-shifting');
    const turnkey = evaluateFinance(reference.sizing, { ...defaultPriceBook, supplyScope: 'turnkey' });
    const engineering = turnkey.lines.find(l => l.id === 'engineering')!;
    expect(engineering.totalUsd / defaultPriceBook.engineeringFixed).toBeCloseTo(1, 1);
  });

  it('opens a design at the connection it actually makes', () => {
    const project = newProject({
      orgId: 'o', customer: { id: 'c', name: 'C', city: '', country: '' }, name: 'N', existing: 0,
      by: { uid: 'u', displayName: 'U' },
      sizing: { ...defaultSizingInput('backup-power'), mode: 'power-duration', powerMW: 0.005, durationH: 1, chargeDurationH: 1 },
    });
    expect(project.sizing.gridKV).toBeCloseTo(0.23, 6);
    expect(sizeSystem(project.sizing).warnings.some(w => w.code === 'grid-voltage')).toBe(false);
    // And a grid-scale design still opens at the grid.
    expect(newProject({
      orgId: 'o', customer: { id: 'c', name: 'C', city: '', country: '' }, name: 'N', existing: 0,
      by: { uid: 'u', displayName: 'U' }, sizing: defaultSizingInput(),
    }).sizing.gridKV).toBe(33);
  });
});

/**
 * A design a reader can check.
 *
 * Written from the customer's own correction note on a 5 MW / 1 h design: three containers and two
 * 5 MW converters for a 5 MW / 5 MWh requirement, with "1.15 h to put back at rated power" printed
 * beside a fleet that had been sized on a one-hour recharge. The arithmetic was right and the page
 * was mute, so the quantities could not be approved — correctly.
 */
describe('how the requirement became this much equipment', () => {
  const fiveMW = (chargeDurationH: number) => sizeSystem({
    ...defaultSizingInput('energy-arbitrage'), mode: 'power-duration',
    powerMW: 5, durationH: 1, chargeDurationH,
  });

  it('unwinds the energy chain one division at a time, ending where the sizing ended', () => {
    const s = fiveMW(1);
    const e = s.rationale.energy;
    // The auxiliary step appears wherever the enclosure has auxiliaries, which is everywhere in
    // this catalogue: it is what turns a nominal capacity into what an enclosure actually delivers,
    // and leaving it out of the chain turned 1.87 enclosures into 3 with nothing on the page.
    expect(e.map(x => x.id)).toEqual(['contracted', 'dc-terminals', 'nominal-bol', 'nominal-install', 'aux', 'units-energy']);
    expect(e.find(x => x.id === 'aux')!.value).toBeLessThan(s.installedDcMWh / s.units);
    expect(e[0].value).toBeCloseTo(s.requiredUsableMWh, 9);
    expect(e[1].value).toBeCloseTo(e[0].value / s.dischargePathEfficiency, 9);
    expect(e[2].value).toBeCloseTo(e[1].value / (s.input.dod * s.input.losses.usableDcWindow), 9);
    expect(e.at(-1)!.value).toBe(s.rationale.unitsForEnergy);
    // Through the requirement chain each step is bigger than the one before it: nothing between the
    // load and the cell gives energy back.
    for (let i = 1; i < 4; i++) expect(e[i].value).toBeGreaterThan(e[i - 1].value);
    // And the fleet is the requirement divided by what one enclosure actually delivers.
    expect(e.at(-1)!.value).toBe(Math.ceil(s.requiredUsableMWh / e.find(x => x.id === 'aux')!.value - 1e-9));
  });

  it('names the charge window as what bought the extra equipment', () => {
    const forced = fiveMW(1);
    expect(forced.rationale.binding).toBe('power');
    expect(forced.rationale.unitsForPower).toBeGreaterThan(forced.rationale.unitsForEnergy);
    const why = forced.rationale.reasons.map(r => r.code);
    expect(why).toContain('power-binds');
    expect(why).toContain('charge-window');
    expect(forced.rationale.reasons.find(r => r.code === 'charge-window')!.text)
      .toContain(forced.recoveryDurationH.toFixed(2));

    // And relaxing it to what the losses actually need removes both the extra enclosure and the
    // extra converter, which is the whole of the customer's point.
    const relaxed = fiveMW(Math.ceil(forced.recoveryDurationH * 100) / 100);
    expect(relaxed.units).toBeLessThan(forced.units);
    expect(relaxed.pcsCount).toBeLessThan(forced.pcsCount);
    expect(relaxed.rationale.reasons.map(r => r.code)).not.toContain('charge-window');
    expect(relaxed.pcsCount * relaxed.pcs.ratedKW / 1000).toBeGreaterThanOrEqual(relaxed.ratedPowerMW);
  });

  it('accounts for every enclosure between the duty and the invoice', () => {
    for (const [name, mw, h, app] of ladder) {
      const { sizing } = plant(mw, h, app);
      const r = sizing.rationale;
      expect(r.units, name).toBe(sizing.units);
      expect(r.installedDcMWh, name).toBeCloseTo(sizing.installedDcMWh, 9);
      expect(r.units, name).toBe(Math.max(1, r.unitsForEnergy, r.unitsForPower));
      // Where more is installed than the duty strictly needs, the page says why. Silence is only
      // allowed when the fleet is exactly what one of the two chains asked for.
      const exact = r.binding === 'power' ? r.unitsForPower : r.unitsForEnergy;
      if (r.units > exact || r.unitsForPower !== r.unitsForEnergy) {
        expect(r.reasons.length, `${name} installs ${r.units} and explains nothing`).toBeGreaterThan(0);
      }
      for (const reason of r.reasons) expect(reason.text.length, `${name}/${reason.code}`).toBeGreaterThan(40);
    }
  });

  it('says what a catalogue label is a label for', () => {
    // "SWESLC1331.2V314Ah" names a string: 1 331.2 V at 314 Ah, which is 418 kWh. The product is a
    // container of twelve of them. Read alone the label says 418 kWh, and a reader checking three
    // against 15 MWh finds 1.25 MWh and concludes the quantity is wrong.
    const container = enclosures.find(e => e.id === 'enc-5mwh-20ft')!;
    const text = enclosureHierarchy(container);
    expect(text).toContain('5.02 MWh container');
    expect(text).toContain('12 strings');
    expect(text).toContain('418 kWh');
    expect(text).toContain('1331.2 V');
    // A single-string product has no hierarchy to explain, and says its own arrangement instead.
    expect(enclosureHierarchy(enclosures.find(e => e.id === 'enc-16-small')!)).toContain('16S1P');
  });

  it('states contracted power and installed conversion as two numbers', () => {
    const forced = fiveMW(1);
    expect(forced.ratedPowerMW).toBe(5);
    expect(forced.pcsCount * forced.pcs.ratedKW / 1000).toBeGreaterThan(forced.ratedPowerMW);
    // The step that explains the gap has to carry the figure that caused it.
    const design = forced.rationale.power.find(x => x.id === 'design-power')!;
    expect(design.value).toBeCloseTo(forced.chargePowerMW, 9);
    expect(design.value).toBeGreaterThan(forced.ratedPowerMW);
  });
});
