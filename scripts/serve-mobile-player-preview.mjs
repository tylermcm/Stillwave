// Isolated UI preview, never imported by the app. Start Expo on port 8082 first:
// node node_modules/expo/bin/cli start --web --port 8082 --localhost
// node scripts/serve-mobile-player-preview.mjs
import http from 'node:http';

const html = '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Stillwave mobile controls preview</title><style>html,body,#root{margin:0;height:100%;overflow:hidden}</style></head><body><div id="root"></div><script src="http://127.0.0.1:8082/tests/mobile-controls-preview.bundle?platform=web&dev=true&hot=false&lazy=false"></script></body></html>';
http.createServer(async (req, res) => {
  try {
    if (req.url.startsWith('/assets/')) {
      const asset = await fetch(`http://127.0.0.1:8082${req.url}`);
      res.writeHead(asset.status, { 'Content-Type': asset.headers.get('content-type') || 'application/octet-stream', 'Access-Control-Allow-Origin': '*' });
      res.end(Buffer.from(await asset.arrayBuffer()));
      return;
    }
    res.setHeader('Content-Type', 'text/html'); res.end(html);
  } catch { res.writeHead(502); res.end('Start the Expo preview on port 8082.'); }
}).listen(8094, '127.0.0.1', () => console.log('Mobile controls preview: http://127.0.0.1:8094/ (add ?fullscreen for landscape layout).'));
