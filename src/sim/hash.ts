/**
 * The configuration hash.
 *
 * §17.2 asks that a run's hash **change with material inputs**. The other half of that, unstated
 * but implied, is that it must *not* change with immaterial ones: if renaming a scenario
 * invalidates its cached result, the cache is useless and every comparison between two runs
 * becomes a comparison of their labels.
 *
 * So the hash is taken over a canonical form of the record with the presentational fields removed.
 * What counts as presentational is listed here, once, rather than being decided at each call site.
 *
 * This is a change-detection hash, not a cryptographic one. It is not a signature, it is not proof
 * of anything, and nothing security-bearing may rest on it. It is 128 bits of FNV-1a over a
 * canonical serialisation, which is enough that two different configurations colliding is not a
 * practical concern and little enough that it costs nothing to compute on every keystroke.
 */

/** Fields that describe a record rather than determine its result. */
export const immaterialKeys = new Set([
  'id', 'label', 'name', 'title', 'description', 'notes', 'comment',
  'createdAt', 'updatedAt', 'createdBy', 'updatedBy', 'ownerUid', 'orgId',
  'configHash', 'schemaVersion',
]);

/**
 * A canonical string for a value: object keys sorted, arrays in order, numbers written so that
 * 1, 1.0 and 1e0 cannot hash differently, and immaterial keys dropped wherever they appear.
 */
export function canonicalise(value: unknown, dropImmaterial = true): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undef';
  if (typeof value === 'number') {
    if (Number.isNaN(value)) return 'NaN';
    if (!Number.isFinite(value)) return value > 0 ? 'Inf' : '-Inf';
    // A fixed exponential form, so 1, 1.0 and 1e0 all canonicalise the same way, and -0 is 0.
    return value === 0 ? '0' : value.toExponential(12);
  }
  if (typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(v => canonicalise(v, dropImmaterial)).join(',')}]`;
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([k, v]) => v !== undefined && !(dropImmaterial && immaterialKeys.has(k)))
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalise(v, dropImmaterial)}`).join(',')}}`;
  }
  return JSON.stringify(String(value));
}

/** 128 bits of FNV-1a, as four 32-bit lanes with different offsets, printed as 32 hex characters. */
function fnv128(text: string): string {
  const offsets = [0x811c9dc5, 0x01000193, 0x9e3779b9, 0x85ebca6b];
  const lanes = offsets.map(o => o >>> 0);
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    for (let l = 0; l < 4; l++) {
      lanes[l] = (lanes[l] ^ (c + l * 31)) >>> 0;
      // 32-bit FNV prime multiply, in halves so the result stays exact in a double.
      lanes[l] = (Math.imul(lanes[l], 0x01000193) >>> 0);
    }
  }
  return lanes.map(l => (l >>> 0).toString(16).padStart(8, '0')).join('');
}

/** The configuration hash of a record: 32 hex characters, stable across renames and reorderings. */
export const configHash = (value: unknown): string => fnv128(canonicalise(value));

/** The same hash taken over everything, including the presentational fields. For diagnostics only. */
export const fullHash = (value: unknown): string => fnv128(canonicalise(value, false));

/** Whether two records would produce the same result — the question the cache actually asks. */
export const sameConfiguration = (a: unknown, b: unknown): boolean => configHash(a) === configHash(b);
