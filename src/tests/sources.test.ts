import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { externalSources } from '../catalog/sources';
import { cells, packSpecs, enclosures } from '../catalog/products';

const ROOT = resolve(__dirname, '../..');
const catalogueIds = new Set([...cells, ...packSpecs, ...enclosures].map(p => p.id));
const cell = (id: string) => cells.find(c => c.id === id)!;
const pack = (id: string) => packSpecs.find(p => p.id === id)!;
const enclosure = (id: string) => enclosures.find(e => e.id === id)!;

/**
 * The register keeps itself honest.
 *
 * A list of sources nobody checks is a bibliography, and a bibliography is decoration. These tests
 * make each entry load-bearing: a figure has to point at something that exists, a corroboration has
 * to still be true of the catalogue as it stands today, and a contradiction has to be visible in
 * the file it contradicts rather than noted here and forgotten.
 */
describe('the external source register', () => {
  it('says what was actually read', () => {
    for (const s of externalSources) {
      expect(s.url, s.id).toMatch(/^https:\/\//);
      expect(s.accessed, s.id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(s.retrievalNote.length, s.id).toBeGreaterThan(20);
      // Nothing may be claimed from a document that could not be opened.
      if (s.retrieval === 'unreachable') expect(s.figures, s.id).toHaveLength(0);
      else expect(s.figures.length, s.id).toBeGreaterThan(0);
    }
  });

  it('points every figure at something that exists', () => {
    for (const s of externalSources) {
      for (const f of s.figures) {
        expect(f.note.length, `${s.id} / ${f.label}`).toBeGreaterThan(40);
        expect(f.value.length, `${s.id} / ${f.label}`).toBeGreaterThan(0);
        if (catalogueIds.has(f.bearsOn)) continue;
        // Otherwise it names a file and a constant in it: "path/to/file.py CONSTANT".
        const [path, symbol] = f.bearsOn.split(' ');
        expect(existsSync(resolve(ROOT, path)), `${s.id}: ${path}`).toBe(true);
        expect(readFileSync(resolve(ROOT, path), 'utf8'), `${s.id}: ${f.bearsOn}`).toContain(symbol);
      }
    }
  });

  it('leaves no contradiction sitting only in the register', () => {
    for (const s of externalSources) {
      for (const f of s.figures.filter(x => x.verdict === 'contradicts')) {
        const [path] = f.bearsOn.split(' ');
        const target = catalogueIds.has(f.bearsOn) ? 'src/catalog/products.ts' : path;
        const text = readFileSync(resolve(ROOT, target), 'utf8');
        // The published number has to appear as a number where the figure it displaced used to
        // live — compared as a value, so 0.3 and 0.30 are the same claim — and the file has to
        // point back here, so the next reader finds the source rather than a bare constant.
        const published = Number(f.value.match(/[\d.]+/)![0]);
        const numbers = (text.match(/\d+(?:\.\d+)?/g) ?? []).map(Number);
        expect(numbers, `${s.id}: ${f.bearsOn} does not carry ${published}`).toContain(published);
        expect(text, `${s.id}: ${target} does not cite the register`).toContain('catalog/sources');
      }
    }
  });
});

describe('what the REPT figures do to the catalogue', () => {
  it('leaves the 314 Ah pack rating conservative against the published cell', () => {
    const p = pack('pack-16s-314');
    // The schedule's 50 A is ruled out; the cell is published at 314 A continuous. Ours sits
    // between, nearer the floor, and is still the pack's limit rather than the cell's.
    expect(p.continuousA).toBeGreaterThan(50);
    expect(p.continuousA).toBeLessThan(314 * p.parallel);
    expect(p.provenance).toBe('assumed');
  });

  it('describes the same 314 Ah format the manufacturer publishes', () => {
    const c = cell('cell-lfp-314');
    expect(Math.abs(c.thicknessMm - 71)).toBeLessThanOrEqual(1);
    expect(Math.abs(c.widthMm - 173)).toBeLessThanOrEqual(2);
    expect(c.heightMm).toBe(207);
    expect(Math.abs(c.massKg - 5.6)).toBeLessThanOrEqual(0.15);
  });

  it('does not borrow a competitor\'s cycle life', () => {
    // 10 000 cycles is REPT's number for REPT's cell. Ours is the supplied 8 000, and taking the
    // better figure would lift every retention, augmentation and price in the studio for free.
    expect(cell('cell-lfp-314').cycleLife).toBe(8000);
    expect(cell('cell-lfp-314').provenance).toBe('supplied');
  });

  it('still has a reference container a generation behind the market', () => {
    // The open question the register records: 5.015 MWh is why a 5 MWh duty buys two containers.
    expect(enclosure('enc-5mwh-20ft').labelKWh).toBeLessThan(6260);
  });
});
