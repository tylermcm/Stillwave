import test from 'node:test';
import assert from 'node:assert/strict';
import { gzipSync, strToU8 } from 'fflate';
import { decodeFeed } from '../src/core/feedBytes';
import { httpUrl, normalizeFeedUrl, parseM3u } from '../src/core/m3u';
import { createGuideMatcher, nowAndNext, parseXmltv, parseXmltvTime } from '../src/core/xmltv';
import { classifyFailure, MAX_RETRIES, retryDelay } from '../src/core/recovery';
import type { Channel, Guide } from '../src/types';

const channel = (overrides: Partial<Channel> = {}): Channel => ({ id: 'news', name: 'Local News', tvgId: 'News.us', group: 'News', url: 'https://example.com/live.m3u8', headers: {}, kind: 'hls', ...overrides });
const now = Date.UTC(2026, 9, 25, 20);

test('M3U parses BOM, quoted commas, relative URLs, groups and guide metadata', () => {
  const result = parseM3u('\uFEFF#EXTM3U x-tvg-url="../guide.xml,https://example.org/guide.xml.gz"\r\n#EXTINF:-1 tvg-id="News.us" group-title="News, Local" tvg-name="News, channel",Local News\r\n./live.m3u8', 'https://example.com/playlists/list.m3u');
  assert.equal(result.channels[0]!.name, 'Local News');
  assert.equal(result.channels[0]!.group, 'News, Local');
  assert.equal(result.channels[0]!.url, 'https://example.com/playlists/live.m3u8');
  assert.equal(result.channels[0]!.logo, undefined);
  assert.deepEqual(result.guideUrls, ['https://example.com/guide.xml', 'https://example.org/guide.xml.gz']);
});

test('missing guide metadata is not interpreted as the playlist URL', () => {
  const result = parseM3u('#EXTM3U\n#EXTINF:-1,News\nhttps://example.com/live', 'https://example.com/list.m3u');
  assert.deepEqual(result.guideUrls, []);
  assert.equal(httpUrl('', 'https://example.com/list.m3u'), undefined);
});

test('provider headers and manifest hints are scoped to their channel', () => {
  const result = parseM3u('#EXTM3U\n#EXTINF:-1,One\n#EXTVLCOPT:http-user-agent=My Player\n#KODIPROP:inputstream.adaptive.manifest_type=hls\nhttps://example.com/1|Referer=https%3A%2F%2Fexample.org%2F\n#EXTINF:-1,Two\nhttps://example.com/2');
  assert.deepEqual(result.channels[0]!.headers, { 'User-Agent': 'My Player', Referer: 'https://example.org/' });
  assert.equal(result.channels[0]!.kind, 'hls');
  assert.deepEqual(result.channels[1]!.headers, {});
  assert.equal(result.channels[1]!.kind, 'auto');
});

test('M3U deduplicates URLs, skips unsupported protocols, keeps alternative streams', () => {
  const result = parseM3u('#EXTM3U\n#EXTINF:-1 tvg-id="same",News\nhttps://example.com/a.ts\n#EXTINF:-1 tvg-id="same",News\nhttps://example.com/b.ts\nhttps://example.com/a.ts\n#EXTINF:-1,Bad\nfile:///private/key');
  assert.equal(result.channels.length, 2);
  assert.notEqual(result.channels[0]!.id, result.channels[1]!.id);
  assert.equal(result.warnings.length, 1);
});

test('channel IDs survive expiring stream token changes when tvg-id is present', () => {
  const first = parseM3u('#EXTM3U\n#EXTINF:-1 tvg-id="News.us",News\nhttps://example.com/a.m3u8?token=old');
  const second = parseM3u('#EXTM3U\n#EXTINF:-1 tvg-id="News.us",News\nhttps://example.com/a.m3u8?token=new');
  assert.equal(first.channels[0]!.id, second.channels[0]!.id);
});

test('M3U refuses HTML, HLS media manifests, and playlists with no supported streams', () => {
  assert.throws(() => parseM3u('<html>404</html>'), /not an M3U/);
  assert.throws(() => parseM3u('#EXTM3U\n#EXT-X-TARGETDURATION:6\nsegment.ts'), /single HLS/);
  assert.throws(() => parseM3u('#EXTM3U\nftp://example.com/live'), /No supported/);
});

test('GitHub file links normalize to raw content, while invalid URLs fail', () => {
  assert.equal(normalizeFeedUrl('https://github.com/owner/repo/blob/main/guide.xml'), 'https://raw.githubusercontent.com/owner/repo/main/guide.xml');
  assert.throws(() => normalizeFeedUrl('javascript:alert(1)'), /complete/);
  assert.throws(() => normalizeFeedUrl('/guide.xml'), /complete/);
});

test('XMLTV dates honor offsets, UTC default, and daylight-saving boundary offsets', () => {
  assert.equal(parseXmltvTime('20261025140000 -0600'), now);
  assert.equal(parseXmltvTime('20261025220000 +0200'), now);
  assert.equal(parseXmltvTime('20261025200000'), now);
  assert.equal(parseXmltvTime('202610252000 Z'), now);
  assert.equal(parseXmltvTime('20261101013000 -0600'), Date.UTC(2026, 10, 1, 7, 30));
  assert.equal(parseXmltvTime('20261101013000 -0700'), Date.UTC(2026, 10, 1, 8, 30));
});

test('XMLTV rejects impossible dates and offsets', () => {
  for (const value of ['nonsense', '20260230010000 +0000', '20261301010000 +0000', '20261025249900 +0000', '20261025200000 +1261']) assert.equal(parseXmltvTime(value), undefined, value);
});

test('guide imports only relevant programs, decodes XML text, sorts and deduplicates', async () => {
  const guide = await parseXmltv(`<?xml version="1.0"?><tv>
    <channel id="News.us"><display-name>Local News</display-name></channel>
    <channel id="Other.us"><display-name>Other</display-name></channel>
    <programme channel="News.us" start="20261025210000 +0000" stop="20261025220000 +0000"><title>Up next</title></programme>
    <programme channel="News.us" start="20261025190000 +0000" stop="20261025210000 +0000"><title>News &amp; weather</title><desc><![CDATA[At <home>]]></desc></programme>
    <programme channel="News.us" start="20261025190000 +0000" stop="20261025210000 +0000"><title>News &amp; weather</title></programme>
    <programme channel="Other.us" start="20261025190000 +0000" stop="20261025210000 +0000"><title>Unused</title></programme>
    <programme channel="News.us" start="20251025190000 +0000" stop="20251025210000 +0000"><title>Expired</title></programme>
  </tv>`, [channel()], {}, now);
  assert.equal(guide.programmes['News.us']!.length, 2);
  assert.equal(guide.programmes['News.us']![0]!.title, 'News & weather');
  assert.equal(guide.programmes['News.us']![0]!.description, 'At <home>');
  assert.equal(guide.programmes['Other.us'], undefined);
  const schedule = nowAndNext(guide.programmes['News.us'], now);
  assert.equal(schedule.now?.title, 'News & weather');
  assert.equal(schedule.next?.title, 'Up next');
  assert.equal(nowAndNext(guide.programmes['News.us'], now + 3_600_000).now?.title, 'Up next');
  assert.equal(nowAndNext(guide.programmes['News.us'], now + 7_200_000).now, undefined);
});

test('guide matches unique display names and explicit manual overrides', async () => {
  const guide = await parseXmltv('<tv><channel id="different"><display-name>LOCAL NEWS</display-name></channel><programme channel="different" start="20261025190000 +0000" stop="20261025210000 +0000"><title>News</title></programme></tv>', [channel()], {}, now);
  const match = createGuideMatcher(guide);
  assert.equal(match(channel()), 'different');
  assert.equal(guide.programmes.different?.length, 1);
  assert.equal(match(channel({ name: 'Unrelated' }), { news: 'different' }), 'different');
});

test('ambiguous guide names do not silently map to the wrong channel', () => {
  const guide: Guide = { channels: { a: ['News'], b: ['NEWS'] }, programmes: {}, importedAt: now };
  const match = createGuideMatcher(guide);
  assert.equal(match(channel({ name: 'News', tvgId: undefined })), undefined);
  assert.equal(match(channel({ name: 'News', tvgId: 'a' })), 'a');
});

test('XMLTV supports normal DTD declarations, but never custom entities or malformed XML', async () => {
  const normal = await parseXmltv('<!DOCTYPE tv SYSTEM "xmltv.dtd"><tv><channel id="a"><display-name>News</display-name></channel></tv>', [], {}, now);
  assert.deepEqual(normal.channels.a, ['News']);
  await assert.rejects(parseXmltv('<!DOCTYPE tv [<!ENTITY x SYSTEM "file:///private">]><tv/>', [], {}, now), /document type/);
  await assert.rejects(parseXmltv('<tv><channel id="bad"></tv>', [], {}, now), /invalid XML/);
  await assert.rejects(parseXmltv('<channels><channel xmltv_id="a"/></channels>', [], {}, now), /not a program guide/);
});

test('guide IDs cannot mutate object prototypes or match inherited object keys', async () => {
  const guide = await parseXmltv('<tv><channel id="__proto__"><display-name>Safe</display-name></channel><programme channel="__proto__" start="20261025190000 +0000" stop="20261025210000 +0000"><title>Safe</title></programme></tv>', [channel({ tvgId: '__proto__' })], {}, now);
  assert.equal(guide.programmes['__proto__']?.[0]?.title, 'Safe');
  const loaded = JSON.parse(JSON.stringify(guide)) as Guide;
  assert.equal(createGuideMatcher(loaded)(channel({ name: 'Missing', tvgId: 'toString' })), undefined);
});

test('gzip feeds decode and expanded size limits are enforced', () => {
  const xml = '<tv><channel id="news"/></tv>';
  assert.equal(decodeFeed(gzipSync(strToU8(xml))), xml);
  assert.equal(decodeFeed(strToU8(xml)), xml);
  assert.throws(() => decodeFeed(gzipSync(strToU8('x'.repeat(100_000))), 1024), /expanded guide is too large/);
});

test('transient recovery backs off and stops after five attempts', () => {
  assert.deepEqual(Array.from({ length: MAX_RETRIES }, (_, attempt) => retryDelay(attempt, 'network')), [1000, 2000, 4000, 8000, 15000]);
  assert.equal(retryDelay(MAX_RETRIES, 'network'), null);
});

test('fatal provider and codec failures do not enter reconnect loops', () => {
  for (const message of ['HTTP 401', 'HTTP 403 forbidden', 'HTTP 404', 'decoder failed', 'codec not supported']) {
    const kind = classifyFailure(message);
    assert.equal(retryDelay(0, kind), null, message);
  }
  assert.equal(classifyFailure('Network timed out'), 'network');
  assert.equal(retryDelay(0, classifyFailure('Playback stalled')), 1000);
});
