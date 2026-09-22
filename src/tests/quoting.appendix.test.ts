import { describe, expect, it } from 'vitest';
import { designHashOf, engineeringAppendix, runAnswers, staleAgainst } from '../quoting/appendix';
import { defaultSizingInput, sizeSystem } from '../sizing/engine';
import { conversionCaveat, designFromLesson } from '../quoting/conversion';
import { simulate } from '../sim/engine';
import { chargeDischargeScenario } from '../sim/lessons';
import { lfpParameterSet, manualPolicy, teachingPlant } from '../sim/presets';
import { scenarioSchema, sealWith, simulationRunSchema } from '../sim/records';
import { can, roles, type Role } from '../platform/types';
import { decodeRun, encode, sealRun } from '../sim/store';
import { defaultAssumptions, optionsFor, requirementFrom } from '../sim/ups';

/**
 * S11 — what may travel with an offer, and what may not.
 *
 * §16 gives three rules that do not bend, and each of them is a test here: a simulation never
 * releases a quotation, modelled performance never becomes a warranty, and a design change flags
 * the assumptions it invalidated rather than quietly updating them. F08's second half lives here
 * too: a changed parameter set cannot reuse the old result **or its badge**.
 */

const sizing = () => sizeSystem(defaultSizingInput());
const run = (over: Record<string, unknown> = {}) => simulate({
  scenario: sealWith(scenarioSchema, { ...chargeDischargeScenario, ...over }),
  plant: teachingPlant, policy: manualPolicy, parameters: lfpParameterSet, manualRequestW: 1_000_000,
});
const hashesFor = (scenarioHash: string) => ({
  scenario: scenarioHash, plant: teachingPlant.configHash,
  policy: manualPolicy.configHash, parameters: lfpParameterSet.configHash,
});

describe('F08 — a changed configuration cannot reuse the old result or its badge', () => {
  it('accepts a result produced for exactly this configuration', () => {
    const out = run();
    const verdict = runAnswers(out.run, hashesFor(chargeDischargeScenario.configHash));
    expect(verdict.answers).toBe(true);
    expect(verdict.badge).toBe(out.run.badge);
    expect(verdict.reason).toMatch(/exactly this configuration/i);
  });

  it('refuses it for a changed scenario, and refuses its badge with it', () => {
    const out = run();
    const moved = sealWith(scenarioSchema, { ...chargeDischargeScenario, initialSoc: 0.55 });
    const verdict = runAnswers(out.run, hashesFor(moved.configHash));
    expect(verdict.answers).toBe(false);
    expect(verdict.badge, 'the badge does not survive the mismatch').toBe('illustrative');
    expect(verdict.reason).toMatch(/produced for a different scenario/i);
    expect(verdict.reason).toMatch(/does not carry across/i);
  });

  it('names every part of the configuration that moved', () => {
    const out = run();
    const verdict = runAnswers(out.run, {
      scenario: 'x'.repeat(32), plant: 'y'.repeat(32), policy: manualPolicy.configHash, parameters: 'z'.repeat(32),
    });
    expect(verdict.reason).toMatch(/scenario/);
    expect(verdict.reason).toMatch(/plant/);
    expect(verdict.reason).toMatch(/parameter set/);
    expect(verdict.reason).not.toMatch(/policy,/);
  });

  it('refuses a run whose own record has been tampered with', () => {
    const out = run();
    const tampered = { ...out.run, badge: 'validated-against-equipment' as const };
    const verdict = runAnswers(tampered, hashesFor(chargeDischargeScenario.configHash));
    expect(verdict.answers).toBe(false);
    expect(verdict.badge).toBe('illustrative');
    expect(verdict.reason).toMatch(/altered since it was written/i);
  });

  it('refuses a run that did not complete', () => {
    // Sealed properly, so the refusal is about the status rather than about a broken record.
    const out = run();
    const failed = sealWith(simulationRunSchema, {
      ...out.run, status: 'failed', failure: 'The solver did not converge.', finishedAt: null,
    });
    const verdict = runAnswers(failed, hashesFor(chargeDischargeScenario.configHash));
    expect(verdict.answers).toBe(false);
    expect(verdict.reason).toMatch(/did not complete/i);
    expect(verdict.reason).toMatch(/did not converge/i);
    expect(verdict.badge).toBe('illustrative');
  });

  it('carries the refusal into the appendix rather than dropping the section', () => {
    const out = run();
    const moved = sealWith(scenarioSchema, { ...chargeDischargeScenario, initialSoc: 0.55 });
    const a = engineeringAppendix({
      sizing: sizing(), designHash: 'd'.repeat(32),
      run: { run: out.run, series: out.series, hashes: hashesFor(moved.configHash) },
    });
    expect(a.badge).toBe('illustrative');
    expect(a.warnings.join(' ')).toMatch(/cannot be reused/i);
    expect(a.sections.some(s => /does not describe this configuration/i.test(s.heading))).toBe(true);
  });
});

describe('a design change flags the assumptions it invalidated', () => {
  it('knows when the design is the one the quotation was prepared from', () => {
    const s = sizing();
    const hash = designHashOf(s, s.input);
    expect(staleAgainst(hash, hash).stale).toBe(false);
    expect(staleAgainst(hash, hash).message).toMatch(/is the revision this quotation was prepared from/i);
  });

  it('flags it when the design has moved on, and says what that means', () => {
    const before = sizing();
    const after = sizeSystem({ ...defaultSizingInput(), durationH: 4 });
    const verdict = staleAgainst(designHashOf(before, before.input), designHashOf(after, after.input));
    expect(verdict.stale).toBe(true);
    expect(verdict.message).toMatch(/assumptions.*performance figures.*price/i);
    expect(verdict.message).toMatch(/needs review/i);
  });

  it('is unmoved by a change that does not change the plant', () => {
    const a = sizing();
    // The same design, computed twice, is the same revision.
    expect(designHashOf(a, a.input)).toBe(designHashOf(sizing(), sizing().input));
  });
});

describe('the appendix, and the three rules that do not bend', () => {
  const appendix = () => {
    const s = sizing();
    const out = run();
    return engineeringAppendix({
      sizing: s, designHash: designHashOf(s, s.input),
      run: { run: out.run, series: out.series, hashes: hashesFor(chargeDischargeScenario.configHash) },
    });
  };

  it('carries what §16 asks it to carry, and is short', () => {
    const a = appendix();
    const rows = a.sections.flatMap(s => s.rows.map(r => r.label.toLowerCase()));
    for (const needed of ['nominal energy', 'usable energy, day one', 'power at the ac boundary', 'round-trip efficiency, ac to ac', 'model evidence']) {
      expect(rows, needed).toContain(needed);
    }
    expect(a.sections.length, 'concise, per §16').toBeLessThanOrEqual(3);
  });

  it('never turns modelled performance into a warranty', () => {
    const a = appendix();
    const text = [...a.limitations, ...a.sections.flatMap(s => s.notes)].join(' ');
    expect(text).toMatch(/not a warranty/i);
    expect(text).toMatch(/one stated scenario/i);
    expect(text).not.toMatch(/\bguarantee[sd]?\b(?! of performance on site)/i);
  });

  it('releases nothing by itself, and says so', () => {
    const a = appendix();
    expect(a.limitations.join(' ')).toMatch(/nothing in this appendix releases, prices or issues anything/i);
    expect(a.limitations.join(' ')).toMatch(/released by a person with that authority/i);
  });

  it('ties itself to an exact design revision', () => {
    const s = sizing();
    const hash = designHashOf(s, s.input);
    const a = engineeringAppendix({ sizing: s, designHash: hash });
    expect(a.designHash).toBe(hash);
    expect(a.sections[0].rows.some(r => r.label === 'Design revision' && r.value === hash.slice(0, 12))).toBe(true);
  });

  it('says when nobody has approved the engineering evidence', () => {
    const a = appendix();
    expect(a.evidence).toBeNull();
    expect(a.limitations.join(' ')).toMatch(/no engineering approval has been recorded/i);
    expect(a.limitations.join(' ')).toMatch(/separate acts by separate people/i);
  });

  it('records who approved the evidence, and that it covers no price', () => {
    const s = sizing();
    const a = engineeringAppendix({
      sizing: s, designHash: designHashOf(s, s.input),
      evidence: { approvedBy: 'A. Engineer', approvedAt: '2026-02-01' },
    });
    expect(a.evidence?.approvedBy).toBe('A. Engineer');
    expect(a.limitations.join(' ')).toMatch(/covers the model and its assumptions, and no price/i);
  });
});

describe('the UPS appendix, and what stays visibly indicative', () => {
  const upsAppendix = (reviewed: boolean) => {
    const s = sizing();
    const requirement = requirementFrom({
      contract: { value: 500, unit: 'kVA' }, protectedFraction: 0.5, durationMinutes: 15,
      assumptions: defaultAssumptions(),
    });
    return engineeringAppendix({
      sizing: s, designHash: designHashOf(s, s.input),
      ups: {
        contract: { value: 500, unit: 'kVA' }, requirement, option: optionsFor(requirement).options[0],
        autonomyMinutes: 15, achievedMinutes: 15, startSoc: 1, reviewed,
      },
    });
  };

  it('carries the contract demand with its units, and both power factors', () => {
    const a = upsAppendix(false);
    const ups = a.sections.find(s => /UPS duty/i.test(s.heading))!;
    const rows = Object.fromEntries(ups.rows.map(r => [r.label, r.value]));
    expect(rows['Contract demand']).toBe('500 kVA');
    expect(rows['Site power factor']).toMatch(/0.90/);
    expect(rows['Critical-load power factor']).toMatch(/0.90/);
    expect(rows['UPS output required']).toMatch(/270 kW \/ 300 kVA/);
    expect(rows['Autonomy requested']).toBe('15 min');
    expect(rows['Charge at the start of the outage']).toBe('100%');
    expect(rows['Continuity']).toMatch(/NOT VERIFIED/);
  });

  it('keeps indicative sizing visibly distinct from reviewed selection', () => {
    const indicative = upsAppendix(false).sections.find(s => /UPS duty/i.test(s.heading))!;
    const reviewed = upsAppendix(true).sections.find(s => /UPS duty/i.test(s.heading))!;
    expect(indicative.status).toBe('indicative');
    expect(indicative.heading).toMatch(/indicative from contract demand/i);
    expect(indicative.notes.join(' ')).toMatch(/must not be read as one/i);
    expect(reviewed.status).toBe('reviewed');
    expect(reviewed.heading).toMatch(/as reviewed/i);
    expect(upsAppendix(false).warnings.join(' ')).toMatch(/has not been reviewed against equipment data/i);
    expect(upsAppendix(true).warnings.join(' ')).not.toMatch(/has not been reviewed/i);
  });
});

describe('approving evidence is not approving a price', () => {
  it('lets an engineer vouch for the model and not release a price', () => {
    expect(can('engineer', 'evidence.approve')).toBe(true);
    expect(can('engineer', 'quote.approve')).toBe(false);
  });

  it('lets an approver release a price without vouching for a solver setting', () => {
    expect(can('approver', 'quote.approve')).toBe(true);
    expect(can('approver', 'evidence.approve')).toBe(false);
  });

  it('keeps both out of the hands of everyone who should not have them', () => {
    for (const role of roles.filter(r => !['owner', 'admin', 'engineer'].includes(r)) as Role[]) {
      expect(can(role, 'evidence.approve'), role).toBe(false);
    }
    for (const role of ['sales', 'engineer', 'viewer', 'customer'] as Role[]) {
      expect(can(role, 'quote.approve'), role).toBe(false);
    }
  });

  it('gives an owner and an admin both, because they are the roles that answer for both', () => {
    for (const role of ['owner', 'admin'] as Role[]) {
      expect(can(role, 'evidence.approve'), role).toBe(true);
      expect(can(role, 'quote.approve'), role).toBe(true);
    }
  });
});

describe('from a lesson to a design', () => {
  it('carries the duty and leaves the teaching plant behind', () => {
    const c = designFromLesson({ lessonId: 'lesson-7', lessonLabel: 'UPS support by contract demand', values: { contract: 2, share: 1, duration: 1 } });
    // 500 kVA, 50%, 15 minutes: 270 kW with headroom, for a quarter of an hour.
    expect(c.input.powerMW).toBeCloseTo(0.27, 9);
    expect(c.input.durationH).toBeCloseTo(0.25, 9);
    expect(c.input.applicationId).toBe('backup-power');
    // The teaching plant's own equipment does not come across.
    expect(c.input.enclosureId).toBe(defaultSizingInput().enclosureId);
    expect(c.input.cyclesPerDay, 'a backup duty is not a cycling duty').toBe(1);
  });

  it('says where every figure came from', () => {
    const c = designFromLesson({ lessonId: 'lesson-7', lessonLabel: 'UPS', values: {} });
    expect(c.provenance.length).toBeGreaterThan(2);
    for (const p of c.provenance) {
      expect(p.from.length, p.field).toBeGreaterThan(20);
      expect(p.value).not.toMatch(/NaN|undefined/);
    }
    expect(c.provenance.find(p => p.field === 'Power')!.from).toMatch(/not a measurement/i);
  });

  it('lists what the design still needs before it is about anywhere', () => {
    const c = designFromLesson({ lessonId: 'lesson-1', lessonLabel: 'Charge and discharge', values: { power: 2_000_000 } });
    expect(c.input.powerMW).toBeCloseTo(2, 9);
    expect(c.outstanding.length).toBeGreaterThan(2);
    expect(c.outstanding.join(' ')).toMatch(/measured load profile/i);
    expect(c.outstanding.join(' ')).toMatch(/reviewed against data sheets/i);
    expect(conversionCaveat).toMatch(/neither is a proposal about a site/i);
  });

  it('produces a design the sizing engine will actually run', () => {
    for (const lessonId of ['lesson-1', 'lesson-7']) {
      const c = designFromLesson({ lessonId, lessonLabel: lessonId, values: { contract: 4, share: 3, duration: 4, power: 2_500_000 } });
      const s = sizeSystem(c.input);
      expect(s.units, lessonId).toBeGreaterThanOrEqual(1);
      expect(Number.isFinite(s.installedDcMWh), lessonId).toBe(true);
      expect(s.rteAc).toBeGreaterThan(0);
    }
  });
});

describe('a stored run links to the project revision it was produced against', () => {
  it('carries the project and the design revision with it', () => {
    const out = run();
    const s = sizing();
    const stored = sealRun({
      orgId: 'org_x', ownerUid: 'u1', at: '2026-02-01T00:00:00.000Z',
      projectId: 'prj_1', designHash: designHashOf(s, s.input),
      run: out.run, series: out.series, decisions: out.decisions, events: out.events,
    });
    expect(stored.projectId).toBe('prj_1');
    expect(stored.designHash).toBe(designHashOf(s, s.input));
    // And it survives the crossing into storage and back unchanged.
    const back = decodeRun(encode(stored));
    expect(back.projectId).toBe('prj_1');
    expect(back.designHash).toBe(stored.designHash);
    expect(back.record.configHash).toBe(stored.record.configHash);
  });

  it('refuses a stored run whose record was edited after it was sealed', () => {
    const out = run();
    const stored = sealRun({
      orgId: 'org_x', ownerUid: 'u1', at: '2026-02-01T00:00:00.000Z',
      run: out.run, series: out.series, decisions: out.decisions, events: out.events,
    });
    const tampered = JSON.stringify({ ...stored, record: { ...stored.record, badge: 'validated-against-equipment' } });
    expect(() => decodeRun(tampered)).toThrow(/edited after it was sealed/i);
  });

  it('puts the kept result into the appendix, and refuses it once the design moves', () => {
    const s = sizing();
    const out = run();
    const hashes = hashesFor(chargeDischargeScenario.configHash);
    const good = engineeringAppendix({ sizing: s, designHash: designHashOf(s, s.input), run: { run: out.run, series: out.series, hashes } });
    expect(good.warnings).toHaveLength(0);
    expect(good.runId).toBe(out.run.id);
    expect(good.sections.some(x => /Achieved under the stated scenario/.test(x.heading))).toBe(true);

    const moved = sealWith(scenarioSchema, { ...chargeDischargeScenario, initialSoc: 0.42 });
    const stale = engineeringAppendix({ sizing: s, designHash: designHashOf(s, s.input), run: { run: out.run, series: out.series, hashes: hashesFor(moved.configHash) } });
    expect(stale.warnings.length).toBeGreaterThan(0);
    expect(stale.badge).toBe('illustrative');
  });

  it('names the chemistry the proposal is for', () => {
    const s = sizing();
    const requirement = requirementFrom({
      contract: { value: 500, unit: 'kVA' }, protectedFraction: 0.5, durationMinutes: 15, assumptions: defaultAssumptions(),
    });
    const withChemistry = (chemistry: 'VRLA' | 'LFP' | null) => engineeringAppendix({
      sizing: s, designHash: designHashOf(s, s.input),
      ups: { contract: { value: 500, unit: 'kVA' }, requirement, option: null, autonomyMinutes: 15, achievedMinutes: null, startSoc: 1, reviewed: false, chemistry },
    }).sections.find(x => /UPS duty/i.test(x.heading))!.rows.find(r => r.label === 'Chemistry selected')!.value;
    expect(withChemistry('LFP')).toMatch(/lithium iron phosphate/i);
    expect(withChemistry('VRLA')).toMatch(/lead-acid/i);
    expect(withChemistry(null)).toBe('not selected');
  });
});
