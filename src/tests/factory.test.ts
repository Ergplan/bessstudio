import { describe, expect, it } from 'vitest';
import {
  teachingFactory, playFactory, noBess, dieselInrPerKWh, backupNeedKWh, solarSurplusKWh,
  usableKWh, CHAIN, type Moves,
  rounds, roundById, unlockedBy, factoryDay, dayTotals, solarProfileKW, loadProfileKW,
} from '../sim/factory';

const s = teachingFactory;
const move = (over: Partial<Moves>): Moves => ({ ...noBess(), ...over });

/**
 * The factory's bill, before anybody installs anything.
 *
 * The baseline has to be right before any saving claimed against it means anything, and it has to
 * be arithmetic somebody can check on the back of their own bill.
 */
describe('the factory as it stands', () => {
  it('costs what its own tariff says it costs', () => {
    const y = playFactory(s, noBess());
    const energy = (s.peakLoadKW * s.peakWindowHours * s.tariffInrPerKWh.peak
      + s.baseLoadKW * s.baseHours * s.tariffInrPerKWh.normal) * s.workingDaysPerYear;
    expect(y.lines.find(l => l.id === 'grid-energy')!.baselineInr).toBeCloseTo(energy, 6);
    expect(y.lines.find(l => l.id === 'demand-charge')!.baselineInr)
      .toBeCloseTo(s.recordedDemandKVA * s.demandChargeInrPerKVAMonth * 12, 6);
    // Diesel is fuel and upkeep, not fuel alone — the line item most often understated.
    expect(dieselInrPerKWh(s)).toBeCloseTo(95 * 0.29 + 1.5, 6);
    expect(y.lines.find(l => l.id === 'diesel')!.baselineInr)
      .toBeCloseTo(backupNeedKWh(s) * s.workingDaysPerYear * dieselInrPerKWh(s), 6);
    // Export is a credit, so it lowers the bill.
    expect(y.lines.find(l => l.id === 'solar-export')!.baselineInr).toBeLessThan(0);
  });

  it('changes nothing when there is no battery', () => {
    const y = playFactory(s, noBess());
    expect(y.withBessTotalInr).toBeCloseTo(y.baselineTotalInr, 6);
    expect(y.grossSavingInr).toBeCloseTo(0, 6);
    expect(y.bessCapexInr).toBe(0);
    expect(y.simplePaybackYears).toBeNull();
    expect(y.shortfalls).toEqual([]);
  });
});

/** Each cost line, moved on its own, so the argument for it can be checked by itself. */
describe('what a battery does to each line', () => {
  it('displaces diesel, and pays to put the energy back', () => {
    const y = playFactory(s, move({ bessPowerKW: 600, bessEnergyKWh: 800, reservePortion: 1 }));
    const diesel = y.lines.find(l => l.id === 'diesel')!;
    expect(diesel.withBessInr).toBeLessThan(diesel.baselineInr);
    // Covered in full: the reserve is larger than the outage asks for.
    expect(y.allocation.backupCoveredKWh).toBeCloseTo(backupNeedKWh(s), 6);
    expect(diesel.withBessInr).toBeCloseTo(0, 6);
    // And the recharge is on the grid-energy line, not free.
    const energy = y.lines.find(l => l.id === 'grid-energy')!;
    expect(energy.withBessInr).toBeGreaterThan(energy.baselineInr);
  });

  it('will not retire the lead-acid bank it cannot replace', () => {
    // A battery too small to carry what the bank delivers does not get to claim the bank's cost.
    const small = playFactory(s, move({ bessPowerKW: 600, bessEnergyKWh: 100, reservePortion: 1, retireLeadAcid: true }));
    expect(small.lines.find(l => l.id === 'lead-acid')!.withBessInr).toBeGreaterThan(0);
    expect(small.shortfalls.join(' ')).toContain('Retiring the lead-acid bank');

    const big = playFactory(s, move({ bessPowerKW: 600, bessEnergyKWh: 800, reservePortion: 1, retireLeadAcid: true }));
    expect(big.lines.find(l => l.id === 'lead-acid')!.withBessInr).toBe(0);
  });

  it('turns an exported unit into an avoided one', () => {
    const y = playFactory(s, move({ bessPowerKW: 800, bessEnergyKWh: 3000, shiftSolar: true }));
    expect(y.allocation.solarShiftedKWh).toBeGreaterThan(0);
    // The export credit shrinks and the energy bill falls by more, because the site buys the
    // evening back at the peak price and sells the noon surplus at a third of it.
    const exp = y.lines.find(l => l.id === 'solar-export')!;
    const energy = y.lines.find(l => l.id === 'grid-energy')!;
    const lostCredit = exp.withBessInr - exp.baselineInr;
    const savedEnergy = energy.baselineInr - energy.withBessInr;
    expect(lostCredit).toBeGreaterThan(0);
    expect(savedEnergy).toBeGreaterThan(lostCredit);
  });

  it('only cuts the demand charge by what it can hold for the whole window', () => {
    // Power enough, energy not: the meter records the rest, and the model says so.
    const thin = playFactory(s, move({ bessPowerKW: 500, bessEnergyKWh: 300, peakTargetKVA: 1800 }));
    expect(thin.allocation.peakShavedKVA * s.powerFactor).toBeLessThan(500);
    expect(thin.shortfalls.join(' ')).toContain('Holding the meter at 1800 kVA');

    const enough = playFactory(s, move({ bessPowerKW: 500, bessEnergyKWh: 2600, peakTargetKVA: 1800 }));
    expect(enough.allocation.peakShavedKVA).toBeCloseTo(s.recordedDemandKVA - 1800, 0);
    const demand = enough.lines.find(l => l.id === 'demand-charge')!;
    expect(demand.baselineInr - demand.withBessInr)
      .toBeCloseTo((s.recordedDemandKVA - 1800) * s.demandChargeInrPerKVAMonth * 12, 0);
  });
});

/**
 * The trade, which is the whole point.
 *
 * One battery, three duties. Energy held for the outage is energy the evening peak does not get,
 * and a player who asks for everything at once has to be told which duty went short rather than be
 * shown a saving that assumes the same kilowatt-hour twice.
 */
describe('one battery cannot do everything at once', () => {
  const all = (reserve: number) => playFactory(s, move({
    bessPowerKW: 900, bessEnergyKWh: 2500, reservePortion: reserve,
    shiftSolar: true, peakTargetKVA: 1800, retireLeadAcid: true,
  }));

  it('spends the same kilowatt-hour once', () => {
    const y = all(0.3);
    const a = y.allocation;
    // Everything discharged comes out of the usable energy, and nothing is counted twice: the
    // reserve and the cycling energy together are the usable energy, to the kilowatt-hour.
    expect(a.reserveKWh + a.cyclingKWh + a.solarShiftedKWh).toBeCloseTo(a.usableKWh, 6);
    expect(a.usableKWh).toBeCloseTo(usableKWh(2500), 6);
  });

  it('takes the peak shaving away when the reserve is raised', () => {
    const low = all(0.1), high = all(0.9);
    expect(high.allocation.backupCoveredKWh).toBeGreaterThanOrEqual(low.allocation.backupCoveredKWh);
    expect(high.allocation.peakShavedKVA).toBeLessThan(low.allocation.peakShavedKVA);
    expect(high.shortfalls.length).toBeGreaterThan(0);
  });

  it('names what went short rather than quietly serving less', () => {
    const y = all(0.95);
    expect(y.shortfalls.length).toBeGreaterThan(0);
    for (const s of y.shortfalls) expect(s.length).toBeGreaterThan(30);
  });

  it('charges the player for the battery before calling anything a saving', () => {
    const y = all(0.3);
    expect(y.bessCapexInr).toBeCloseTo(2500 * CHAIN.bessInrPerKWh, 6);
    expect(y.netSavingInr).toBeCloseTo(y.grossSavingInr - y.bessUpkeepInr, 6);
    expect(y.netSavingInr).toBeLessThan(y.grossSavingInr);
    if (y.netSavingInr > 0) {
      expect(y.simplePaybackYears!).toBeCloseTo(y.bessCapexInr / y.netSavingInr, 6);
      // A plausible industrial answer rather than a number that sells itself.
      expect(y.simplePaybackYears!).toBeGreaterThan(1);
      expect(y.simplePaybackYears!).toBeLessThan(15);
    }
  });

  it('is worth doing at all', () => {
    // The point of the game is that a well-played battery beats the bill. If the fixture ever
    // stops showing that, the fixture is wrong and the suite should say so rather than the player
    // discovering it.
    const y = all(0.25);
    expect(y.netSavingInr).toBeGreaterThan(0);
    expect(y.withBessTotalInr).toBeLessThan(y.baselineTotalInr);
  });
});

describe('the fixture is arithmetic anybody can check', () => {
  it('states its own daily quantities', () => {
    expect(backupNeedKWh(s)).toBeCloseTo(600 * 0.75, 6);
    expect(usableKWh(1000)).toBeCloseTo(1000 * 0.95 * 0.9, 6);
  });

  it('exports only what its own profiles leave over', () => {
    // Derived, never declared. The array's best hour has to beat the site's base load before a
    // single unit leaves the gate, and a fixture that says otherwise is describing another site.
    const solar = solarProfileKW(s), load = loadProfileKW(s);
    expect(solarSurplusKWh(s))
      .toBeCloseTo(solar.reduce((t, kW, h) => t + Math.max(0, kW - load[h]), 0), 6);
    expect(Math.max(...solar), 'the array never beats the base load, so nothing is ever exported')
      .toBeGreaterThan(s.baseLoadKW);
    expect(solarSurplusKWh(s)).toBeGreaterThan(0);
    // And it is a share of the day somebody would recognise, not all of it.
    const daily = s.solarKWp * s.solarKWhPerKWpDay;
    expect(solarSurplusKWh(s) / daily).toBeGreaterThan(0.1);
    expect(solarSurplusKWh(s) / daily).toBeLessThan(0.6);
  });
});

/**
 * The storyline, played.
 *
 * A round nobody can win is a bug, and a round everybody wins by accident is not a round. Both are
 * checked here against the same model the screen uses, so the game cannot drift into being
 * unwinnable or trivial while the copy still promises a lesson.
 */
describe('the six rounds', () => {
  it('runs in order, hands over controls once, and never takes one back', () => {
    expect(rounds.map(r => r.n)).toEqual([1, 2, 3, 4, 5, 6]);
    const handed = rounds.flatMap(r => r.unlocks);
    expect(new Set(handed).size, 'a control is unlocked twice').toBe(handed.length);
    expect(unlockedBy(6).sort()).toEqual(
      ['bessEnergyKWh', 'bessPowerKW', 'peakTargetKVA', 'reservePortion', 'retireLeadAcid', 'shiftSolar'].sort());
    expect(unlockedBy(2)).toEqual(['bessPowerKW', 'bessEnergyKWh', 'reservePortion']);
    for (const r of rounds) {
      expect(r.scene.length, r.id).toBeGreaterThan(80);
      expect(r.lesson.length, r.id).toBeGreaterThan(60);
    }
  });

  it('can be won, one round at a time, with only the controls handed over by then', () => {
    // Round 2: a battery that carries the outage.
    const two = move({ bessPowerKW: 600, bessEnergyKWh: 700, reservePortion: 1 });
    expect(roundById('the-generator')!.won(playFactory(s, two))).toBe(true);
    // Round 3: the same battery, now allowed to retire the bank.
    const three = { ...two, retireLeadAcid: true };
    expect(roundById('the-bank')!.won(playFactory(s, three))).toBe(true);
    // Round 4: room for the surplus as well, so the reserve comes down and the battery goes up.
    const four = { ...three, bessPowerKW: 900, bessEnergyKWh: 2400, reservePortion: 0.25, shiftSolar: true };
    expect(roundById('the-roof')!.won(playFactory(s, four))).toBe(true);
    // Round 5: hold the meter at 1,800 kVA.
    const five = { ...four, bessEnergyKWh: 3600, peakTargetKVA: 1800 };
    expect(roundById('the-evening')!.won(playFactory(s, five))).toBe(true);
  });

  it('cannot be won by doing nothing, from the second round on', () => {
    const nothing = playFactory(s, noBess());
    for (const r of rounds.filter(x => x.n > 1)) {
      expect(r.won(nothing), `${r.id} is won by installing nothing`).toBe(false);
    }
  });

  it('will not let the last round be won on the battery the second round bought', () => {
    // The whole point of the finale: asked for everything, a battery sized for the outage alone
    // comes up short somewhere, and the model has to say where rather than quietly serve less.
    const asEverything = move({
      bessPowerKW: 600, bessEnergyKWh: 700, reservePortion: 1,
      shiftSolar: true, peakTargetKVA: 1800, retireLeadAcid: true,
    });
    const y = playFactory(s, asEverything);
    expect(roundById('the-trade')!.won(y)).toBe(false);
    expect(y.shortfalls.length).toBeGreaterThan(0);
  });

  it('can be won at the end, and the winning battery is a real one', () => {
    const won = move({
      bessPowerKW: 900, bessEnergyKWh: 3600, reservePortion: 0.16,
      shiftSolar: true, peakTargetKVA: 1800, retireLeadAcid: true,
    });
    const y = playFactory(s, won);
    expect(y.shortfalls, y.shortfalls.join(' | ')).toEqual([]);
    expect(roundById('the-trade')!.won(y)).toBe(true);
    // And it is a plant somebody could actually buy: under 1 C, and paying back inside its life.
    expect(won.bessPowerKW / won.bessEnergyKWh).toBeLessThan(1);
    expect(y.simplePaybackYears!).toBeLessThan(12);
  });
});

/**
 * The day, held to the year.
 *
 * Laying the same numbers out in time is only useful if they are the same numbers. A day view that
 * drifted from the bill would be a second model telling the player a second story, and the one
 * thing this studio does not do is run two models and show whichever looks better.
 */
describe('the day the year assumes', () => {
  const played = move({
    bessPowerKW: 900, bessEnergyKWh: 3600, reservePortion: 0.16,
    shiftSolar: true, peakTargetKVA: 1800, retireLeadAcid: true,
  });

  it('is twenty-four hours, each in one price window', () => {
    const day = factoryDay(s, played);
    expect(day.map(h => h.hour)).toEqual(Array.from({ length: 24 }, (_, i) => i));
    expect(day.filter(h => h.window === 'peak')).toHaveLength(s.peakWindowHours);
    expect(day.filter(h => h.outage)).toHaveLength(1);
    // The evening window is where the peak load sits, which is the whole reason it is charged for.
    for (const h of day.filter(x => x.window === 'peak')) expect(h.loadKW).toBe(s.peakLoadKW);
  });

  it('draws the same site load the bill is written against', () => {
    const load = loadProfileKW(s);
    expect(load.reduce((t, kW) => t + kW, 0))
      .toBeCloseTo(s.baseLoadKW * s.baseHours + s.peakLoadKW * s.peakWindowHours, 6);
  });

  it('generates the day of sun the year is costed on', () => {
    expect(dayTotals(factoryDay(s, played)).solarKWh)
      .toBeCloseTo(s.solarKWp * s.solarKWhPerKWpDay, 6);
  });

  it('discharges exactly what the year allocated, and no more', () => {
    const year = playFactory(s, played);
    const discharged = dayTotals(factoryDay(s, played)).dischargedKWh;
    // Carried the outage, plus whatever went into the evening. Nothing else discharges.
    expect(discharged).toBeCloseTo(year.allocation.backupCoveredKWh + year.allocation.peakShavedKWh, 6);
  });

  it('puts back what it took out, through the losses, and not from the sun twice', () => {
    const year = playFactory(s, played);
    const t = dayTotals(factoryDay(s, played));
    // Charge comes from two places: the night tariff and the surplus. The surplus never crosses the
    // meter, so only the grid share carries the round-trip gross-up.
    const fromGrid = Math.max(0, year.allocation.peakShavedKWh - year.allocation.solarShiftedKWh)
      + year.allocation.backupCoveredKWh;
    expect(t.chargedKWh).toBeCloseTo(fromGrid / CHAIN.roundTrip + year.allocation.solarShiftedKWh, 0);
  });

  it('runs the generator only during the outage, and only for what the battery missed', () => {
    const t = dayTotals(factoryDay(s, played));
    expect(t.dieselKWh).toBeCloseTo(0, 6);
    // A battery too small to carry it leaves the generator the balance.
    const thin = factoryDay(s, move({ bessPowerKW: 200, bessEnergyKWh: 300, reservePortion: 1 }));
    expect(dayTotals(thin).dieselKWh).toBeGreaterThan(0);
    expect(thin.filter(h => h.dieselKW > 0).every(h => h.outage)).toBe(true);
  });

  it('never imports during the outage, because there is no grid to import from', () => {
    for (const h of factoryDay(s, played).filter(x => x.outage)) expect(h.gridKW).toBe(0);
  });
});
