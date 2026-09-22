import { describe, expect, it } from 'vitest';
import {
  agmBlock, availableFraction, averageVoltsPerCell, blocksFor, dayOfOutages, energyWhPerBlock,
  floatLifeYears, powerWPerBlock, rechargeMinutes, temperatureFactor, vrlaApplicability, PEUKERT_N,
} from '../sim/vrla';
import { END_OF_LIFE_FRACTION, compareChemistries, repeatedOutages } from '../sim/chemistry';
import { defaultAssumptions } from '../sim/ups';

/**
 * S8 — lead-acid against lithium, and F06.
 *
 * Two things are being tested here, and the second matters more than the first. One: that the
 * lead-acid model is a model of lead-acid rather than the lithium one with a different label. Two:
 * that a day of repeated outages carries the battery's actual state from one event to the next,
 * because a model that quietly refills it makes every option look ready for everything.
 */

describe('a model of lead-acid, not lithium with a different label', () => {
  it('delivers a fraction of its twenty-hour rating at UPS durations', () => {
    // The single fact that decides the comparison: a hundred amp-hour block does not hold a
    // hundred amp-hours for fifteen minutes.
    expect(availableFraction(20)).toBeCloseTo(1, 9);
    expect(availableFraction(1)).toBeLessThan(0.6);
    expect(availableFraction(0.25)).toBeLessThan(0.45);
    expect(availableFraction(5 / 60)).toBeLessThan(0.35);
    // And it is monotone: a longer discharge always gets more out of the same block.
    for (const [a, b] of [[5 / 60, 0.25], [0.25, 1], [1, 8], [8, 20]] as const) {
      expect(availableFraction(a)).toBeLessThan(availableFraction(b));
    }
  });

  it('is the Peukert relation it says it is, rather than a curve fitted to nothing', () => {
    // C(t)/C(20) = (t/20)^(1 − 1/n), checked independently of the implementation.
    for (const hours of [0.1, 0.25, 1, 5, 20]) {
      expect(availableFraction(hours)).toBeCloseTo((hours / 20) ** (1 - 1 / PEUKERT_N), 12);
    }
  });

  it('drops its average voltage as the rate rises', () => {
    expect(averageVoltsPerCell(20)).toBeCloseTo(2.0, 9);
    expect(averageVoltsPerCell(5 / 60)).toBeCloseTo(1.8, 9);
    expect(averageVoltsPerCell(0.25)).toBeLessThan(averageVoltsPerCell(1));
  });

  it('corrects for temperature, gently, and only inside its envelope', () => {
    expect(temperatureFactor(25)).toBeCloseTo(1, 9);
    expect(temperatureFactor(35)).toBeCloseTo(1.06, 9);
    expect(temperatureFactor(15)).toBeCloseTo(0.94, 9);
  });

  it('refuses to answer outside the range it was fitted for', () => {
    expect(energyWhPerBlock(agmBlock, 1, 25).value, 'one minute is outside the fit').toBeNull();
    expect(energyWhPerBlock(agmBlock, 600, 25).value, 'ten hours is outside the fit').toBeNull();
    expect(energyWhPerBlock(agmBlock, 15, 60).value, 'sixty degrees is outside the envelope').toBeNull();
    expect(energyWhPerBlock(agmBlock, 15, -5).value).toBeNull();
    for (const bad of [1, 600]) {
      expect(energyWhPerBlock(agmBlock, bad, 25).note).toMatch(/outside the range this model was fitted for/i);
    }
    expect(energyWhPerBlock(agmBlock, 15, 25).value).toBeGreaterThan(0);
  });

  it('says what it is, every time it answers', () => {
    const e = energyWhPerBlock(agmBlock, 15, 25);
    expect(e.note).toMatch(/fitted, not from a datasheet/i);
    expect(agmBlock.provenance.badge).toBe('illustrative');
    expect(agmBlock.provenance.source).toMatch(/not a quotation/i);
    expect(agmBlock.provenance.assumptions.join(' ')).toMatch(/peukert/i);
    expect(agmBlock.provenance.assumptions.join(' '), 'and the maintenance claim is qualified').toMatch(/still need inspection/i);
  });

  it('halves its float life for every ten degrees, and calls that a rule of thumb', () => {
    expect(floatLifeYears(agmBlock, 25).value).toBeCloseTo(5, 9);
    expect(floatLifeYears(agmBlock, 35).value).toBeCloseTo(2.5, 9);
    expect(floatLifeYears(agmBlock, 45).value).toBeCloseTo(1.25, 9);
    expect(floatLifeYears(agmBlock, 25).note).toMatch(/rule of thumb.*not a warranty/i);
    expect(floatLifeYears(agmBlock, 60).value).toBeNull();
  });

  it('takes far longer to recharge than to discharge, and says why', () => {
    const r = rechargeMinutes(agmBlock, 0.1, 1, 0.2);
    expect(r.value).toBeGreaterThan(180);
    expect(r.note).toMatch(/absorption/i);
    expect(r.note, 'and says where it stopped counting').toMatch(/taken to 99%/i);
    // The last fifth is the slow part: going to 80% is quicker than filling it.
    const toEighty = rechargeMinutes(agmBlock, 0.1, 0.8, 0.2).value!;
    expect(toEighty).toBeLessThan(r.value!);
    // The last fifth is three times slower per point of charge than the bulk phase before it.
    const bulkPerPoint = toEighty / 70, absorptionPerPoint = (r.value! - toEighty) / 19;
    expect(absorptionPerPoint).toBeGreaterThan(bulkPerPoint * 2.5);
    expect(rechargeMinutes(agmBlock, 0.5, 0.5, 0.2).value).toBe(0);
  });

  it('will not recharge faster than the cells permit, whatever the charger offers', () => {
    const fast = rechargeMinutes(agmBlock, 0.2, 0.8, 5).value!;
    const permitted = rechargeMinutes(agmBlock, 0.2, 0.8, agmBlock.maxRechargeC).value!;
    expect(fast).toBeCloseTo(permitted, 9);
  });
});

describe('sizing each chemistry against its own curve', () => {
  it('sizes lead-acid from the constant-power figure, not from the label', () => {
    const sized = blocksFor(agmBlock, 225, 15, 25, 0.92).value!;
    const perBlock = energyWhPerBlock(agmBlock, 15, 25).value!;
    const needed = Math.ceil(((225_000 / 0.92) * 0.25) / perBlock);
    // Rounded up to whole strings at the converter's DC voltage, which is how it is bought.
    expect(sized.blocks).toBe(Math.ceil(needed / sized.blocksPerString) * sized.blocksPerString);
    expect(sized.blocks).toBeGreaterThanOrEqual(needed);
    expect(sized.stringVolts, 'a string, not every block in series').toBeLessThan(1000);
    expect(sized.strings * sized.blocksPerString).toBe(sized.blocks);
    // The naive answer — energy at the load divided by the block's label — is far too small.
    const naive = Math.ceil((225 * 0.25 * 1000) / (agmBlock.ratedAh20h * agmBlock.nominalV));
    expect(sized.blocks, 'the label-based count would be a serious under-sizing').toBeGreaterThan(naive * 2);
  });

  it('needs more blocks for a shorter outage at the same power, which is the whole point', () => {
    const short = blocksFor(agmBlock, 225, 5, 25, 0.92).value!;
    const long = blocksFor(agmBlock, 225, 60, 25, 0.92).value!;
    expect(short.blocks).toBeLessThan(long.blocks);
    // But not proportionally: twelve times the duration is far less than twelve times the blocks.
    expect(long.blocks).toBeLessThan(short.blocks * 12);
  });

  it('gives no configuration at all where the model does not reach', () => {
    expect(blocksFor(agmBlock, 225, 2, 25, 0.92).value).toBeNull();
  });
});

describe('equal service, not equal labels', () => {
  const comparison = compareChemistries({ protectedKW: 225, autonomyMinutes: 15, tempC: 25 });

  it('sizes for the usable window rather than the whole pack', () => {
    const whole = blocksFor(agmBlock, 225, 15, 25, 0.92, 1).value!;
    const usable = blocksFor(agmBlock, 225, 15, 25, 0.92, 0.9).value!;
    expect(usable.blocks, 'a pack that may only use nine tenths of itself needs at least as much of it')
      .toBeGreaterThanOrEqual(whole.blocks);
    expect(usable.strings).toBeGreaterThanOrEqual(whole.strings);
    expect(usable.nominalKWh, 'and the nominal rating is far above the energy at this rate')
      .toBeGreaterThan(usable.energyKWh * 2);
  });

  it('sizes both for the same protected load and the same autonomy', () => {
    expect(comparison.protectedKW).toBe(225);
    expect(comparison.autonomyMinutes).toBe(15);
    for (const o of comparison.options) {
      expect(o.feasible, o.label).toBe(true);
      expect(o.autonomyMinutes, o.label).toBeGreaterThanOrEqual(15);
    }
  });

  it('does not give them equal energy, because equal energy is not equal service', () => {
    const [vrla, lfp] = comparison.options;
    expect(vrla.installedEnergyKWh).not.toBeCloseTo(lfp.installedEnergyKWh, 1);
    expect(comparison.disclosures.join(' ')).toMatch(/equal amp-hours would not be equal service/i);
  });

  it('discloses everything that has to change between them', () => {
    const d = comparison.differences.join(' ');
    expect(d).toMatch(/DC bus differs/i);
    expect(d).toMatch(/battery management system/i);
    expect(d).toMatch(/floor area/i);
    expect(d).toMatch(/recharge to full/i);
  });

  it('holds both to the same end-of-life threshold', () => {
    for (const o of comparison.options) {
      expect(o.endOfLifeAutonomyMinutes, o.label).toBeLessThan(o.autonomyMinutes!);
    }
    expect(comparison.disclosures.join(' ')).toMatch(new RegExp(`${END_OF_LIFE_FRACTION * 100}%`));
  });

  it('refuses to generalise one chemistry’s data to another', () => {
    const d = comparison.disclosures.join(' ');
    expect(d).toMatch(/not all lithium-ion is LFP/i);
    expect(d).toMatch(/never applied to NMC/i);
    expect(d).toMatch(/flooded, gel and other lead-acid technologies are not represented/i);
    expect(d).toMatch(/both chemistries need thermal management/i);
  });

  it('puts no number on lithium service life rather than inventing one', () => {
    const lfp = comparison.options.find(o => o.chemistry === 'LFP')!;
    expect(lfp.serviceLifeYears).toBeNull();
    expect(lfp.notes.join(' ')).toMatch(/left blank rather than assumed/i);
  });

  it('says the lithium pack has a current ceiling as well as an energy one', () => {
    const lfp = comparison.options.find(o => o.chemistry === 'LFP')!;
    expect(lfp.notes.join(' ')).toMatch(/discharge current limit permits/i);
  });

  it('returns an infeasible option rather than a number, outside the model’s range', () => {
    const tooShort = compareChemistries({ protectedKW: 225, autonomyMinutes: 2, tempC: 25 });
    const vrla = tooShort.options.find(o => o.chemistry === 'VRLA')!;
    expect(vrla.feasible).toBe(false);
    expect(vrla.installedEnergyKWh).toBe(0);
    expect(vrla.notes.join(' ')).toMatch(/does not cover the duty asked of it/i);
    const hot = compareChemistries({ protectedKW: 225, autonomyMinutes: 15, tempC: 55 });
    expect(hot.options.find(o => o.chemistry === 'VRLA')!.feasible).toBe(false);
  });

  it('lets a warm room shorten the lead-acid life without touching its autonomy', () => {
    const cool = compareChemistries({ protectedKW: 225, autonomyMinutes: 15, tempC: 25 }).options[0];
    const warm = compareChemistries({ protectedKW: 225, autonomyMinutes: 15, tempC: 35 }).options[0];
    expect(warm.serviceLifeYears!).toBeLessThan(cool.serviceLifeYears!);
    expect(warm.autonomyMinutes).toBe(cool.autonomyMinutes);
  });
});

describe('F06 — repeated outages, with the reserve carried forward', () => {
  /**
   * Expected, stated before the run: three fifteen-minute outages at 10:00, 11:00 and 12:00, with
   * recharge between them bounded by the charger. Each event starts at the state of charge the
   * last one left, so the reserve before the third is lower than before the first, and the energy
   * put back between events is less than the energy taken out.
   * Tolerance: exact monotonicity, with 1e-9 for arithmetic noise.
   */
  const events = [{ atMinutes: 600, minutes: 15 }, { atMinutes: 660, minutes: 15 }, { atMinutes: 720, minutes: 15 }];
  const day = { protectedKW: 225, tempC: 30, events, dayMinutes: 1440, chargerCPerHour: 0.1 };

  for (const chemistry of ['VRLA', 'LFP'] as const) {
    it(`carries the state of charge from one outage to the next — ${chemistry}`, () => {
      const out = repeatedOutages({ ...day, chemistry, installedKWh: 200 });
      expect(out.events).toHaveLength(3);
      // Never reset to full: each event starts below where the previous one started.
      for (let i = 1; i < out.events.length; i++) {
        expect(out.events[i].socBefore, `${chemistry} event ${i + 1} starts lower`).toBeLessThan(out.events[i - 1].socBefore + 1e-9);
      }
      expect(out.events[2].socBefore, `${chemistry}: the third event does not start full`).toBeLessThan(1);
      expect(out.notes.join(' ')).toMatch(/nothing resets it to full between events/i);
    });

    it(`puts back less than it took out, between events — ${chemistry}`, () => {
      const out = repeatedOutages({ ...day, chemistry, installedKWh: 200 });
      for (let i = 1; i < out.events.length; i++) {
        const withdrawn = out.events[i - 1].socBefore - out.events[i - 1].socAfter;
        const returned = out.events[i].socBefore - out.events[i - 1].socAfter;
        expect(returned, `${chemistry} recharge between ${i} and ${i + 1}`).toBeLessThan(withdrawn);
        expect(returned, 'and it does put something back').toBeGreaterThan(0);
      }
    });

    it(`ends the day lower than it started, and says so — ${chemistry}`, () => {
      const out = repeatedOutages({ ...day, chemistry, installedKWh: 200 });
      expect(out.endingSoc).toBeLessThanOrEqual(defaultAssumptions().startSoc);
      expect(out.endingSoc).toBeGreaterThan(0);
    });
  }

  it('reports the shortfall when a later outage cannot be carried', () => {
    // A small lithium installation against three outages: the first is carried, a later one is not.
    const out = repeatedOutages({ ...day, chemistry: 'LFP', installedKWh: 90, chargerCPerHour: 0.02 });
    expect(out.events[0].shortfall, 'the first outage is carried in full').toBe(false);
    expect(out.events.some(e => e.shortfall), 'a later event runs short').toBe(true);
    const short = out.events.find(e => e.shortfall)!;
    expect(short.carriedMinutes).toBeLessThan(short.askedMinutes);
  });

  it('is the same story for lead-acid, on its own model', () => {
    const sized = blocksFor(agmBlock, 225, 15, 30, 0.92).value!;
    const out = dayOfOutages(agmBlock, {
      blocks: Math.ceil(sized.blocks / 3), protectedKW: 225, tempC: 30, pathEfficiency: 0.92,
      startSoc: 1, minSoc: 0.1, chargerCPerHour: 0.05, events, dayMinutes: 1440,
    });
    expect(out.events.some(e => e.shortfall)).toBe(true);
    expect(out.events[2].socBefore).toBeLessThan(out.events[0].socBefore);
  });

  it('does not let a limited recharge window pretend to be an unlimited one', () => {
    const generous = repeatedOutages({ ...day, chemistry: 'LFP', installedKWh: 200, chargerCPerHour: 1 });
    const stingy = repeatedOutages({ ...day, chemistry: 'LFP', installedKWh: 200, chargerCPerHour: 0.02 });
    expect(generous.events[2].socBefore).toBeGreaterThan(stingy.events[2].socBefore);
  });
});

describe('the day is put to the equipment, not the equipment to the day', () => {
  it('tests whatever was sized for the chosen autonomy, unchanged by the schedule', () => {
    const short = repeatedOutages({
      chemistry: 'VRLA', protectedKW: 225, tempC: 30, dayMinutes: 1440, chargerCPerHour: 0.1,
      events: [{ atMinutes: 600, minutes: 15 }, { atMinutes: 660, minutes: 15 }, { atMinutes: 720, minutes: 15 }],
      blocks: blocksFor(agmBlock, 225, 15, 30, 0.92, 0.9).value!.blocks,
    });
    const long = repeatedOutages({
      chemistry: 'VRLA', protectedKW: 225, tempC: 30, dayMinutes: 1440, chargerCPerHour: 0.1,
      events: [{ atMinutes: 600, minutes: 15 }, { atMinutes: 660, minutes: 15 }, { atMinutes: 720, minutes: 15 }],
      blocks: blocksFor(agmBlock, 225, 120, 30, 0.92, 0.9).value!.blocks,
    });
    // The same three outages. A system sized for two hours of autonomy carries all of them; one
    // sized for fifteen minutes carries the first and then runs short, because the recharge window
    // between events is an hour and lead-acid cannot use it.
    expect(short.events[1].shortfall).toBe(true);
    expect(long.events.every(e => !e.shortfall)).toBe(true);
    expect(long.events[2].socBefore, 'and it still starts the third lower than the first').toBeLessThan(long.events[0].socBefore);
  });

  it('puts the lead-acid blocks in strings at a voltage a converter could meet', () => {
    for (const minutes of [5, 15, 60, 120]) {
      const sized = blocksFor(agmBlock, 225, minutes, 25, 0.92, 0.9).value!;
      expect(sized.stringVolts, `${minutes} min`).toBeGreaterThan(500);
      expect(sized.stringVolts, `${minutes} min`).toBeLessThan(1000);
      expect(sized.stringVolts).toBe(sized.blocksPerString * agmBlock.nominalV);
    }
  });
});
