import http from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve('dist/web');
const host = process.env.HOST || '0.0.0.0';
const port = Number(process.env.PORT || 8080);
const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.ttf': 'font/ttf', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.map': 'application/json',
};
const server = http.createServer(async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, { Allow: 'GET, HEAD' }); res.end(); return; }
  let filename = path.join(root, decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
  if (!filename.startsWith(root)) { res.writeHead(403); res.end(); return; }
  try {
    let info = await stat(filename).catch(() => null);
    if (info?.isDirectory()) { filename = path.join(filename, 'index.html'); info = await stat(filename).catch(() => null); }
    if (!info) { filename = path.join(root, 'index.html'); info = await stat(filename); } // SPA fallback
    const ext = path.extname(filename);
    const hashed = filename.includes(`${path.sep}_expo${path.sep}`) || /\.[0-9a-f]{32}\./.test(filename);
    res.writeHead(200, {
      'Content-Type': types[ext] || 'application/octet-stream',
      'Content-Length': info.size,
      'Cache-Control': hashed ? 'public, max-age=31536000, immutable' : 'no-cache',
    });
    if (req.method === 'HEAD') res.end();
    else { const s = createReadStream(filename); s.on('error', () => res.destroy()); s.pipe(res); }
  } catch { res.writeHead(503); res.end('Run pnpm web:build first.'); }
});
server.listen(port, host, () => console.log(`StillWave web: http://${host}:${port}`));
