import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..', '..');
const walk = (dir: string, out: string[] = []): string[] => {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.next' || name === 'out' || name === '.git') continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (/\.(ts|tsx|css)$/.test(name)) out.push(path);
  }
  return out;
};
const sources = walk(join(root, 'app')).concat(walk(join(root, 'src')));
/** Code only. A comment explaining why a host is not contacted must not read as contacting it. */
const codeOf = (file: string) => readFileSync(file, 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

/**
 * The product must build, and run, on a machine with no internet.
 *
 * Not a preference: `npm run dev` failed outright on the customer's laptop with a Turbopack
 * resolver error naming an internal module, because `next/font/google` fetches the typefaces from
 * fonts.googleapis.com while compiling. That had been the *fix* for a run-time request to the same
 * host — it moved the dependency rather than removing it. A build should not need the internet to
 * render the product's own type, and an engineer on a plane or in a substation should be able to
 * start the studio.
 */
describe('the studio builds and runs offline', () => {
  it('fetches no typeface from a third party, at run time or at build time', () => {
    for (const file of sources) {
      const code = codeOf(file);
      expect(code, `${file} imports a font from Google at build time`).not.toMatch(/next\/font\/google/);
      // Including the exported offer, which is the one artefact that leaves the building.
      expect(code, `${file} requests a font from Google at run time`).not.toMatch(/fonts\.(googleapis|gstatic)\.com/);
    }
  });

  it('carries the faces it names, in the repository', () => {
    const layout = readFileSync(join(root, 'app', 'layout.tsx'), 'utf8');
    const paths = [...layout.matchAll(/path:\s*'\.\/([^']+\.woff2)'/g)].map(m => m[1]);
    expect(paths.length).toBeGreaterThanOrEqual(6);
    for (const p of paths) {
      const file = join(root, 'app', p);
      expect(() => statSync(file), `${p} is named in the layout but not in the repository`).not.toThrow();
      // A real WOFF2 begins "wOF2"; a stray text file or an HTML error page is not a typeface.
      expect(readFileSync(file).subarray(0, 4).toString('latin1'), p).toBe('wOF2');
    }
  });

  it('keeps no other build-time fetch in the application sources', () => {
    for (const file of sources) {
      // A stylesheet pulled from a CDN is the same fault wearing a different hat.
      expect(codeOf(file), `${file} imports a stylesheet over the network`)
        .not.toMatch(/@import\s+url\(\s*['"]?https?:/);
    }
  });
});
