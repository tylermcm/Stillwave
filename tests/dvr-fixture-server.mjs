// Feed complete HLS segments at broadcast speed. Never contacts a real provider.
// Generate .build-tmp/dvr-fixture.m3u8 and dvr-segment-*.ts with ffmpeg first.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const directory = path.resolve('.build-tmp');
const files = fs.readdirSync(directory).filter(name => /^dvr-segment-\d+\.ts$/.test(name)).sort();
if (!files.length) throw new Error('Generate the DVR fixture video first.');
const started = Date.now();
const requests = new Map();
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1:8096');
  res.setHeader('Cache-Control', 'no-store');
  if (url.pathname === '/channels.m3u') {
    res.setHeader('Content-Type', 'audio/x-mpegurl');
    res.end('#EXTM3U\n#EXTINF:-1 group-title="DVR test",DVR Fixture\nhttp://127.0.0.1:8096/live.m3u8\n');
  } else if (url.pathname === '/live.m3u8') {
    const newest = Math.floor((Date.now() - started) / 2000) + 3;
    const first = Math.max(0, newest - 5);
    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
    res.end(`#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:2\n#EXT-X-MEDIA-SEQUENCE:${first}\n` + Array.from({ length: newest - first + 1 }, (_, i) => {
      const sequence = first + i;
      return `${sequence > 0 && sequence % files.length === 0 ? '#EXT-X-DISCONTINUITY\n' : ''}#EXTINF:2,\n/segment/${sequence}.ts\n`;
    }).join(''));
  } else if (/^\/segment\/\d+\.ts$/.test(url.pathname)) {
    const sequence = Number(url.pathname.match(/\d+/)[0]);
    requests.set(sequence, (requests.get(sequence) || 0) + 1);
    res.setHeader('Content-Type', 'video/mp2t');
    fs.createReadStream(path.join(directory, files[sequence % files.length])).pipe(res);
  } else if (url.pathname === '/stats') {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ requests: Object.fromEntries(requests), elapsed: (Date.now() - started) / 1000 }));
  } else { res.writeHead(404); res.end(); }
});
server.listen(8096, '127.0.0.1', () => console.log('DVR fixture on 127.0.0.1:8096; use adb reverse tcp:8096 tcp:8096.'));
