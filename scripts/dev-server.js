/*
  Local dev server: serves the site from disk and forwards /api/* to `vercel dev`.
  Needed because `vercel dev` 404s on image files with '#' in their names (most pieces).
  Run `vercel dev --listen 3000` first, then: node scripts/dev-server.js  → http://localhost:8080
  Listens on 127.0.0.1 only and never serves dotfiles (.env.local holds secrets).
*/
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.PORT) || 8080;
const API_PORT = Number(process.env.API_PORT) || 3000;
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.gif': 'image/gif', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.ico': 'image/x-icon',
};

function proxyToApi(req, res) {
  const upstream = http.request(
    { host: '127.0.0.1', port: API_PORT, path: req.url, method: req.method, headers: req.headers },
    r => { res.writeHead(r.statusCode, r.headers); r.pipe(res); }
  );
  upstream.on('error', () => {
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: `API not running: start vercel dev --listen ${API_PORT}` }));
  });
  req.pipe(upstream);
}

function serveFile(req, res) {
  let rel;
  try { rel = decodeURIComponent(req.url.split('?')[0]); } catch (e) { res.writeHead(400); return res.end(); }
  if (rel.split('/').some(seg => seg.startsWith('.'))) { res.writeHead(404); return res.end('Not found'); }
  let file = path.join(ROOT, rel);
  if (file !== ROOT && !file.startsWith(ROOT + path.sep)) { res.writeHead(403); return res.end(); }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream' });
    res.end(data);
  });
}

http.createServer((req, res) => (req.url.startsWith('/api/') ? proxyToApi(req, res) : serveFile(req, res)))
  .listen(PORT, '127.0.0.1', () => console.log(`Site on http://localhost:${PORT} (API → localhost:${API_PORT})`));
