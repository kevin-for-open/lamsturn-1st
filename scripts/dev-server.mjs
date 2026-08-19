// Local preview server for the site.
//
//   node scripts/dev-server.mjs      then open http://localhost:8123
//
// The point of this over `python -m http.server` is the SPA fallback: index.html is a
// single-page app, and the real routes (/products/lga-j900-t/, /restaurants/, /about/ …)
// only exist as directories after scripts/build-static-pages.mjs runs at release time.
// Locally those paths 404, so you cannot check a detail page at its real URL.
//
// Here, any path that does not name a real file is answered with index.html, and the
// app's own pageFromUrl() reads window.location and renders the right page — the same
// thing that happens in production once the static pages exist. /kitchens/ still lands
// on Restaurants too, through the legacy row kept in pageFromUrl.
//
// Lives in scripts/, which the deploy workflow excludes, so it never ships.

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.argv[2]) || 8123;

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json',
  '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.mp4': 'video/mp4', '.xml': 'application/xml',
  '.txt': 'text/plain; charset=utf-8', '.ico': 'image/x-icon', '.css': 'text/css; charset=utf-8',
  // without this the tech sheet downloads instead of opening in the viewer, which is not how
  // Cloudflare serves it in production
  '.pdf': 'application/pdf'
};

async function fileAt(p) {
  const s = await stat(p).catch(() => null);
  return s && s.isFile() ? p : null;
}

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const rel = decodeURIComponent(url.pathname);
  const target = path.join(ROOT, rel);

  // stay inside the repo
  if (!target.startsWith(ROOT)) { res.writeHead(403); return res.end('forbidden'); }

  let file = await fileAt(target);
  if (!file && !rel.endsWith('/')) file = await fileAt(target + '/index.html');
  if (!file && rel.endsWith('/')) file = await fileAt(path.join(target, 'index.html'));

  // SPA fallback: a route, not a file — hand back index.html and let the app route it
  const looksLikeAsset = /\.[a-z0-9]{2,5}$/i.test(rel);
  if (!file && !looksLikeAsset) file = path.join(ROOT, 'index.html');

  if (!file) { res.writeHead(404, { 'content-type': 'text/plain' }); return res.end('not found: ' + rel); }

  try {
    res.writeHead(200, {
      'content-type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'cache-control': 'no-store'
    });
    res.end(await readFile(file));
  } catch (e) {
    res.writeHead(500, { 'content-type': 'text/plain' });
    res.end(String((e && e.message) || e));
  }
}).listen(PORT, () => {
  console.log('lamsturn dev  ->  http://localhost:' + PORT);
  console.log('real routes work locally, e.g. /products/lga-j900-t/ and /restaurants/');
});
