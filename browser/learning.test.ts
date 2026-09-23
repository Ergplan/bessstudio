import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type Browser, type Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { serveExport } from './serve';
import { glossary, termsFirstMetIn } from '../src/sim/glossary';

const OUT = join(__dirname, '..', 'out');
const CHROMIUM = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium';

/**
 * The learning module, read by somebody who has never seen a battery plant.
 *
 * The lessons were written for a reader who already knew the words. The first card puts a
 * converter, auxiliaries, a battery management system and an energy management system on the screen
 * inside its first minute, and §15.1 requires jargon to be taught on first use. These check that
 * the teaching is actually on the page a beginner opens, not only in the data behind it.
 */
describe('a beginner opening the lessons', () => {
  let browser: Browser;
  let page: Page;
  let origin: string;
  let close: () => Promise<void>;

  beforeAll(async () => {
    expect(existsSync(join(OUT, 'index.html')), 'run `npm run build` first').toBe(true);
    ({ origin, close } = await serveExport(OUT));
    browser = await chromium.launch(existsSync(CHROMIUM) ? { executablePath: CHROMIUM } : {});
    page = await browser.newPage();
  }, 180_000);

  afterAll(async () => {
    await browser?.close();
    await close?.();
  });

  it('is told the difference between a megawatt and a megawatt-hour before anything else', async () => {
    await page.goto(origin + '/app/lessons/', { waitUntil: 'networkidle' });
    const primer = await page.locator('.primer').innerText();
    expect(primer).toContain('1 MW');
    expect(primer).toContain('4 h');
    expect(primer).toContain('4 MWh');
    // And the reason it matters: the same energy is three different plants.
    expect(primer.toLowerCase()).toContain('not interchangeable');
  });

  it('can open every word the studio uses, with a definition attached', async () => {
    await page.getByRole('button', { name: new RegExp(`${glossary.length} words`) }).click();
    const words = await page.locator('.words').first().innerText();
    for (const t of termsFirstMetIn('primer')) expect(words, t.id).toContain(t.term);
    const all = await page.locator('.primer').innerText();
    // Every term in the glossary is reachable from here, definition and all.
    for (const t of glossary) {
      expect(all, `${t.id} is not on the page`).toContain(t.term);
      expect(all, `${t.id} has no definition on the page`).toContain(t.plain.slice(0, 50));
    }
  });

  it('teaches the first card\'s words before the run, not during it', async () => {
    await page.goto(origin + '/app/lessons?lesson=lesson-1', { waitUntil: 'networkidle' });
    const strip = page.locator('.new-words');
    await strip.waitFor();
    const text = await strip.innerText();
    // Open by default: a reader who does not know they are missing words will not open a box.
    for (const t of glossary.filter(x => x.firstMet === 'lesson-1')) {
      expect(text, `${t.id} is not taught on the card that introduces it`).toContain(t.term);
      expect(text, `${t.id} has no definition`).toContain(t.plain.slice(0, 40));
    }
    // The abbreviation is spelt out the first time, per §15.1.
    expect(text).toContain('Battery management system (BMS)');
  });

  it('remembers which cards were finished, and offers the next one', async () => {
    await page.goto(origin + '/app/lessons/', { waitUntil: 'networkidle' });
    await page.evaluate(() =>
      localStorage.setItem('bess-studio.lessons.completed.v1', JSON.stringify(['lesson-1', 'lesson-2'])));
    await page.reload({ waitUntil: 'networkidle' });
    expect((await page.locator('.lesson-progress').innerText()).toLowerCase()).toContain('2 of 7');
    expect(await page.locator('.lesson-card.done').count()).toBe(2);
    // Continue goes to the first card not done, not to the one after the last one opened.
    const href = await page.getByRole('link', { name: /Continue/ }).getAttribute('href');
    expect(href).toContain('lesson=lesson-3');
    await page.evaluate(() => localStorage.clear());
  });

  it('hands the reader over to the studio at the end', async () => {
    await page.goto(origin + '/app/lessons/', { waitUntil: 'networkidle' });
    const handover = await page.locator('ul.handover').innerText();
    // Each thing learned, named beside the screen that uses it — otherwise the learning stays in
    // the lessons and the studio is still a wall of numbers.
    expect(handover).toContain('nameplate goes');
    expect(handover).toContain('Depth of discharge');
    expect(handover.length).toBeGreaterThan(400);
  });
});
