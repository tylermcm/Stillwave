// Start Expo on 8082, then run this fixture-only preview on 8095.
import http from 'node:http';
const bundle = '/tests/mobile-dashboard-preview.bundle?platform=web&dev=true&hot=false&lazy=false';
const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>StillWave dashboard preview</title><style>html,body,#root{margin:0;height:100%;overflow:hidden}</style></head><body><div id="root"></div><script src="http://127.0.0.1:8082${bundle}"></script></body></html>`;
http.createServer(async (req, res) => {
  if (req.url.startsWith('/assets/')) {
    try {
      const asset = await fetch(`http://127.0.0.1:8082${req.url}`);
      res.writeHead(asset.status, { 'Content-Type': asset.headers.get('content-type') || 'application/octet-stream' });
      res.end(Buffer.from(await asset.arrayBuffer()));
    } catch { res.writeHead(502); res.end('Start Expo on port 8082.'); }
    return;
  }
  res.setHeader('Content-Type', 'text/html'); res.end(html);
}).listen(8095, '127.0.0.1', () => console.log('Dashboard preview: http://127.0.0.1:8095/ (add ?remote=1 for TV).'));
