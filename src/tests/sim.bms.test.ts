import { describe, expect, it } from 'vitest';
import {
  balance, countedSoc, defaultBalancing, defaultCountingError, defaultProtections,
  evaluate, hoursToBalance, newMemory, reset, type PackSignals, type Protection,
} from '../sim/bms';
import { pcsState, pcsStateOwner, pcsStates } from '../sim/pcs';
import { lfpParameterSet } from '../sim/presets';

/**
 * S4 — the battery management system, against what §12.4 says a user must come away understanding.
 *
 * Three claims run through the whole file, and each is checked rather than asserted: that one
 * limiting cell overrides a healthy average, that a management system reduces power before it
 * trips, and that balancing is slow because the current it balances at is three orders of
 * magnitude below the current the pack works at.
 */

const cell = lfpParameterSet.cell;
const protections = defaultProtections(cell);
const signals = (over: Partial<PackSignals> = {}): PackSignals => ({
  cellVoltageMax: 3.3, cellVoltageMin: 3.3, cellTempMax: 25, cellTempMin: 25,
  cellCurrentA: 0, communicationOk: true, insulationOk: true, contactorOk: true, ...over,
});

describe('reducing power before tripping', () => {
  it('permits everything while the signal is inside its band', () => {
    const v = evaluate(protections, signals(), newMemory(), 1, 0);
    expect(v.state).toBe('normal');
    expect(v.chargeFactor).toBe(1);
    expect(v.dischargeFactor).toBe(1);
    expect(v.open).toBe(false);
    expect(v.events).toHaveLength(0);
  });

  it('cuts the permitted current smoothly as a cell climbs towards its limit', () => {
    // Overvoltage derates from 3.57 V and permits nothing at 3.65 V, the cell's own maximum.
    const at = (volts: number) => evaluate(protections, signals({ cellVoltageMax: volts }), newMemory(), 1, 0);
    expect(at(3.56).chargeFactor).toBe(1);
    expect(at(3.61).chargeFactor).toBeCloseTo(0.5, 6);
    expect(at(3.65).chargeFactor).toBe(0);
    // And it is monotonic the whole way, rather than a cliff somewhere in the middle.
    const factors = [3.56, 3.58, 3.60, 3.62, 3.64, 3.65].map(v => at(v).chargeFactor);
    for (let i = 1; i < factors.length; i++) expect(factors[i]).toBeLessThanOrEqual(factors[i - 1]);
  });

  it('restrains only the direction that would make it worse', () => {
    const high = evaluate(protections, signals({ cellVoltageMax: 3.62 }), newMemory(), 1, 0);
    expect(high.chargeFactor, 'charging into a full cell is restrained').toBeLessThan(1);
    expect(high.dischargeFactor, 'discharging one is not').toBe(1);
    const low = evaluate(protections, signals({ cellVoltageMin: 2.58 }), newMemory(), 1, 0);
    expect(low.dischargeFactor).toBeLessThan(1);
    expect(low.chargeFactor).toBe(1);
  });

  it('says it is derating, and why, before anything trips', () => {
    const v = evaluate(protections, signals({ cellVoltageMax: 3.61 }), newMemory(), 1, 120);
    expect(v.state).toBe('derating');
    expect(v.open).toBe(false);
    expect(v.events[0].severity).toBe('limit');
    expect(v.events[0].message).toMatch(/being reduced to 50% before anything trips/);
    expect(v.events[0].owner).toBe('BMS');
  });
});

describe('delay, hysteresis, latching and reset', () => {
  it('does not trip on a limit that is touched rather than held', () => {
    const memory = newMemory();
    // Overvoltage trips at 3.70 V after 2 s. One second past it is not a trip.
    const first = evaluate(protections, signals({ cellVoltageMax: 3.71 }), memory, 1, 0);
    expect(first.open, 'one second held is not two').toBe(false);
    const second = evaluate(protections, signals({ cellVoltageMax: 3.71 }), memory, 1, 1);
    expect(second.open, 'two seconds is').toBe(true);
    expect(second.state).toBe('tripped');
    expect(second.events[0].severity).toBe('trip');
    expect(second.events[0].message).toMatch(/held past for 2 s/);
  });

  it('clears the clock only once the signal has come back past its reset point', () => {
    const memory = newMemory();
    evaluate(protections, signals({ cellVoltageMax: 3.71 }), memory, 1, 0);
    expect(memory.heldSeconds['cell-overvoltage']).toBe(1);
    // Back below the trip point but still inside the band: the clock holds rather than resetting.
    evaluate(protections, signals({ cellVoltageMax: 3.62 }), memory, 1, 1);
    expect(memory.heldSeconds['cell-overvoltage'], 'still inside the band').toBe(1);
    // Past the reset point: now it clears.
    evaluate(protections, signals({ cellVoltageMax: 3.45 }), memory, 1, 2);
    expect(memory.heldSeconds['cell-overvoltage']).toBe(0);
  });

  it('holds a raised protection through the hysteresis band rather than chattering', () => {
    const memory = newMemory();
    evaluate(protections, signals({ cellVoltageMax: 3.60 }), memory, 1, 0);
    expect(memory.raised['cell-overvoltage']).toBe(true);
    // Back below where it was raised, but not past the reset point. It stays raised.
    evaluate(protections, signals({ cellVoltageMax: 3.56 }), memory, 1, 1);
    expect(memory.raised['cell-overvoltage'], 'inside the band it stays raised').toBe(true);
    const cleared = evaluate(protections, signals({ cellVoltageMax: 3.49 }), memory, 1, 2);
    expect(memory.raised['cell-overvoltage'], 'past the reset point it clears').toBe(false);
    expect(cleared.events.at(-1)!.message).toMatch(/has recovered/);
  });

  it('keeps a latching fault raised after its cause has gone, and takes a deliberate reset', () => {
    const memory = newMemory();
    for (let t = 0; t < 3; t++) evaluate(protections, signals({ cellVoltageMax: 3.71 }), memory, 1, t);
    expect(memory.latched['cell-overvoltage']).toBe(true);
    // The cell is fine again. The fault is not.
    const after = evaluate(protections, signals({ cellVoltageMax: 3.30 }), memory, 1, 4);
    expect(after.open, 'a latching fault does not clear itself').toBe(true);
    expect(after.state).toBe('tripped');
    const cleared = reset(protections, signals({ cellVoltageMax: 3.30 }), memory);
    expect(cleared).toContain('Cell overvoltage');
    expect(evaluate(protections, signals({ cellVoltageMax: 3.30 }), memory, 1, 5).open).toBe(false);
  });

  it('refuses to reset a fault whose cause is still there', () => {
    const memory = newMemory();
    for (let t = 0; t < 3; t++) evaluate(protections, signals({ cellVoltageMax: 3.71 }), memory, 1, t);
    expect(reset(protections, signals({ cellVoltageMax: 3.71 }), memory), 'nothing to clear yet').toHaveLength(0);
    expect(memory.latched['cell-overvoltage']).toBe(true);
  });

  it('lets a non-latching fault let go on its own once its signal recovers', () => {
    const memory = newMemory();
    // Over-temperature trips after 30 s and does not latch.
    for (let t = 0; t < 31; t++) evaluate(protections, signals({ cellTempMax: 59 }), memory, 1, t);
    expect(evaluate(protections, signals({ cellTempMax: 59 }), memory, 1, 31).open).toBe(true);
    expect(evaluate(protections, signals({ cellTempMax: 35 }), memory, 1, 32).open, 'it lets go by itself').toBe(false);
  });

  it('announces a trip once rather than on every step it stays tripped', () => {
    const memory = newMemory();
    let trips = 0;
    for (let t = 0; t < 10; t++) {
      trips += evaluate(protections, signals({ cellVoltageMax: 3.71 }), memory, 1, t).events.filter(e => e.severity === 'trip').length;
    }
    expect(trips).toBe(1);
  });
});

describe('competing constraints, and the order they are reported in', () => {
  it('reports the worst first, and the same way round every time', () => {
    const memory = newMemory();
    // A hot cell derating, and a high cell tripping, in the same evaluation.
    for (let t = 0; t < 3; t++) evaluate(protections, signals({ cellVoltageMax: 3.71, cellTempMax: 48 }), memory, 1, t);
    const v = evaluate(protections, signals({ cellVoltageMax: 3.71, cellTempMax: 48 }), newMemory(), 3, 9);
    const severities = v.events.map(e => e.severity);
    expect(severities.indexOf('trip')).toBeLessThan(severities.indexOf('limit'));
    // Deterministic: the same signals give the same order, whatever the object iteration does.
    const again = evaluate(protections, signals({ cellVoltageMax: 3.71, cellTempMax: 48 }), newMemory(), 3, 9);
    expect(again.events.map(e => e.code)).toEqual(v.events.map(e => e.code));
  });

  it('takes the tightest restraint when several apply to the same direction', () => {
    const v = evaluate(protections, signals({ cellVoltageMax: 3.61, cellTempMax: 48 }), newMemory(), 1, 0);
    // Over-temperature restrains both directions; overvoltage restrains charging only.
    expect(v.chargeFactor).toBeLessThanOrEqual(v.dischargeFactor);
    expect(v.binding, 'and names whichever is tightest').toBeTruthy();
  });

  it('opens the contactors for a fault that is nothing to do with a cell', () => {
    for (const [what, over] of [
      ['insulation', { insulationOk: false }],
      ['contactor feedback', { contactorOk: false }],
    ] as const) {
      const v = evaluate(protections, signals(over), newMemory(), 1, 0);
      expect(v.open, what).toBe(true);
      expect(v.events[0].severity, what).toBe('trip');
    }
  });

  it('stops dispatching the moment it stops hearing, and opens the contactors after the delay', () => {
    // Two different things, and the distinction is deliberate. Silence is not something to derate
    // across — a plant that cannot hear its management system stops dispatching at once. Opening
    // the contactors is the heavier action and waits for the stated delay, so a momentary drop in
    // a communication bus does not cost a restart.
    const memory = newMemory();
    const early = evaluate(protections, signals({ communicationOk: false }), memory, 1, 0);
    expect(early.chargeFactor, 'nothing is permitted immediately').toBe(0);
    expect(early.dischargeFactor).toBe(0);
    expect(early.state).toBe('alarm');
    expect(early.open, 'but the contactors are still closed').toBe(false);
    for (let t = 1; t < 6; t++) evaluate(protections, signals({ communicationOk: false }), memory, 1, t);
    expect(evaluate(protections, signals({ communicationOk: false }), memory, 1, 6).open, 'five seconds later they are not').toBe(true);
  });
});

describe('one limiting cell against a healthy average', () => {
  /**
   * §12.4 names this as the thing a user has to come away understanding, so it is checked as a
   * property rather than described in a paragraph: the protections read extrema, so a pack whose
   * average is comfortable and whose weakest cell is not stops anyway.
   */
  it('stops the pack on its weakest cell, however healthy the rest are', () => {
    const healthyAverage = signals({ cellVoltageMax: 3.32, cellVoltageMin: 2.55 });
    const v = evaluate(protections, healthyAverage, newMemory(), 1, 0);
    expect(v.dischargeFactor, 'one cell near empty restrains the whole pack').toBeLessThan(1);
    expect(v.binding?.code).toBe('cell-undervoltage');
    expect(v.events[0].message).toMatch(/Cell undervoltage/);
  });

  it('stops it on the hottest cell too, not on the average temperature', () => {
    const v = evaluate(protections, signals({ cellTempMax: 50, cellTempMin: 25 }), newMemory(), 1, 0);
    expect(v.dischargeFactor).toBeLessThan(1);
    expect(v.binding?.code).toBe('cell-overtemperature');
  });
});

describe('why balancing is slow', () => {
  const b = defaultBalancing();

  it('balances at three orders of magnitude below the working current', () => {
    expect(b.currentA).toBeLessThan(cell.limits.dischargeCurrentMaxA / 500);
    expect(b.provenance).toMatch(/orders of magnitude/);
  });

  it('takes days to close a spread worth a few amp-hours', () => {
    expect(hoursToBalance(b, 3)).toBeCloseTo(20, 6);
    expect(hoursToBalance(b, 15) / 24, 'fifteen amp-hours is more than four days').toBeGreaterThan(4);
  });

  it('only runs where the voltage curve is steep enough to tell the cells apart', () => {
    const memory = newMemory();
    const low = balance(b, { soc: 0.5, spreadV: 0.05, cellV: 3.3, seconds: 3600 }, memory);
    expect(low.running, 'in the flat middle there is nothing to read').toBe(false);
    const near = balance(b, { soc: 0.95, spreadV: 0.05, cellV: 3.4, seconds: 3600 }, memory);
    expect(near.running).toBe(true);
    expect(near.movedAh).toBeCloseTo(0.15, 9);
  });

  it('burns what it moves when it is passive, and mostly keeps it when it is active', () => {
    const passive = balance({ ...b, kind: 'passive' }, { soc: 0.95, spreadV: 0.05, cellV: 3.4, seconds: 3600 }, newMemory());
    const active = balance({ ...b, kind: 'active' }, { soc: 0.95, spreadV: 0.05, cellV: 3.4, seconds: 3600 }, newMemory());
    expect(passive.lossWh).toBeGreaterThan(active.lossWh * 4);
    expect(passive.lossWh).toBeCloseTo(0.15 * 3.4, 9);
  });
});

describe('what the management system believes, against what is true', () => {
  const e = defaultCountingError();

  it('drifts across the flat middle, where there is nothing to correct against', () => {
    const memory = newMemory();
    let counted = 0.5;
    for (let h = 0; h < 10; h++) counted = countedSoc(e, { trueSoc: 0.5, capacityAh: cell.capacityAh, seconds: 3600 }, memory).counted;
    expect(counted, 'ten hours of a 50 mA offset').toBeGreaterThan(0.5);
    expect(memory.countingDriftSoc).toBeCloseTo(0.05 * 10 / cell.capacityAh, 9);
  });

  it('re-anchors near the ends, where the voltage moves enough to read', () => {
    const memory = newMemory();
    for (let h = 0; h < 10; h++) countedSoc(e, { trueSoc: 0.5, capacityAh: cell.capacityAh, seconds: 3600 }, memory);
    const anchored = countedSoc(e, { trueSoc: 0.97, capacityAh: cell.capacityAh, seconds: 3600 }, memory);
    expect(anchored.anchored).toBe(true);
    expect(anchored.driftSoc).toBe(0);
    expect(anchored.counted).toBeCloseTo(0.97, 9);
    expect(anchored.why).toMatch(/re-anchored/);
  });

  it('explains the drift as the limitation it is rather than hiding it', () => {
    const drifting = countedSoc(e, { trueSoc: 0.5, capacityAh: cell.capacityAh, seconds: 60 }, newMemory());
    expect(drifting.why).toMatch(/flat middle of an LFP curve/);
    expect(drifting.anchored).toBe(false);
  });
});

describe('the converter’s own states', () => {
  const base = { vetoed: false, elapsedSeconds: 100, prechargeSeconds: 5, tolerance: 0.02 };

  it('names a state for every situation, and who owns the transition into it', () => {
    expect(pcsStates).toHaveLength(8);
    for (const s of pcsStates) expect(pcsStateOwner[s], s).toBeTruthy();
  });

  it('reads the state off what was asked and what was managed', () => {
    expect(pcsState({ ...base, requestedW: 0, achievedW: 0 })).toBe('standby');
    expect(pcsState({ ...base, requestedW: 1e6, achievedW: 1e6 })).toBe('discharging');
    expect(pcsState({ ...base, requestedW: -1e6, achievedW: -1e6 })).toBe('charging');
    expect(pcsState({ ...base, requestedW: 1e6, achievedW: 4e5 })).toBe('derated');
    expect(pcsState({ ...base, requestedW: 1e6, achievedW: 0, vetoed: true })).toBe('faulted');
    expect(pcsState({ ...base, requestedW: 1e6, achievedW: 1e6, elapsedSeconds: 2 })).toBe('precharge');
  });

  it('counts a request met within tolerance as met, not as derated', () => {
    expect(pcsState({ ...base, requestedW: 1e6, achievedW: 995_000 })).toBe('discharging');
    expect(pcsState({ ...base, requestedW: 1e6, achievedW: 970_000 })).toBe('derated');
  });
});
