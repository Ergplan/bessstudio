'use client';
import { offerCss } from '../app/offerStyles';
import { brand } from '../brand/brand';

/**
 * Serialise the rendered offer into a standalone HTML file. Everything the document needs is
 * inlined, so the file opens and prints identically on a machine that has never seen the app.
 */
export function offerHtml(node: HTMLElement, title: string) {
  const fonts = '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'
    + '<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet">';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${escapeHtml(title)}</title>
<meta name="generator" content="${escapeHtml(brand.platform)} — ${escapeHtml(brand.creditLong)}"/>
${fonts}
<style>*{box-sizing:border-box}html,body{margin:0;background:#E9EEF1}
@media print{html,body{background:#fff}}
${offerCss}</style></head>
<body>${node.outerHTML}</body></html>`;
}

const escapeHtml = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

export function download(content: string, filename: string, type = 'text/html;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
