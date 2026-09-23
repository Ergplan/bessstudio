import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type Browser, type Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { serveExport } from './serve';

const OUT = join(__dirname, '..', 'out');
const CHROMIUM = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium';

/**
 * The first card, as a dashboard.
 *
 * A beginner meets the machine here, so the check is that the machine is on the screen: an
 * enclosure that fills, the supply and the offtake named for the occasion chosen, and the two sets
 * of signals an engineer would open. The charts are live — a changed control reruns the model — so
 * these read the page after moving a control rather than trusting a fixture.
 */
describe('the first lesson as a dashboard', () => {
  let browser: Browser;
  let page: Page;
  let origin: string;
  let close: () => Promise<void>;

  beforeAll(async () => {
    expect(existsSync(join(OUT, 'index.html')), 'run `npm run build` first').toBe(true);
    ({ origin, close } = await serveExport(OUT));
    browser = await chromium.launch(existsSync(CHROMIUM) ? { executablePath: CHROMIUM } : {});
    page = await browser.newPage();
    await page.goto(origin + '/app/lessons?lesson=lesson-1', { waitUntil: 'networkidle' });
    await page.waitForSelector('.dash');
  }, 180_000);

  afterAll(async () => {
    await browser?.close();
    await close?.();
  });

  it('draws the enclosure, filled to the charge level', async () => {
    const label = await page.locator('svg.iso').getAttribute('aria-label');
    expect(label).toMatch(/Enclosure at \d+ percent charge/);
    // The fill is a real polygon whose height follows the charge, not a picture.
    expect(await page.locator('.iso-level-top').count()).toBe(1);
    expect(await page.locator('.iso-rib').count()).toBeGreaterThan(3);
  });

  it('shows two gauges, because one of them would be a lie', async () => {
    // Uppercased by the stylesheet, so compared without case.
    const gauges = (await page.locator('.gauge').allInnerTexts()).map(g => g.toLowerCase());
    expect(gauges).toHaveLength(2);
    expect(gauges[0]).toContain('charge level');
    expect(gauges[1]).toContain('cell voltage');
    // The reason for the second one is stated, not assumed.
    expect(gauges[1]).toMatch(/fuel gauge|barely|millivolt|mv/);
  });

  it('names the supply and the offtake for the occasion the learner picked', async () => {
    const flow = () => page.locator('.dash-flow').innerText();
    expect(await flow()).toContain('grid');

    await page.getByRole('button', { name: 'Carrying an outage' }).click();
    await page.waitForTimeout(400);
    expect(await flow()).toContain('islanded');

    await page.getByRole('button', { name: 'Charging from solar' }).click();
    await page.waitForTimeout(400);
    expect(await flow()).toContain('array');
  });

  it('opens the battery management and converter signals side by side', async () => {
    const panels = await page.locator('.dash-panel h4').allInnerTexts();
    expect(panels.join(' | ').toLowerCase()).toContain('battery management system');
    expect(panels.join(' | ').toLowerCase()).toContain('converter');
    // Four charts, each with real geometry — a panel that renders an empty axis is a broken panel.
    const paths = await page.locator('.dash-panel svg polyline').count();
    expect(paths).toBeGreaterThan(6);
  });

  it('reruns the model when the occasion changes rather than redrawing', async () => {
    await page.getByRole('button', { name: 'Evening discharge' }).click();
    await page.waitForTimeout(400);
    const before = await page.locator('.dash-flow b.rate').innerText();
    await page.getByRole('button', { name: 'Charging from the grid' }).click();
    await page.waitForTimeout(400);
    const flow = await page.locator('.dash-flow').innerText();
    // Charging: the cells are now the destination rather than the source.
    expect(flow).toContain('storing it');
    expect(before).toMatch(/kW/);
  });
});
