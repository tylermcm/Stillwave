// Local UI smoke-test data only. These channels intentionally do not play video.
import http from 'node:http';

const base = 'http://127.0.0.1:8092';
const stamp = ms => new Date(ms).toISOString().replace(/[-:T]/g, '').slice(0, 14) + ' +0000';
const now = Date.now();
const guide = `<tv>
  <channel id="fixture.news"><display-name>Fixture News</display-name></channel>
  <channel id="fixture.manual"><display-name>Manual Guide Entry</display-name></channel>
  ${['fixture.news', 'fixture.manual'].map(id => `<programme channel="${id}" start="${stamp(now - 1800000)}" stop="${stamp(now + 1800000)}"><title>Current fixture program</title><desc>This is test guide data, not a broadcast.</desc></programme><programme channel="${id}" start="${stamp(now + 1800000)}" stop="${stamp(now + 5400000)}"><title>Next fixture program</title></programme>`).join('')}
</tv>`;
const playlist = `#EXTM3U x-tvg-url="${base}/guide.xml"
#EXTINF:-1 tvg-id="fixture.news" group-title="Test channels",Fixture News
${base}/missing.m3u8
#EXTINF:-1 tvg-id="unmapped.id" group-title="Test channels",Manual Mapping Fixture
${base}/unavailable.m3u8
`;
http.createServer((request, response) => {
  response.setHeader('Access-Control-Allow-Origin', '*');
  if (request.url === '/playlist.m3u') { response.setHeader('Content-Type', 'audio/x-mpegurl'); response.end(playlist); }
  else if (request.url === '/guide.xml') { response.setHeader('Content-Type', 'application/xml'); response.end(guide); }
  else { response.statusCode = request.url === '/unavailable.m3u8' ? 503 : 404; response.end(); }
}).listen(8092, '127.0.0.1', () => process.stdout.write(`UI fixtures: ${base}/playlist.m3u\n`));
