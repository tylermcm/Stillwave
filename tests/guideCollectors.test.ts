import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTvPassportPage, scheduleWallTime } from '../src/core/tvPassportGuide';
import { parseWatchYourGuide } from '../src/core/providerGuides';
import { compileGuideBundle } from '../src/core/guideBundle';
import { createGuideView } from '../src/core/guides';
import { createGuideMatcher, parseXmltv } from '../src/core/xmltv';
import { serializeGuide } from '../src/core/guideImport';
import { EMPTY_LIBRARY, type Channel, type Guide } from '../src/types';

const channel = (id: string, tvgId = `${id}.us@SD`, url = `https://stream.example.com/${id}/index.m3u8`): Channel => ({ id, tvgId, name: id, url, group: 'General', headers: {}, kind: 'hls' });

test('TV Passport uses its declared zone, duration and published title without executing page content', () => {
  const page = '<select id="timezone_selector"><option value="America/Denver">Mountain</option><option selected value="America/New_York">Eastern</option></select>' +
    '<div data-st="2026-10-27 10:00:00"data-duration="30"data-showName="A &amp; B"data-description="It&#39;s &quot;live&quot;"data-episodeNumber="S2 E3">' +
    '<script>throw Error("not data")</script><div data-st="2026-10-27 10:30:00" data-duration="120" data-showName="Movie" data-episodeTitle="Actual movie">';
  const shows = parseTvPassportPage(page, 'one');
  assert.equal(shows[0]!.start, Date.UTC(2026, 9, 27, 14));
  assert.equal(shows[0]!.stop, Date.UTC(2026, 9, 27, 14, 30));
  assert.equal(shows[0]!.title, 'A & B');
  assert.equal(shows[0]!.description, 'It\'s "live"');
  assert.equal(shows[0]!.episode, 'S2 E3');
  assert.equal(shows[1]!.title, 'Actual movie');
  assert.throws(() => parseTvPassportPage('<div data-st="2026-10-27 10:00:00">', 'one'), /time zone/);
  assert.throws(() => parseTvPassportPage(page.replaceAll('data-st=', 'removed='), 'one'), /no usable/);
});

test('schedule conversion rejects DST gaps, repeated hours, impossible dates and incomplete timestamps', () => {
  assert.equal(scheduleWallTime('2026-03-08 02:30:00', 'America/New_York'), undefined);
  assert.equal(scheduleWallTime('2026-11-01 01:30:00', 'America/New_York'), undefined);
  assert.equal(scheduleWallTime('2026-11-01 00:30:00', 'America/New_York'), Date.UTC(2026, 10, 1, 4, 30));
  assert.equal(scheduleWallTime('2026-11-01 02:30:00', 'America/New_York'), Date.UTC(2026, 10, 1, 7, 30));
  assert.equal(scheduleWallTime('2026-02-30 10:00:00', 'America/New_York'), undefined);
  assert.equal(scheduleWallTime('2026-10-27 10:00', 'America/New_York'), undefined);
});

test('WatchYour matches the actual playout URL, preserves exact seconds and rejects inconsistent timestamps', () => {
  const now = Date.UTC(2026, 9, 27, 22);
  const a = channel('a', 'TVSA.us@SD', 'https://rpn.bozztv.com/gusa/station/index.m3u8?token=old');
  const payload = [{ name: 'Different catalog label', url: 'http://rpn.bozztv.com/gusa/station/index.m3u8?token=new', shows: [
    { name: 'A real show', tms: now / 1000, start_day: '2026-10-27', start: '22:00:00', end_day: '2026-10-27', end: '22:02:37', timezone: '+0000' },
    { name: 'Bad timestamp', tms: now / 1000, start_day: '2026-10-27', start: '23:00:00', end_day: '2026-10-27', end: '23:30:00', timezone: '+0000' },
  ] }];
  const guide = parseWatchYourGuide(payload, [a, channel('unrelated')], now);
  assert.equal(guide.programmes['stillwave:a']?.length, 1);
  assert.equal(guide.programmes['stillwave:a']![0]!.stop, now + 157_000);
  assert.equal(guide.channels['stillwave:unrelated'], undefined);
  assert.deepEqual(Object.keys(parseWatchYourGuide([...payload, ...payload], [a], now).programmes), []);
});

test('combined guide roundtrip keeps alternate streams distinct after playlist IDs are namespaced', async () => {
  const now = Date.now();
  const channels = [channel('a', 'Same.us@HD'), channel('b', 'Same.us@HD'), channel('missing')];
  const raw: Guide = { channels: { 'stillwave:a': ['A'], 'stillwave:b': ['B'] }, programmes: {
    'stillwave:a': [{ channelId: 'stillwave:a', title: 'East program', start: now - 1000, stop: now + 60_000 }],
    'stillwave:b': [{ channelId: 'stillwave:b', title: 'West program', start: now - 1000, stop: now + 60_000 }],
  }, importedAt: now };
  const view = createGuideView({ ...EMPTY_LIBRARY, guide: raw });
  const bundle = compileGuideBundle(channels, view, now);
  assert.equal(bundle.assignments.length, 2);
  assert.equal(bundle.guide.channels['stillwave:missing'], undefined);
  const installed = channels.map(c => ({ ...c, sourceId: c.id, id: `playlist:${c.id}` }));
  const restored = await parseXmltv(serializeGuide(bundle.guide), installed, {}, now);
  const matcher = createGuideMatcher(restored);
  assert.equal(restored.programmes[matcher(installed[0]!)!]![0]!.title, 'East program');
  assert.equal(restored.programmes[matcher(installed[1]!)!]![0]!.title, 'West program');
});

test('provider aliases preserve country variants and plus channel identities', () => {
  const guide: Guide = { channels: { e1df79771ae4850c0e48ecc6284065d0: ['Provider label'], regular: ['News 12 New Jersey'], plus: ['News 12+ New Jersey'] }, programmes: {}, importedAt: 0 };
  const matcher = createGuideMatcher(guide);
  assert.equal(matcher(channel('48', '48Hours.us@US')), 'e1df79771ae4850c0e48ecc6284065d0');
  assert.equal(matcher(channel('48', '48Hours.us@UK')), undefined);
  assert.equal(matcher({ ...channel('n', 'Unknown.us@HD'), name: 'News12+ New Jersey (1080p) [Geo-blocked]' }), 'plus');
  assert.equal(createGuideMatcher({ ...guide, channels: { regular: ['News 12 New Jersey'] } })({ ...channel('n', 'Unknown.us@HD'), name: 'News12+ New Jersey' }), undefined);
});

test('PBS primary station URLs can use bare callsigns while DT2 remains unassigned', () => {
  const guide: Guide = { channels: { KETS: ['KETSDT'], KVIE: ['KVIEDT'] }, programmes: {}, importedAt: 0 };
  const matcher = createGuideMatcher(guide);
  assert.equal(matcher(channel('kets', 'PBS.us@KETS', 'https://ketsdt.lls.pbs.org/out/index.m3u8')), 'KETS');
  assert.equal(matcher(channel('kvie', 'PBS.us@KVIE', 'https://kviedt2.lls.pbs.org/out/index.m3u8')), undefined);
  assert.equal(matcher(channel('wrong', 'PBS.us@KETS', 'https://example.com/ketsdt/index.m3u8')), undefined);
});

test('Plex station identity survives container changes and region quality labels retain East versus West', () => {
  const guide: Guide = { channels: { '6a1610bebdf296985fd95603-62f42e6cad0081c6ef405723': ['Provider label'], 'NationalGeographic.us@East': ['Nat Geo East'] }, programmes: {}, importedAt: 0 };
  const matcher = createGuideMatcher(guide);
  assert.equal(matcher(channel('doc', 'DocumentaryPlus.us@US')), '6a1610bebdf296985fd95603-62f42e6cad0081c6ef405723');
  assert.equal(matcher(channel('nat', 'NationalGeographic.us@HDEast')), 'NationalGeographic.us@East');
  assert.equal(matcher(channel('nat', 'NationalGeographic.us@WestHD')), undefined);
});
