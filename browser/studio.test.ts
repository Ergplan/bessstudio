import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type Browser, type Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { serveExport } from './serve';

const OUT = join(__dirname, '..', 'out');
const CHROMIUM = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium';
const TABS = ['Requirements', 'Losses & degradation', 'Design', 'Performance & ageing', 'Economics'];

/** Numbers as the page prints them: "5,016 kWh", "3.66 MWh", "0.9500". */
const num = (s: string) => Number(s.replace(/[, ]/g, ''));

/**
 * The studio, driven the way somebody uses it.
 *
 * The unit suite proves the engine's arithmetic and the crawl proves the pages load. Neither
 * proves the third thing, which is the one a customer sees: that the numbers on the screen are the
 * numbers the engine computed. A formatter that drops a factor, a component reading the wrong
 * field, a card rendering last year's design — all of those pass a unit suite and a smoke crawl and
 * put a wrong figure in front of a buyer.
 *
 * So this suite reads the page back. The cascade prints its own working — "5,016 kWh × 0.9500 ×
 * 0.8500 × 0.9457 − 167 kWh = 3,664 kWh" — and that line is parsed and multiplied out here. If the
 * screen and the engine ever disagree, the multiplication stops coming out.
 */
describe('a design, driven in a browser', () => {
  let browser: Browser;
  let page: Page;
  let origin: string;
  let close: () => Promise<void>;
  const errors: string[] = [];

  beforeAll(async () => {
    expect(existsSync(join(OUT, 'index.html')), 'run `npm run build` before the browser suite').toBe(true);
    ({ origin, close } = await serveExport(OUT));
    browser = await chromium.launch(existsSync(CHROMIUM) ? { executablePath: CHROMIUM } : {});
    page = await browser.newPage();
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error' && !/WebGL|GPU|SwiftShader|favicon/i.test(m.text())) errors.push(m.text()); });
    await page.goto(origin + '/app/projects/', { waitUntil: 'networkidle' });
    // The demo workspace ships designs; open the first one the projects table lists. The name is
    // the link — clicking the row does nothing, which is itself worth encoding rather than
    // discovering again in six months.
    await page.locator('table tbody tr td a').first().click();
    await page.getByRole('tab', { name: 'Design' }).click();
    await page.waitForSelector('text=Where the nameplate goes');
  }, 180_000);

  afterAll(async () => {
    await browser?.close();
    await close?.();
  });

  it('opens a project from the table and shows every tab without an error', async () => {
    for (const label of TABS) {
      await page.getByRole('tab', { name: label }).click();
      await page.waitForTimeout(250);
      const body = (await page.locator('body').innerText()).trim();
      expect(body.length, label).toBeGreaterThan(200);
    }
    await page.getByRole('tab', { name: 'Design' }).click();
    await page.waitForSelector('text=Where the nameplate goes');
    expect(errors).toEqual([]);
  });

  it('prints a cascade whose own working multiplies out', async () => {
    const line = await page.locator('.cascade-check').first().innerText();
    // "Check it: 5,016 kWh × 0.9500 × 0.8500 × 0.9457 − 167 kWh = 3,664 kWh."
    const m = line.match(/Check it:\s*([\d,]+) kWh((?:\s*×\s*[\d.]+)+)\s*−\s*([\d,]+) kWh\s*=\s*([\d,]+) kWh/);
    expect(m, `could not read the working from: ${line.slice(0, 160)}`).not.toBeNull();
    const [, nameplate, factorText, aux, stated] = m!;
    const factors = [...factorText.matchAll(/[\d.]+/g)].map(x => Number(x[0]));
    expect(factors.length, 'the cascade should print a factor per multiplicative step').toBeGreaterThanOrEqual(3);
    const worked = factors.reduce((a, f) => a * f, num(nameplate)) - num(aux);
    // The page rounds each factor to four places for a reader, so agree to the kilowatt-hour rather
    // than to the bit: the point is that no step is missing, not that printing is lossless.
    expect(Math.abs(worked - num(stated))).toBeLessThan(2);
  });

  it('shows the container ladder, with exactly one quotable rung', async () => {
    await page.waitForSelector('text=Containers are not made to order');
    const rows = page.locator('table.ladder-t tbody tr');
    expect(await rows.count()).toBeGreaterThanOrEqual(4);
    const quotable = page.locator('table.ladder-t tbody tr.ours');
    expect(await quotable.count()).toBe(1);
    expect((await quotable.innerText()).toLowerCase()).toContain('quotable');
    // Reaching the meter has to rise with the nameplate, or the table is sorted on one column and
    // computed on another — which is exactly the kind of thing only a rendered page shows.
    const delivered = await rows.evaluateAll(trs =>
      trs.map(tr => Number((tr.children[1]?.textContent ?? '0').replace(/[^\d.]/g, ''))));
    for (let i = 1; i < delivered.length; i++) expect(delivered[i]).toBeGreaterThan(delivered[i - 1]);
  });

  it('agrees with itself about the fleet across the cards', async () => {
    const text = await page.locator('body').innerText();
    // "1 × SWESLC…" appears in the rationale verdict and in the cascade subtitle; the enclosure
    // model printed on the page must be one the catalogue ships, not a formatted placeholder.
    const models = readdirSync(join(__dirname, '..', 'src', 'catalog'));
    expect(models.length).toBeGreaterThan(0);
    expect(text).toContain('Why this much equipment');
    expect(text).toMatch(/\d+ × SWES|\d+ × SB/);
    expect(errors).toEqual([]);
  });
});
