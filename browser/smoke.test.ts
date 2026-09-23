import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { chromium, type Browser, type ConsoleMessage, type Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { serveExport } from './serve';

const ROOT = join(__dirname, '..');
const OUT = join(ROOT, 'out');
const CHROMIUM = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium';

/** Every route the export actually wrote, discovered rather than listed. */
function routes(dir = OUT): string[] {
  const found: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === '_next' || name.startsWith('.')) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) found.push(...routes(path));
    else if (name === 'index.html') {
      const rel = relative(OUT, dir).split(sep).filter(Boolean).join('/');
      found.push(rel ? `/${rel}/` : '/');
    }
  }
  return found.sort();
}

/**
 * Noise a crawl must not fail on.
 *
 * A smoke test that cries wolf gets muted, and a muted test is worse than none. These are the
 * messages a headless browser produces about itself rather than about the site: no WebGL in a
 * container, no service worker on a file origin, and the favicon a host would serve.
 */
const IGNORE = [
  /WebGL|WEBGL|webgl|GPU|SwiftShader|GroupMarkerNotSet|Failed to create WebGL/,
  /ServiceWorker|service worker/i,
  /favicon/i,
  /Download the React DevTools/,
  /was preloaded using link preload but not used/,
];
const noisy = (text: string) => IGNORE.some(r => r.test(text));

describe('the exported site loads', () => {
  let browser: Browser;
  let origin: string;
  let close: () => Promise<void>;
  let misses: string[];

  beforeAll(async () => {
    // A stale or missing export would make this pass against yesterday's bugs, so say so instead.
    expect(existsSync(join(OUT, 'index.html')), 'run `npm run build` before the browser suite').toBe(true);
    const server = await serveExport(OUT);
    ({ origin, close, misses } = server);
    browser = await chromium.launch({
      // The container ships one Chromium at a fixed path; the Playwright package pinned in
      // `package.json` may want a different build number and will otherwise tell a contributor to
      // download one. Use the installed browser when it is there, and fall back to Playwright's own
      // resolution on a machine that has run `playwright install`.
      ...(existsSync(CHROMIUM) ? { executablePath: CHROMIUM } : {}),
    });
  }, 120_000);

  afterAll(async () => {
    await browser?.close();
    await close?.();
  });

  const visit = async (route: string) => {
    const page: Page = await browser.newPage();
    const errors: string[] = [];
    const failed: string[] = [];
    page.on('console', (m: ConsoleMessage) => {
      if (m.type() === 'error' && !noisy(m.text())) errors.push(m.text());
    });
    page.on('pageerror', e => errors.push(String(e)));
    page.on('response', r => {
      if (r.status() >= 400 && !noisy(r.url())) failed.push(`${r.status()} ${r.url()}`);
    });
    const response = await page.goto(origin + route, { waitUntil: 'networkidle', timeout: 45_000 });
    const text = (await page.locator('body').innerText()).trim();
    return { page, errors, failed, status: response?.status() ?? 0, text };
  };

  it('serves every exported route with no console error and no failed request', async () => {
    const found = routes().filter(r => r !== '/404/' && r !== '/_not-found/');
    // The export is the product; if it stops writing pages the crawl must notice.
    expect(found.length).toBeGreaterThanOrEqual(12);
    for (const route of found) {
      const { page, errors, failed, status, text } = await visit(route);
      expect(status, route).toBe(200);
      expect(errors, `${route}: console errors`).toEqual([]);
      expect(failed, `${route}: failed requests`).toEqual([]);
      // A route that renders an empty shell is a broken route that returns 200.
      expect(text.length, `${route}: rendered nothing`).toBeGreaterThan(40);
      await page.close();
    }
    expect(misses, 'requests the export could not satisfy').toEqual([]);
  }, 300_000);

  it('follows every in-page link to something that exists', async () => {
    const { page } = await visit('/');
    const hrefs = await page.$$eval('a[href]', as => as.map(a => a.getAttribute('href') ?? ''));
    await page.close();
    const internal = [...new Set(hrefs.filter(h => h.startsWith('/')))];
    expect(internal.length, 'the landing page has no internal links').toBeGreaterThan(0);
    for (const href of internal) {
      const probe = await fetch(origin + href);
      expect(probe.status, `landing page links to ${href}`).toBe(200);
    }
  }, 120_000);
});
