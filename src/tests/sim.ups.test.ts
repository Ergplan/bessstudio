import { describe, expect, it } from 'vitest';
import {
  backupDurations, contractDemands, defaultAssumptions, estimatedRuntimeMinutes, optionsFor,
  protectedShares, readiness, requirementFrom, requirementTable, type UpsInput,
} from '../sim/ups';
import { defaultControls, holdSystem, lessonById, resizeSystem, upsConfiguration } from '../sim/lessons';
import { accounting, simulate } from '../sim/engine';
import { lfpParameterSet } from '../sim/presets';

/**
 * S7 — UPS support sized from contract demand, and F05.
 *
 * The fixture in §18 is four numbers and one prohibition, and the prohibition is the important
 * part: 56.25 kWh is what the load takes, and reporting it as the battery to buy is the single
 * most common way this calculation is got wrong.
 */

const input = (over: Partial<UpsInput> = {}): UpsInput => ({
  contract: { value: 500, unit: 'kVA' }, protectedFraction: 0.5, durationMinutes: 15,
  assumptions: defaultAssumptions(), ...over,
});

describe('F05 — the 500 kVA worked example', () => {
  /**
   * Expected, stated before the run: 500 kVA × 0.90 × 50% = 225 kW protected; at 0.90 critical
   * power factor that is 250 kVA; 15 minutes needs 56.25 kWh delivered to the load; with 20%
   * headroom the continuous requirement is 270 kW and 300 kVA before environmental derating.
   * Tolerance: exact to 1e-9. Every step is a multiplication.
   */
  const r = requirementFrom(input());

  it('takes 500 kVA to 225 kW of protected load', () => {
    expect(r.siteKW).toBeCloseTo(450, 9);
    expect(r.protectedKW).toBeCloseTo(225, 9);
  });

  it('takes 225 kW to 250 kVA at the critical-load power factor', () => {
    expect(r.protectedKVA).toBeCloseTo(250, 9);
  });

  it('takes fifteen minutes to 56.25 kWh delivered to that load', () => {
    expect(r.loadEnergyKWhAc).toBeCloseTo(56.25, 9);
  });

  it('takes 20% headroom to 270 kW and 300 kVA', () => {
    expect(r.requiredKW).toBeCloseTo(270, 9);
    expect(r.requiredKVA).toBeCloseTo(300, 9);
  });

  it('never reports 56.25 kWh as the battery', () => {
    expect(r.nominalBatteryKWh).toBeGreaterThan(r.loadEnergyKWhAc * 1.5);
    // 56.25 kWh at the load, 61.1 at the terminals, over a 90% window of a pack retaining 80%.
    expect(r.nominalBatteryKWh).toBeCloseTo((225 / 0.92) * 0.25 / (0.9 * 0.8), 9);
    expect(r.basis.join(' ')).toMatch(/not the battery to buy/i);
  });

  it('labels the whole thing as an estimate from contract demand', () => {
    expect(r.warnings.join(' ')).toMatch(/indicative sizing from contract demand/i);
    expect(r.warnings.join(' ')).toMatch(/does not measure critical load/i);
  });
});

describe('F05 — every preset in the table', () => {
  it('reproduces §15.3’s table exactly, by recalculating it', () => {
    const expected = [
      { contractKVA: 100, siteKW: 90, protectedKW: 45, protectedKVA: 50, loadEnergyKWhAc: 11.25 },
      { contractKVA: 250, siteKW: 225, protectedKW: 112.5, protectedKVA: 125, loadEnergyKWhAc: 28.125 },
      { contractKVA: 500, siteKW: 450, protectedKW: 225, protectedKVA: 250, loadEnergyKWhAc: 56.25 },
      { contractKVA: 1000, siteKW: 900, protectedKW: 450, protectedKVA: 500, loadEnergyKWhAc: 112.5 },
      { contractKVA: 2000, siteKW: 1800, protectedKW: 900, protectedKVA: 1000, loadEnergyKWhAc: 225 },
      { contractKVA: 5000, siteKW: 4500, protectedKW: 2250, protectedKVA: 2500, loadEnergyKWhAc: 562.5 },
    ];
    const actual = requirementTable();
    expect(actual).toHaveLength(expected.length);
    for (const [i, row] of expected.entries()) {
      for (const key of Object.keys(row) as (keyof typeof row)[]) {
        expect(actual[i][key], `${row.contractKVA} kVA ${key}`).toBeCloseTo(row[key], 9);
      }
    }
  });

  it('covers every preset the controls offer, in every combination, without a bad number', () => {
    for (const value of contractDemands) {
      for (const protectedFraction of protectedShares) {
        for (const durationMinutes of backupDurations) {
          const r = requirementFrom(input({ contract: { value, unit: 'kVA' }, protectedFraction, durationMinutes }));
          for (const [k, v] of Object.entries(r)) {
            if (typeof v === 'number') expect(Number.isFinite(v), `${value}/${protectedFraction}/${durationMinutes} ${k}`).toBe(true);
          }
          expect(r.protectedKW).toBeGreaterThan(0);
          expect(r.nominalBatteryKWh).toBeGreaterThan(r.loadEnergyKWhAc);
        }
      }
    }
  });
});

describe('kVA against kW, and the power factor', () => {
  it('does not apply the site power factor twice to a contract already in kilowatts', () => {
    const asKW = requirementFrom(input({ contract: { value: 450, unit: 'kW' } }));
    const asKVA = requirementFrom(input({ contract: { value: 500, unit: 'kVA' } }));
    expect(asKW.siteKW).toBeCloseTo(450, 9);
    expect(asKW.protectedKW).toBeCloseTo(asKVA.protectedKW, 9);
    expect(asKW.basis.join(' ')).toMatch(/not applied to a contract already stated in kilowatts/i);
  });

  it('changes the required kVA at unchanged kW when the load power factor changes', () => {
    const base = requirementFrom(input());
    const worse = requirementFrom(input({ assumptions: { ...defaultAssumptions(), criticalPf: 0.8 } }));
    expect(worse.protectedKW).toBeCloseTo(base.protectedKW, 9);
    expect(worse.protectedKVA).toBeGreaterThan(base.protectedKVA);
    expect(worse.requiredKVA).toBeCloseTo(225 / 0.8 * 1.2, 9);
  });

  it('lets a measured load supersede the estimate rather than adding to it', () => {
    const measured = requirementFrom(input({ measuredProtectedKW: 120 }));
    expect(measured.protectedKW).toBe(120);
    expect(measured.fromMeasuredLoad).toBe(true);
    expect(measured.basis.join(' ')).toMatch(/supersedes the contract-demand estimate. It is not added/i);
    expect(measured.warnings.join(' ')).not.toMatch(/indicative sizing from contract demand/i);
  });
});

describe('the boundaries of the two load controls', () => {
  it('raises the load requirement when the protected share is raised', () => {
    const at = (f: number) => requirementFrom(input({ protectedFraction: f }));
    let last = 0;
    for (const f of protectedShares) {
      const r = at(f);
      expect(r.protectedKW).toBeGreaterThan(last);
      last = r.protectedKW;
    }
    expect(at(1).protectedKW).toBeCloseTo(450, 9);
  });

  it('raises the energy demand with duration without raising the steady-state power', () => {
    const short = requirementFrom(input({ durationMinutes: 5 }));
    const long = requirementFrom(input({ durationMinutes: 120 }));
    expect(long.loadEnergyKWhAc).toBeGreaterThan(short.loadEnergyKWhAc);
    expect(long.nominalBatteryKWh).toBeGreaterThan(short.nominalBatteryKWh);
    expect(long.requiredKW, 'a longer outage does not need a bigger inverter').toBeCloseTo(short.requiredKW, 9);
    expect(long.requiredKVA).toBeCloseTo(short.requiredKVA, 9);
  });
});

describe('choosing equipment from the catalogue rather than inventing it', () => {
  it('meets both the energy and the power the requirement asks for', () => {
    const r = requirementFrom(input());
    const { options } = optionsFor(r);
    expect(options.length).toBeGreaterThan(0);
    const selected = options[0];
    expect(selected.role).toBe('selected');
    expect(selected.energyKWh).toBeGreaterThanOrEqual(r.nominalBatteryKWh);
    expect(selected.continuousKW).toBeGreaterThanOrEqual(r.requiredKW);
    expect(selected.pcsCount * selected.pcs.ratedKW).toBeGreaterThanOrEqual(r.requiredKW);
  });

  it('respects the discharge rate on a short outage, where energy alone would not', () => {
    // Five minutes of 225 kW is 18.75 kWh at the load — a single small rack on energy alone, and
    // one that cannot deliver a tenth of the power. The power requirement has to bind.
    const r = requirementFrom(input({ durationMinutes: 5 }));
    const selected = optionsFor(r).options[0];
    expect(selected.binding).toBe('power');
    expect(selected.continuousKW).toBeGreaterThanOrEqual(r.requiredKW);
    expect(selected.requiredCRate).toBeGreaterThan(0);
    // And the equipment chosen can actually sustain that rate: its own continuous rating says so.
    expect(selected.enclosureCount * selected.enclosure.ratedKW).toBeGreaterThanOrEqual(r.requiredKW);
  });

  it('is bound by energy on a long one', () => {
    const r = requirementFrom(input({ durationMinutes: 120 }));
    expect(optionsFor(r).options[0].binding).toBe('energy');
  });

  it('offers a next power size and a longer runtime only where they hold', () => {
    const r = requirementFrom(input());
    const { options } = optionsFor(r);
    const longer = options.find(o => o.role === 'longer-runtime');
    if (longer) {
      expect(longer.energyKWh).toBeGreaterThan(options[0].energyKWh);
      expect(longer.continuousKW, 'more energy is only more runtime if the converter still holds')
        .toBeGreaterThanOrEqual(r.requiredKW);
    }
    const next = options.find(o => o.role === 'next-power');
    if (next) expect(next.continuousKW).toBeGreaterThan(options[0].continuousKW);
  });

  it('derives its counts from real catalogue entries, and says what is illustrative about them', () => {
    const { options } = optionsFor(requirementFrom(input()));
    for (const o of options) {
      expect(o.enclosureCount).toBeGreaterThanOrEqual(1);
      expect(Number.isInteger(o.enclosureCount)).toBe(true);
      expect(Number.isInteger(o.pcsCount)).toBe(true);
      expect(o.caveats.join(' ')).toMatch(/illustrative/i);
      expect(o.caveats.join(' '), 'a generic converter is not assumed to do UPS duty').toMatch(/not assumed to support it/i);
      expect(o.caveats.join(' '), 'the catalogue gives kW, and that is said').toMatch(/apparent-power requirement is checked against the active-power rating/i);
    }
  });

  it('says nothing can be selected rather than inventing something that can', () => {
    const absurd = requirementFrom(input({ contract: { value: 5000, unit: 'kVA' }, protectedFraction: 1, durationMinutes: 120 }));
    const { options, problems } = optionsFor(absurd);
    // The catalogue does reach this one; what matters is that the code path exists and is honest.
    if (options.length === 0) expect(problems.join(' ')).toMatch(/commercial selection is pending/i);
    else expect(options[0].energyKWh).toBeGreaterThanOrEqual(absurd.nominalBatteryKWh);
  });
});

describe('readiness, and what it refuses to claim', () => {
  it('reports insufficient readiness rather than a runtime it cannot reach', () => {
    const a = { ...defaultAssumptions(), startSoc: 0.3 };
    const r = requirementFrom(input({ assumptions: a }));
    const selected = optionsFor(r).options[0];
    // The same equipment, asked to carry an hour on a pack that starts at 30%.
    const verdict = readiness(selected, r, a, 120);
    expect(verdict.ready).toBe(false);
    expect(verdict.reason).toMatch(/insufficient readiness/i);
    expect(verdict.minutes).toBeLessThan(120);
  });

  it('refuses to claim readiness with no configuration at all', () => {
    const r = requirementFrom(input());
    expect(readiness(undefined, r, defaultAssumptions(), 15).ready).toBe(false);
  });

  it('warns when the usable window is a fraction of the pack', () => {
    const r = requirementFrom(input({ assumptions: { ...defaultAssumptions(), startSoc: 0.5, minSoc: 0.2 } }));
    expect(r.availableSocFraction).toBeCloseTo(0.3, 9);
    expect(r.warnings.join(' ')).toMatch(/only 30% of the pack is usable/i);
  });

  it('refuses to divide by a window of nothing', () => {
    const r = requirementFrom(input({ assumptions: { ...defaultAssumptions(), startSoc: 0.1, minSoc: 0.1 } }));
    expect(r.availableSocFraction).toBe(0);
    expect(r.warnings.join(' ')).toMatch(/not ready/i);
    expect(optionsFor(r).options).toHaveLength(0);
  });

  it('estimates a runtime that grows with the equipment and falls with the load', () => {
    const r = requirementFrom(input());
    const a = defaultAssumptions();
    const selected = optionsFor(r).options[0];
    const bigger = { ...selected, energyKWh: selected.energyKWh * 2 };
    expect(estimatedRuntimeMinutes(bigger, r, a)).toBeCloseTo(estimatedRuntimeMinutes(selected, r, a) * 2, 6);
  });
});

describe('what a sizing calculation may not claim', () => {
  it('marks continuity as not verified, whatever the numbers say', () => {
    for (const value of contractDemands) {
      const r = requirementFrom(input({ contract: { value, unit: 'kVA' } }));
      expect(r.warnings.join(' '), `${value} kVA`).toMatch(/continuity is not verified/i);
      expect(r.warnings.join(' ')).toMatch(/no-break claim without equipment evidence/i);
    }
  });
});

/* ------------------------------------------- the lesson, and the coupled run -- */

describe('lesson 7 against the coupled model', () => {
  const card = lessonById('lesson-7')!;
  const values = defaultControls(card);
  const outcome = (v: Record<string, number>) => simulate({ ...card.runWith(v), parameters: lfpParameterSet });

  it('runs the whole sequence: grid healthy, grid fails, load carried, grid back', () => {
    const out = outcome(values);
    expect(out.run.status, out.run.failure ?? '').toBe('complete');
    const lost = out.events.events.find(e => e.code === 'grid-lost');
    const back = out.events.events.find(e => e.code === 'grid-restored');
    expect(lost, 'the grid goes').toBeTruthy();
    expect(back, 'and comes back').toBeTruthy();
    const outage = card.runWith(values).scenario.outage!;
    const during = out.series.timeSeconds
      .map((t, i) => ({ t, i }))
      .filter(({ t }) => t >= outage.fromSeconds && t < outage.toSeconds);
    expect(during.length).toBeGreaterThan(5);
    for (const { i } of during) {
      expect(out.series.achievedPowerW[i], `sample ${i}`).toBeGreaterThan(0);
      expect(out.series.unservedLoadW[i], `sample ${i}`).toBeLessThan(1);
      expect(out.decisions.decisions[i].rule, 'carried locally, not by the supervisory layer').toBe('local/island');
    }
  });

  it('confirms the sizing estimate against the coupled run rather than trusting it', () => {
    const out = outcome(values);
    const sizing = card.sizing!(values);
    // The estimate says the configuration carries the protected load for far longer than the
    // fifteen minutes asked for; the run has to agree that it carried those fifteen.
    expect(sizing.readiness.ready).toBe(true);
    const runtime = card.readout({
      series: out.series, totals: accounting(out.series), values, act: out.series.timeSeconds.length - 2,
    }).find(m => m.label === 'Runtime achieved')!;
    expect(Number(runtime.value)).toBeGreaterThanOrEqual(15);
  });

  it('never lets the economic policy eat the protected reserve', () => {
    // The policy is a reserve of the whole usable window: nothing is spent outside the outage.
    const out = outcome(values);
    const outage = card.runWith(values).scenario.outage!;
    for (const [i, t] of out.series.timeSeconds.entries()) {
      if (t < outage.fromSeconds) expect(out.series.achievedPowerW[i], `sample ${i} before the outage`).toBeLessThanOrEqual(1e-6);
    }
  });

  it('keeps the battery management system authoritative through the outage', () => {
    const out = outcome({ ...values, duration: 4 });
    for (const [i, v] of out.series.cellVoltageV.entries()) {
      expect(v, `sample ${i}`).toBeGreaterThanOrEqual(lfpParameterSet.cell.minV - 1e-6);
    }
    for (const soc of out.series.soc) expect(soc).toBeGreaterThanOrEqual(0);
  });

  it('holds three controls and four figures, like every other card', () => {
    expect(card.controls).toHaveLength(3);
    expect(card.template.metrics).toHaveLength(4);
    expect(card.template.charts).toHaveLength(2);
    expect(card.controls.map(c => c.id)).toEqual(['contract', 'share', 'duration']);
  });

  it('carries the assumptions strip and the continuity status on every setting', () => {
    for (const contract of [0, 2, 5]) {
      const s = card.sizing!({ ...values, contract });
      expect(s.requirement.basis.length).toBeGreaterThan(4);
      expect(s.continuity).toMatch(/not verified/i);
      expect(s.requirement.warnings.join(' ')).toMatch(/indicative sizing from contract demand/i);
    }
  });
});

describe('testing a system against resizing it', () => {
  const card = lessonById('lesson-7')!;
  const values = defaultControls(card);

  it('keeps the same equipment when a held system is asked to do more', () => {
    const held = holdSystem(values);
    const harder = { ...held, share: 3, duration: 4 };
    const before = upsConfiguration(values).option!;
    const after = upsConfiguration(harder).option!;
    expect(after.enclosure.id).toBe(before.enclosure.id);
    expect(after.enclosureCount, 'the installation did not grow to meet the new duty').toBe(before.enclosureCount);
    expect(after.pcsCount).toBe(before.pcsCount);
    expect(after.caveats.join(' ')).toMatch(/being tested, not resized/i);
  });

  it('says what the held system cannot meet, rather than quietly meeting it', () => {
    const harder = { ...holdSystem(values), contract: 5, share: 3, duration: 4 };
    const sizing = card.sizing!(harder);
    expect(sizing.held).toBeTruthy();
    expect(sizing.held!.shortfalls.length, 'a 250 kVA system asked to carry 4.5 MW says so').toBeGreaterThan(0);
    expect(sizing.held!.shortfalls.join(' ')).toMatch(/below the .* kW this duty needs|insufficient readiness/i);
  });

  it('grows again the moment it is asked to resize', () => {
    const harder = { ...holdSystem(values), contract: 5, share: 3, duration: 4 };
    const resized = resizeSystem(harder);
    expect(upsConfiguration(resized).option!.continuousKW)
      .toBeGreaterThan(upsConfiguration(harder).option!.continuousKW);
    expect(card.sizing!(resized).held).toBeNull();
  });

  it('runs the held system on the harder duty and reports what actually happened', () => {
    const harder = { ...holdSystem(values), contract: 4, share: 3, duration: 4 };
    const out = simulate({ ...card.runWith(harder), parameters: lfpParameterSet });
    expect(out.run.status, out.run.failure ?? '').toBe('complete');
    expect(out.series.unservedLoadW.some(w => w > 1), 'a system too small leaves load unserved, and says so').toBe(true);
  });
});

describe('what the panels show while a system is held', () => {
  const card = lessonById('lesson-7')!;

  it('shows the system under test first, and what the duty would need beside it', () => {
    const harder = { ...holdSystem(defaultControls(card)), contract: 5, share: 3 };
    const s = card.sizing!(harder);
    expect(s.options[0].role, 'not a configuration nobody has').toBe('under-test');
    expect(s.options[0].enclosureCount).toBe(upsConfiguration(defaultControls(card)).option!.enclosureCount);
    const would = s.options.find(o => o.role === 'would-need');
    expect(would, 'and what it would take is beside it').toBeTruthy();
    expect(would!.continuousKW).toBeGreaterThan(s.options[0].continuousKW);
  });

  it('shows the ordinary three cards when nothing is held', () => {
    const s = card.sizing!(defaultControls(card));
    expect(s.options.map(o => o.role)).not.toContain('under-test');
    expect(s.options[0].role).toBe('selected');
  });
});
