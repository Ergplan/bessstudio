import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type Browser, type Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { serveExport } from './serve';
import { lessons } from '../src/sim/lessons';

const OUT = join(__dirname, '..', 'out');
const CHROMIUM = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium';
const SECTIONS = ['The plant', 'The two devices', 'Inside a cell', 'What it meant'];
const built = lessons.filter(l => !l.arrivesIn);

/**
 * Every card, in the four parts a card now has.
 *
 * The player used to stack a dozen sections on one page — the plant, the charts, the stack, the
 * states, the event log, the comparison, the sizing, the conclusion — and a reader asking "what is
 * happening" had to scroll past what the contactors were doing to find out. It is four sections
 * now, and the point of the split is that each one answers the question in its own label.
 *
 * The checks run against **every** built card rather than the first, because the whole change was
 * to stop the machine being something only lesson one draws.
 */
describe('the lesson player', () => {
  let browser: Browser;
  let page: Page;
  let origin: string;
  let close: () => Promise<void>;

  const open = async (id: string, section?: string) => {
    await page.goto(`${origin}/app/lessons?lesson=${id}`, { waitUntil: 'networkidle' });
    if (section) await page.getByRole('tab', { name: section }).click();
    await page.waitForTimeout(250);
  };

  beforeAll(async () => {
    expect(existsSync(join(OUT, 'index.html')), 'run `npm run build` first').toBe(true);
    ({ origin, close } = await serveExport(OUT));
    browser = await chromium.launch(existsSync(CHROMIUM) ? { executablePath: CHROMIUM } : {});
    page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  }, 180_000);

  afterAll(async () => {
    await browser?.close();
    await close?.();
  });

  it('offers the same four sections on every card, and opens on the plant', async () => {
    for (const card of built) {
      await open(card.template.id);
      const tabs = await page.locator('[role="tab"]').allInnerTexts();
      const names = tabs.map(x => x.toLowerCase());
      for (const s of SECTIONS) {
        expect(names, `${card.template.id} is missing "${s}"`).toContain(s.toLowerCase());
      }
      // The plant is where a reader lands: the question "what is happening" comes first.
      expect(await page.locator('.plant svg.iso').count(), card.template.id).toBe(1);
    }
  }, 300_000);

  it('draws the enclosure filled to the charge level, on every card', async () => {
    for (const card of built) {
      await open(card.template.id);
      const label = await page.locator('svg.iso').getAttribute('aria-label');
      expect(label, card.template.id).toMatch(/Enclosure at \d+ percent charge/);
      expect(await page.locator('.iso-level-top').count(), card.template.id).toBe(1);
      // Two gauges, never one: a single fill bar would teach the water-cup intuition.
      expect(await page.locator('.gauge').count(), card.template.id).toBe(2);
    }
  }, 300_000);

  it('reads out both devices against their limits, on every card', async () => {
    for (const card of built) {
      await open(card.template.id, 'The two devices');
      const instruments = page.locator('.instr');
      expect(await instruments.count(), card.template.id).toBe(2);
      const text = (await instruments.allInnerTexts()).join(' | ').toLowerCase();
      expect(text, card.template.id).toContain('battery management system');
      expect(text, card.template.id).toContain('power conversion system');
      // Signals that have a limit are drawn against it, with the derate band marked.
      expect(await page.locator('.instr-bar').count(), card.template.id).toBeGreaterThanOrEqual(4);
      expect(await page.locator('.instr-bar i.derate').count(), card.template.id).toBeGreaterThanOrEqual(3);
      // Each panel says what a real one would show that this model does not carry.
      expect(await page.locator('.instr-absent').count(), card.template.id).toBe(2);
    }
  }, 300_000);

  it('never reports a negative amount held back', async () => {
    // The battery supplies the losses as well as the load, so measuring what was held back against
    // the battery side reads below zero on every discharge. It is measured at the connection, where
    // the request was made.
    for (const card of built) {
      await open(card.template.id, 'The two devices');
      const row = page.locator('.instr-row', { hasText: 'Held back' }).first();
      const value = await row.locator('.instr-value').innerText();
      expect(Number(value.replace(/[^\d.-]/g, '')), `${card.template.id}: ${value}`).toBeGreaterThanOrEqual(0);
    }
  }, 300_000);

  it('explains the flat voltage with the chemistry that causes it, on every card', async () => {
    for (const card of built) {
      await open(card.template.id, 'Inside a cell');
      const chem = await page.locator('.chem').innerText();
      expect(chem, card.template.id).toContain('LiFePO');
      expect(chem, card.template.id).toContain('FePO');
      // Either the plateau is being explained or the reader is at one of the ends where it stops.
      // A card that finishes near full charge is off the plateau, and saying so is the right answer.
      expect(chem.toLowerCase(), card.template.id).toMatch(/plateau|one crystal runs out/);
      // A schematic that says it is one. The engine has no particles in it.
      expect(chem.toLowerCase(), card.template.id).toContain('schematic');
      expect(await page.locator('.chem-particle.lithiated').count(), card.template.id).toBeGreaterThan(3);
    }
  }, 300_000);

  it('names the supply and the offtake from the run, not from a setting', async () => {
    await open('lesson-1');
    expect((await page.locator('.plant-flow').innerText()).toLowerCase()).toContain('grid');

    await page.getByRole('button', { name: 'Carrying an outage' }).click();
    await page.waitForTimeout(400);
    expect((await page.locator('.plant-flow').innerText()).toLowerCase()).toContain('islanded');

    await page.getByRole('button', { name: 'Charging from solar' }).click();
    await page.waitForTimeout(400);
    const flow = (await page.locator('.plant-flow').innerText()).toLowerCase();
    expect(flow).toContain('array');
    expect(flow).toContain('storing it');

    // The general rule — an array in the run names an array, a site behind an outage names the site
    // — is checked against synthetic series in `src/tests/plantview.test.ts`, because what the flow
    // says depends on the moment being shown and a card resting at midnight is right to say "grid".
  }, 120_000);

  it('keeps the dial with the run rather than four sections below it', async () => {
    await open('lesson-2');
    // Controls sit above the section switcher, so changing one thing never needs a scroll hunt.
    const controls = await page.locator('.controls-row input[type="range"]').count();
    expect(controls).toBeGreaterThan(0);
  });
});
