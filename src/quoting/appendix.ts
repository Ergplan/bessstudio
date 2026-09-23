import { configHash } from '../sim/hash';
import { sealIntact } from '../sim/records';
import type { SimulationRun, TimeSeriesResult } from '../sim/records';
import { badgeLabels, badgeMeanings, type EvidenceBadge } from '../sim/provenance';
import type { SizingResult } from '../sizing/engine';
import type { UpsRequirement, UpsOption } from '../sim/ups';
import * as units from '../domain/units';

/**
 * The engineering appendix, and the three rules that do not bend.
 *
 * §16 allows a concise appendix to travel with an offer, and then spends most of its words on what
 * that appendix must never become:
 *
 * - **A simulation never autonomously releases a quotation.** Nothing here issues, approves or
 *   sends anything; it produces a document for a person to attach, and records who vouched for it.
 * - **Modelled performance never becomes a warranty.** Every performance figure carries the
 *   scenario it was produced under and the badge of the evidence behind it, and the appendix says
 *   in as many words that none of it is a warranted figure.
 * - **A design change flags stale quotation assumptions.** The appendix is tied to an exact design
 *   revision by hash, and a design that has moved on invalidates it rather than quietly updating.
 *
 * Indicative contract-demand sizing stays visibly distinct from reviewed equipment selection: they
 * are separate sections with separate statuses, and the indicative one says so in its heading.
 */

export type AppendixSection = {
  heading: string;
  /** Whether this section is indicative or has been reviewed by somebody who may vouch for it. */
  status: 'indicative' | 'reviewed';
  rows: { label: string; value: string }[];
  notes: string[];
};

export type EngineeringAppendix = {
  /** The exact design revision this describes. A different hash is a different appendix. */
  designHash: string;
  /** The run it draws its performance figures from, where there is one. */
  runId: string | null;
  runHashes: { scenario: string; plant: string; policy: string; parameters: string } | null;
  badge: EvidenceBadge;
  sections: AppendixSection[];
  /** Who vouched for the engineering evidence — never the same act as approving a price. */
  evidence: { approvedBy: string; approvedAt: string } | null;
  limitations: string[];
  warnings: string[];
};

const kWh = (wh: number) => `${(wh / 1000).toLocaleString('en', { maximumFractionDigits: 1 })} kWh`;
const kW = (w: number) => `${(w / 1000).toLocaleString('en', { maximumFractionDigits: 0 })} kW`;

/**
 * The hash of a design, over everything material to what was quoted.
 *
 * The same canonical hashing the simulation records use, so "the design changed" means exactly the
 * same thing on both sides of the offer.
 */
export const designHashOf = (sizing: SizingResult, inputHash: unknown) => configHash({ sizing: summarise(sizing), input: inputHash });

const summarise = (s: SizingResult) => ({
  units: s.units, pcsCount: s.pcsCount, installedDcMWh: s.installedDcMWh,
  day1UsableMWh: s.day1UsableMWh, ratedPowerMW: s.ratedPowerMW, rteAc: s.rteAc,
  enclosureId: s.enclosure.id, pcsId: s.pcs.id, transformerId: s.transformer?.id ?? null,
});

/** Whether a quotation's assumptions still describe the design it was prepared from. */
export function staleAgainst(quotedDesignHash: string, currentDesignHash: string) {
  const stale = quotedDesignHash !== currentDesignHash;
  return {
    stale,
    message: stale
      ? 'The design has changed since this quotation was prepared. Its assumptions, its performance figures and its price are all against the earlier revision, and it needs review before it goes anywhere.'
      : 'The design is the revision this quotation was prepared from.',
  };
}

/**
 * Whether a run may be attached to this design at all.
 *
 * §18 F08's second half: a changed parameter set cannot silently reuse the old result **or its
 * validated-data badge**. So a run whose four hashes do not match the configuration in front of it
 * is refused, and the badge goes with the refusal rather than surviving it.
 */
export function runAnswers(run: SimulationRun, hashes: { scenario: string; plant: string; policy: string; parameters: string }) {
  const mismatched = [
    ['scenario', run.scenarioHash, hashes.scenario],
    ['plant', run.plantHash, hashes.plant],
    ['policy', run.policyHash, hashes.policy],
    ['parameter set', run.parameterSetHash, hashes.parameters],
  ].filter(([, was, now]) => was !== now).map(([what]) => what as string);

  if (!sealIntact(run)) {
    return { answers: false, badge: 'illustrative' as EvidenceBadge, reason: 'The run record has been altered since it was written: its own hash no longer matches its contents, so nothing it says can be attached to anything.' };
  }
  if (run.status !== 'complete') {
    return { answers: false, badge: 'illustrative' as EvidenceBadge, reason: `The run did not complete${run.failure ? `: ${run.failure}` : '.'}` };
  }
  if (mismatched.length > 0) {
    return {
      answers: false, badge: 'illustrative' as EvidenceBadge,
      reason: `This result was produced for a different ${mismatched.join(', ')}. It cannot be reused for this configuration, and its evidence badge does not carry across to it either — the configuration has to be run again.`,
    };
  }
  return { answers: true, badge: run.badge, reason: 'The result was produced for exactly this configuration.' };
}

export type AppendixInput = {
  sizing: SizingResult;
  designHash: string;
  run?: { run: SimulationRun; series: TimeSeriesResult; hashes: { scenario: string; plant: string; policy: string; parameters: string } } | null;
  /** Present for a UPS proposal, per §16's second list. */
  ups?: {
    contract: { value: number; unit: 'kVA' | 'kW' };
    requirement: UpsRequirement;
    option: UpsOption | null;
    autonomyMinutes: number;
    achievedMinutes: number | null;
    startSoc: number;
    reviewed: boolean;
    /** Which chemistry the proposal is for. §17.2 asks the appendix to name it. */
    chemistry?: 'VRLA' | 'LFP' | null;
  } | null;
  evidence?: { approvedBy: string; approvedAt: string } | null;
};

/** The appendix itself. Concise by construction: §16 lists what belongs, and nothing else does. */
export function engineeringAppendix(input: AppendixInput): EngineeringAppendix {
  const { sizing } = input;
  const sections: AppendixSection[] = [];
  const warnings: string[] = [];
  let badge: EvidenceBadge = 'illustrative';
  let runId: string | null = null;
  let runHashes: EngineeringAppendix['runHashes'] = null;

  sections.push({
    heading: 'The plant, as configured',
    status: 'reviewed',
    rows: [
      { label: 'Nominal energy', value: units.energyText(sizing.installedDcMWh) },
      { label: 'Usable energy, day one', value: units.energyText(sizing.day1UsableMWh) },
      { label: 'Power at the AC boundary', value: units.powerText(sizing.ratedPowerMW) },
      { label: 'Round-trip efficiency, AC to AC', value: `${(sizing.rteAc * 100).toFixed(1)}%` },
      { label: 'Enclosures', value: `${sizing.units} × ${sizing.enclosure.model}` },
      { label: 'Converters', value: `${sizing.pcsCount} × ${sizing.pcs.model}` },
      { label: 'Design revision', value: input.designHash.slice(0, 12) },
    ],
    notes: [
      'Nominal and usable energy are different quantities and both are stated, because a proposal that gives only one of them can be read either way.',
    ],
  });

  if (input.run) {
    const verdict = runAnswers(input.run.run, input.run.hashes);
    runId = input.run.run.id;
    runHashes = input.run.hashes;
    badge = verdict.badge;
    if (!verdict.answers) warnings.push(verdict.reason);
    const s = input.run.series;
    const lastIndex = Math.max(0, s.soc.length - 1);
    sections.push({
      heading: verdict.answers ? 'Achieved under the stated scenario' : 'A result that does not describe this configuration',
      status: 'indicative',
      rows: verdict.answers
        ? [
          { label: 'Scenario', value: s.label },
          { label: 'Duration simulated', value: `${(s.timeSeconds[lastIndex] / 3600).toFixed(2)} h` },
          { label: 'Charge at the start', value: `${(s.soc[0] * 100).toFixed(1)}%` },
          { label: 'Charge at the end', value: `${(s.soc[lastIndex] * 100).toFixed(1)}%` },
          { label: 'Highest power achieved', value: kW(Math.max(...s.achievedPowerW.map(Math.abs))) },
          { label: 'Model evidence', value: badgeLabels[badge] },
          { label: 'Engine', value: `${input.run.run.engine} ${input.run.run.engineVersion}` },
        ]
        : [{ label: 'Status', value: verdict.reason }],
      notes: [
        badgeMeanings[badge],
        'These are modelled figures under one stated scenario. They are not a warranty, not a guarantee of performance on site, and not a commitment to any of the numbers in them.',
      ],
    });
  }

  if (input.ups) {
    const u = input.ups;
    sections.push({
      heading: u.reviewed ? 'UPS duty, as reviewed' : 'UPS duty, indicative from contract demand',
      status: u.reviewed ? 'reviewed' : 'indicative',
      rows: [
        { label: 'Contract demand', value: `${u.contract.value.toLocaleString()} ${u.contract.unit}` },
        { label: 'Critical load', value: `${u.requirement.protectedKW.toFixed(0)} kW ${u.requirement.fromMeasuredLoad ? '(measured)' : '(assumed from contract demand)'}` },
        { label: 'Site power factor', value: u.requirement.fromMeasuredLoad ? 'not applied — measured load' : '0.90 assumed' },
        { label: 'Critical-load power factor', value: '0.90 assumed' },
        { label: 'UPS output required', value: `${u.requirement.requiredKW.toFixed(0)} kW / ${u.requirement.requiredKVA.toFixed(0)} kVA` },
        { label: 'Chemistry selected', value: u.chemistry === 'VRLA' ? 'Valve-regulated lead-acid (AGM)' : u.chemistry === 'LFP' ? 'Lithium iron phosphate' : 'not selected' },
        { label: 'Battery capacity', value: u.option ? `${u.option.energyKWh.toFixed(0)} kWh installed` : 'commercial selection pending' },
        { label: 'Autonomy requested', value: `${u.autonomyMinutes} min` },
        { label: 'Autonomy achieved', value: u.achievedMinutes === null ? 'not simulated' : `${u.achievedMinutes.toFixed(0)} min` },
        { label: 'Charge at the start of the outage', value: `${(u.startSoc * 100).toFixed(0)}%` },
        { label: 'Redundancy', value: 'None assumed. Headroom is not redundancy and is stated separately.' },
        { label: 'Recharge assumption', value: 'Site-limited; the rate is stated with the configuration rather than assumed.' },
        { label: 'Continuity', value: 'NOT VERIFIED — no equipment evidence for zero-break transfer, voltage quality or protection coordination.' },
      ],
      notes: u.reviewed
        ? ['This selection has been reviewed against equipment data.']
        : [
          'Indicative sizing from contract demand. Contract demand estimates site demand; it does not measure critical load, and it is not the UPS rating.',
          'This section is deliberately separate from reviewed equipment selection and must not be read as one.',
        ],
    });
    if (!u.reviewed) warnings.push('The UPS sizing in this appendix is indicative from contract demand and has not been reviewed against equipment data.');
  }

  return {
    designHash: input.designHash, runId, runHashes, badge, sections,
    evidence: input.evidence ?? null,
    warnings,
    limitations: [
      'Every performance figure here is modelled under one stated scenario and is not a warranty.',
      'Nothing in this appendix releases, prices or issues anything. A quotation is released by a person with that authority, and this document is attached to it rather than producing it.',
      'The evidence badge describes the model behind the figures, not the equipment that will be installed.',
      input.evidence
        ? `Engineering evidence approved by ${input.evidence.approvedBy} on ${input.evidence.approvedAt}. That approval covers the model and its assumptions, and no price.`
        : 'No engineering approval has been recorded against this appendix. Approving the model evidence and releasing a price are separate acts by separate people.',
    ],
  };
}
