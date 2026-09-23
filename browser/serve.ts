import { createServer, type Server } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2', '.png': 'image/png', '.jpg': 'image/jpeg', '.txt': 'text/plain; charset=utf-8',
  '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json', '.map': 'application/json',
};

/**
 * The exported site, served the way a static host serves it.
 *
 * `next build` with `output: 'export'` and `trailingSlash: true` writes `foo/index.html`, and the
 * crawl is only worth running if what it loads is what a host would hand a browser: the same file
 * for the same URL, a real 404 for a path that is not there. Serving from the Next dev server
 * instead would test a pipeline nobody deploys.
 */
export async function serveExport(root: string): Promise<{ origin: string; close: () => Promise<void>; misses: string[] }> {
  const misses: string[] = [];
  const server: Server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const rel = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
    const candidates = rel.endsWith('/') ? [join(root, rel, 'index.html')] : [join(root, rel), join(root, rel, 'index.html')];
    for (const file of candidates) {
      try {
        if (!(await stat(file)).isFile()) continue;
        const body = await readFile(file);
        res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
        res.end(body);
        return;
      } catch { /* try the next candidate */ }
    }
    misses.push(url.pathname);
    res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' });
    res.end('<!doctype html><title>404</title>not found');
  });
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done));
  const address = server.address();
  if (typeof address === 'string' || address === null) throw new Error('no port');
  return {
    origin: `http://127.0.0.1:${address.port}`,
    misses,
    close: () => new Promise<void>((done, fail) => server.close(e => e ? fail(e) : done())),
  };
}
