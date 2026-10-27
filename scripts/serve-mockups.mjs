import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
const mockups = path.resolve('mockups');
const artifacts = path.resolve('artifacts');
const server = http.createServer((request, response) => {
  const url = new URL(request.url, 'http://localhost');
  let name;
  try { name = decodeURIComponent(url.pathname === '/' ? '/tv-dvr.html' : url.pathname); } catch { response.writeHead(400).end(); return; }
  const root = name.startsWith('/artifacts/') || name === '/review' ? artifacts : mockups;
  if (name === '/review') name = '/tv-parity-review.html';
  else if (name.startsWith('/artifacts/')) name = name.slice('/artifacts'.length);
  else if (name.startsWith('/mockups/')) name = name.slice('/mockups'.length);
  const file = path.resolve(root, '.' + name);
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { response.writeHead(404).end(); return; }
  response.setHeader('Content-Type', { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.png': 'image/png', '.css': 'text/css', '.json': 'application/json' }[path.extname(file)] || 'application/octet-stream');
  response.setHeader('Cache-Control', 'no-store'); fs.createReadStream(file).pipe(response);
});
server.listen(8098, '127.0.0.1', () => console.log('TV source mockup: http://127.0.0.1:8098/tv-dvr.html'));
