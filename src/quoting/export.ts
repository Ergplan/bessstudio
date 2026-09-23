'use client';
import { offerCss } from '../app/offerStyles';
import { brand } from '../brand/brand';

/**
 * Serialise the rendered offer into a standalone HTML file.
 *
 * Everything the document needs travels with it, so it opens and prints identically on a machine
 * that has never seen the application. That includes the pictures: the markup referred to the
 * customer's own logo and the platform wordmark by path, which resolve against the site and
 * nothing else, so a proposal saved and emailed arrived with two empty boxes where the branding
 * should be. Each image is read and carried inline instead.
 */
export async function inlineImages(node: HTMLElement) {
  const clone = node.cloneNode(true) as HTMLElement;
  await Promise.all([...clone.querySelectorAll('img')].map(async img => {
    const src = img.getAttribute('src') ?? '';
    if (!src || src.startsWith('data:')) return;
    try {
      const blob = await (await fetch(src)).blob();
      img.setAttribute('src', await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
      }));
    } catch {
      // An image that cannot be read is better absent than broken: the alt text still reads.
      img.removeAttribute('src');
    }
  }));
  return clone;
}

/** The weights the offer document actually sets, served from this application's own origin. */
const OFFER_FACES: [weight: number, path: string][] = [
  [400, '/fonts/Inter-Regular.woff2'],
  [600, '/fonts/Inter-SemiBold.woff2'],
  [700, '/fonts/Inter-Bold.woff2'],
];

/**
 * The typefaces, inside the file.
 *
 * An exported offer is a single HTML file that leaves the building: it is emailed, put on a share,
 * opened from a memory stick in a meeting room. It linked its typefaces to fonts.googleapis.com,
 * so the document a customer opens rendered in Helvetica whenever they were offline, behind a
 * corporate proxy, or in a country that blocks the host — and a proposal that looks different to
 * the person who sent it and the person who received it is not a controlled document.
 *
 * Read from this application's own origin, which is where the files are, and embedded as data. If
 * one cannot be read the document simply falls back to its CSS stack: a missing face is a document
 * in the wrong font, and a link to somewhere that may not answer is the same thing with a delay.
 */
async function embeddedFaces(): Promise<string> {
  const faces = await Promise.all(OFFER_FACES.map(async ([weight, path]) => {
    try {
      const blob = await (await fetch(path)).blob();
      const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
      });
      return `@font-face{font-family:'Inter';font-style:normal;font-weight:${weight};font-display:swap;src:url(${data}) format('woff2')}`;
    } catch { return ''; }
  }));
  return faces.filter(Boolean).join('');
}

export async function offerHtml(node: HTMLElement, title: string) {
  const inlined = await inlineImages(node);
  const fonts = `<style>${await embeddedFaces()}</style>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${escapeHtml(title)}</title>
<meta name="generator" content="${escapeHtml(brand.platform)} — ${escapeHtml(brand.creditLong)}"/>
${fonts}
<style>*{box-sizing:border-box}html,body{margin:0;background:#E9EEF1}
@media print{html,body{background:#fff}}
${offerCss}</style></head>
<body>${inlined.outerHTML}</body></html>`;
}

const escapeHtml = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

export function download(content: string, filename: string, type = 'text/html;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
