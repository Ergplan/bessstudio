import { z } from 'zod';

/**
 * Where a number came from, and how far it may be trusted.
 *
 * §14 defines three badges, and is explicit that they describe **parameter evidence, not
 * implementation status**: a beautifully implemented model fed illustrative numbers is still
 * illustrative. The badge therefore travels with the parameter set, never with the engine.
 *
 * Two rules follow, and both are enforced rather than described:
 *
 *   - A missing parameter produces a **visible assumption**, an explicitly illustrative preset, or
 *     a blocked high-confidence result. Never a quiet default.
 *   - A model's **applicability range** stays visible beside the badge, because a validated
 *     parameter outside the conditions it was validated at is an illustrative one again.
 */
export const evidenceBadges = ['illustrative', 'published-source', 'validated-against-equipment'] as const;
export type EvidenceBadge = (typeof evidenceBadges)[number];

export const badgeLabels: Record<EvidenceBadge, string> = {
  illustrative: 'Illustrative parameters',
  'published-source': 'Published-source parameters',
  'validated-against-equipment': 'Validated against equipment data',
};

export const badgeMeanings: Record<EvidenceBadge, string> = {
  illustrative: 'Plausible teaching values. Not a product specification.',
  'published-source': 'From a cited public source, with its applicability range.',
  'validated-against-equipment': 'Compared against measured data for this equipment, with a review date.',
};

/** Ranked weakest to strongest, so a set of parameters can report the weakest evidence it holds. */
export const badgeRank: Record<EvidenceBadge, number> = {
  illustrative: 0, 'published-source': 1, 'validated-against-equipment': 2,
};

/**
 * The conditions a parameter set was established under. A result computed outside these is
 * reported as extrapolated, not as validated.
 */
export const applicabilitySchema = z.object({
  temperatureC: z.tuple([z.number(), z.number()]),
  socFraction: z.tuple([z.number().min(0).max(1), z.number().min(0).max(1)]),
  /** Charge and discharge rate, in multiples of the one-hour rate. */
  cRate: z.tuple([z.number().min(0), z.number().min(0)]),
  notes: z.string().default(''),
}).strict();
export type Applicability = z.infer<typeof applicabilitySchema>;

export const provenanceSchema = z.object({
  badge: z.enum(evidenceBadges),
  /** Where the numbers came from, in words a reader can follow up. Required for anything above illustrative. */
  source: z.string().default(''),
  /** ISO date the evidence was last reviewed. Required for a validated badge. */
  reviewedOn: z.string().nullable().default(null),
  applicability: applicabilitySchema,
  /** Anything assumed rather than sourced, stated so it can be seen rather than discovered. */
  assumptions: z.array(z.string()).default([]),
}).strict().superRefine((p, ctx) => {
  if (p.badge !== 'illustrative' && !p.source.trim()) {
    ctx.addIssue({ code: 'custom', path: ['source'], message: `A ${badgeLabels[p.badge]} badge needs a source.` });
  }
  if (p.badge === 'validated-against-equipment' && !p.reviewedOn) {
    ctx.addIssue({ code: 'custom', path: ['reviewedOn'], message: 'A validated badge needs a review date.' });
  }
});
export type Provenance = z.infer<typeof provenanceSchema>;

/** The weakest badge in a set — what the whole result may claim. */
export const weakestBadge = (all: EvidenceBadge[]): EvidenceBadge =>
  all.reduce<EvidenceBadge>((worst, b) => (badgeRank[b] < badgeRank[worst] ? b : worst), 'validated-against-equipment');

/** Whether a condition sits inside what the parameters were established for. */
export const withinApplicability = (a: Applicability, at: { temperatureC: number; soc: number; cRate: number }) =>
  at.temperatureC >= a.temperatureC[0] && at.temperatureC <= a.temperatureC[1]
  && at.soc >= a.socFraction[0] && at.soc <= a.socFraction[1]
  && at.cRate >= a.cRate[0] && at.cRate <= a.cRate[1];

/** Why a condition fell outside, in the words the interface shows. Empty when it did not. */
export function outsideApplicability(a: Applicability, at: { temperatureC: number; soc: number; cRate: number }): string[] {
  const out: string[] = [];
  const range = (lo: number, hi: number, unit: string) => `${lo}–${hi}${unit}`;
  if (at.temperatureC < a.temperatureC[0] || at.temperatureC > a.temperatureC[1]) {
    out.push(`Cell temperature ${at.temperatureC.toFixed(1)} °C is outside the ${range(a.temperatureC[0], a.temperatureC[1], ' °C')} these parameters were established over.`);
  }
  if (at.soc < a.socFraction[0] || at.soc > a.socFraction[1]) {
    out.push(`State of charge ${(at.soc * 100).toFixed(0)}% is outside the ${range(a.socFraction[0] * 100, a.socFraction[1] * 100, '%')} these parameters were established over.`);
  }
  if (at.cRate < a.cRate[0] || at.cRate > a.cRate[1]) {
    out.push(`Rate ${at.cRate.toFixed(2)} C is outside the ${range(a.cRate[0], a.cRate[1], ' C')} these parameters were established over.`);
  }
  return out;
}

/**
 * A parameter that is not available.
 *
 * The alternative — a quiet default — is what §14 forbids, so a missing value is a value of this
 * type and the interface has to say something about it before a result carrying it can claim
 * anything above illustrative.
 */
export type MissingParameter = { name: string; why: string; assumedValue: number | null; assumedUnit: string };

/** The badge a result may claim, given its parameters and anything missing from them. */
export const claimableBadge = (badges: EvidenceBadge[], missing: MissingParameter[]): EvidenceBadge =>
  (missing.length ? 'illustrative' : weakestBadge(badges));
