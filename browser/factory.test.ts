import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type Browser, type Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { serveExport } from './serve';
import { rounds } from '../src/sim/factory';

const OUT = join(__dirname, '..', 'out');
const CHROMIUM = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium';

/**
 * Set a control by its label, the way a player who knows the number they want does.
 *
 * Each slider carries an editable number beside it, which commits on blur. Typing into that is both
 * more reliable than synthesising a drag and closer to what somebody comparing two sizes actually
 * does with it.
 */
const set = async (page: Page, label: string, to: number) => {
  const input = page.getByLabel(label, { exact: true });
  await input.fill(String(to));
  await input.blur();
  await page.waitForTimeout(120);
};

/**
 * The factory, played in a browser.
 *
 * The model is checked by the unit suite. What this checks is the thing a unit suite cannot: that a
 * player who does what each round asks actually sees the bill move, and that the round which is
 * supposed to be impossible on a small battery says so on the screen rather than quietly showing a
 * saving that spends the same kilowatt-hour twice.
 */
describe('a player working through the factory', () => {
  let browser: Browser;
  let page: Page;
  let origin: string;
  let close: () => Promise<void>;

  beforeAll(async () => {
    expect(existsSync(join(OUT, 'index.html')), 'run `npm run build` first').toBe(true);
    ({ origin, close } = await serveExport(OUT));
    browser = await chromium.launch(existsSync(CHROMIUM) ? { executablePath: CHROMIUM } : {});
    page = await browser.newPage();
    await page.goto(origin + '/app/factory/', { waitUntil: 'networkidle' });
  }, 180_000);

  afterAll(async () => {
    await browser?.close();
    await close?.();
  });

  it('opens on a bill with nothing installed and nothing to install', async () => {
    const body = await page.locator('body').innerText();
    expect(body).toContain('The bill');
    // Every line of the year, before anything.
    for (const line of ['Grid energy', 'Demand charge', 'Diesel', 'Lead-acid replacement', 'Solar export credit']) {
      expect(body, line).toContain(line);
    }
    // The five prices that are the whole reason a battery has anything to do here.
    expect(await page.locator('.price-strip span').count()).toBe(5);
    expect(await page.locator('input[type="range"]').count(), 'round one hands over no controls').toBe(0);
    // The teaching label is never optional.
    expect(body).toContain('teaching value');
  });

  it('carries the outage once a battery is installed in round two', async () => {
    await page.getByRole('button', { name: /2\. The generator/ }).click();
    await set(page, 'Battery power', 600);
    await set(page, 'Battery energy', 700);
    await set(page, 'Held in reserve', 100);
    await page.waitForTimeout(250);
    const body = await page.locator('body').innerText();
    // The round is won, and the diesel line has gone.
    expect(body).toContain('here is what it was about');
    const diesel = await page.locator('table.bill tr', { hasText: 'Diesel' }).first().innerText();
    expect(diesel).toContain('₹0');
    // And it is not free: the recharge turns up on the energy line.
    expect((await page.locator('.bill-foot').innerText()).toLowerCase()).toContain('payback');
  });

  it('refuses to spend the same kilowatt-hour twice when asked for everything', async () => {
    // Keep the small battery and ask it for all four duties at once, which is round six's trap.
    await page.getByRole('button', { name: /6\. All four at once/ }).click();
    await page.getByText('Store the midday surplus').click();
    await set(page, 'Hold the meter at', 1800);
    await page.waitForTimeout(250);
    const body = await page.locator('body').innerText();
    expect(body).toContain('Asked for more than it has');
    const said = await page.locator('ul.shortfalls li').allInnerTexts();
    expect(said.length).toBeGreaterThan(0);
    // Named, in the player's terms, not a silent smaller number.
    expect(said.join(' ')).toMatch(/surplus|meter|reserve/);
    // The round is not won while something is short.
    expect(body).not.toContain('here is what it was about');
  });

  it('is won by a battery large enough, and shows where the energy went', async () => {
    await set(page, 'Battery energy', 3600);
    await set(page, 'Battery power', 900);
    await set(page, 'Held in reserve', 15);
    await page.waitForTimeout(250);
    const body = await page.locator('body').innerText();
    expect(body).not.toContain('Asked for more than it has');
    expect(body).toContain('here is what it was about');
    // The allocation bar is the argument: one pool, three duties, and what is left standing.
    expect(await page.locator('.alloc-bar i').count()).toBe(4);
    const key = await page.locator('ul.alloc-key').innerText();
    for (const duty of ['Outage carried', 'Surplus solar stored', 'Into the evening', 'Left standing']) {
      expect(key, duty).toContain(duty);
    }
  });

  it('offers every round, in order', async () => {
    for (const r of rounds) {
      const found = await page.getByRole('button', { name: new RegExp(`${r.n}\\. ${r.title}`) }).count();
      expect(found, `round ${r.n} (${r.title}) is not offered`).toBe(1);
    }
  });
});
