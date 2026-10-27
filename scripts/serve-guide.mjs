import http from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';

const host = process.argv.includes('--lan') ? '0.0.0.0' : '127.0.0.1';
const port = Number(process.env.STILLWAVE_GUIDE_PORT || 8790);
const files = new Map([
  ['/stillwave-us.xml.gz', ['stillwave-us.xml.gz', 'application/gzip']],
  ['/stillwave-us.xml', ['stillwave-us.xml', 'application/xml; charset=utf-8']],
  ['/manifest.json', ['manifest.json', 'application/json; charset=utf-8']],
]);
const server = http.createServer(async (req, res) => {
  const route = files.get(new URL(req.url, 'http://localhost').pathname);
  if (!route) { res.writeHead(404); res.end('Guide not found.'); return; }
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, { Allow: 'GET, HEAD' }); res.end(); return; }
  const filename = path.resolve('artifacts/epg', route[0]);
  try {
    const info = await stat(filename);
    const etag = `W/"${info.size}-${info.mtimeMs}"`;
    const headers = { 'Content-Type': route[1], 'Content-Length': info.size, 'Cache-Control': 'public, max-age=300', ETag: etag };
    if (req.headers['if-none-match'] === etag) { res.writeHead(304, { ETag: etag }); res.end(); return; }
    res.writeHead(200, headers);
    if (req.method === 'HEAD') res.end();
    else { const stream = createReadStream(filename); stream.on('error', () => res.destroy()); stream.pipe(res); }
  } catch { res.writeHead(503); res.end('Run pnpm guide:build first.'); }
});
server.listen(port, host, () => console.log(`Guide: http://${host === '0.0.0.0' ? '<this-PC-LAN-address>' : host}:${port}/stillwave-us.xml.gz`));
