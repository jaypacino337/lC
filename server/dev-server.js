// Local server: serves public/ and routes /api/* to the same handlers Vercel runs.
// Also ticks every TICK_EVERY_MS so builders trade while it runs.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { handle } from '../lib/router.js';
import { tick } from '../lib/app.js';
import { settings, mode } from '../lib/config.js';
import { getStore } from '../lib/store.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const PORT = Number(process.env.PORT || 3000);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.json': 'application/json', '.ico': 'image/x-icon', '.webp': 'image/webp' };

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://local');
  if (url.pathname === '/api' || url.pathname.startsWith('/api/')) return handle(req, res);
  let p = decodeURIComponent(url.pathname);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.join(ROOT, path.normalize(p));
  if (!file.startsWith(ROOT)) { res.statusCode = 403; return res.end('Forbidden'); }
  fs.readFile(file, (err, data) => {
    if (err) { res.statusCode = 404; res.setHeader('content-type', 'text/plain'); return res.end('Not found'); }
    res.setHeader('content-type', TYPES[path.extname(file)] || 'application/octet-stream');
    res.setHeader('cache-control', 'no-cache');
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`[foreman] http://localhost:${PORT}  mode=${mode()}  storage=${getStore().kind}`);
});

if (process.env.NO_TICK !== '1') {
  const run = () => tick().then((r) => { if (!r.skipped) console.log('[tick]', JSON.stringify(r)); }).catch((e) => console.error('[tick] failed:', e.message));
  setTimeout(run, 1500);
  setInterval(run, settings().tickEveryMs);
}
