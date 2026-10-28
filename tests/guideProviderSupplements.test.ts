import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCablecastPage, scheduleStreamKey } from '../src/core/cablecastGuide';
import { exactProviderSupplement } from '../src/core/providerSupplement';
import type { Channel, Guide } from '../src/types';

const now = Date.UTC(2026, 9, 28);
const channel = (id: string, url: string, tvgId = `${id}.us@SD`): Channel => ({ id, tvgId, name: id, url, group: 'General', headers: {}, kind: 'hls' });
const item = (overrides = {}) => ({ siteId: 3, title: 'Council meeting', runDateTime: '2026-10-27T20:00:00-04:00', endDateTime: '2026-10-27T21:12:34-04:00', ...overrides });
const page = (items: unknown[], overrides = {}) => `<script>window.__remixContext = ${JSON.stringify({ state: { loaderData: { root: {
  site: { siteId: 3, liveStreamUrl: 'https://reflect-example.cablecast.tv/live-3/live/stream-2/live.m3u8', otherSites: [{ siteId: 1 }, { siteId: 3 }] },
  schedule: { scheduleItems: items }, ...overrides,
} } } })};</script>`;

test('Cablecast reads JSON only, keeps published seconds and filters other sites, deletions and invalid times', () => {
  const schedule = parseCablecastPage(page([
    item(), item(), item({ siteId: 1, title: 'A different station' }), item({ deleted: true }),
    item({ runDateTime: '2026-10-27T20:00:00' }), item({ endDateTime: '2026-10-27T19:00:00-04:00' }),
    item({ runDateTime: '2026-02-30T20:00:00-04:00' }), item({ title: ' ' }),
  ]) + '<script>throw Error("never execute page code")</script>', now);
  assert.deepEqual(schedule.otherSiteIds, [1, 3]);
  assert.equal(schedule.programmes.length, 1);
  assert.equal(schedule.programmes[0]!.start, now);
  assert.equal(schedule.programmes[0]!.stop, now + 4_354_000);
  assert.equal(schedule.programmes[0]!.title, 'Council meeting');
  assert.throws(() => parseCablecastPage('<script>window.__remixContext = runCode();</script>', now), SyntaxError);
  assert.throws(() => parseCablecastPage('<html>There is no schedule here</html>', now), /format/);
  assert.equal(parseCablecastPage(page([item()], { requiresMembership: true }), now).programmes.length, 0);
});

test('Cablecast preserves both explicit offsets across a repeated DST hour', () => {
  const schedule = parseCablecastPage(page([
    item({ title: 'First hour', runDateTime: '2026-11-01T01:00:00-04:00', endDateTime: '2026-11-01T01:30:00-04:00' }),
    item({ title: 'Second hour', runDateTime: '2026-11-01T01:00:00-05:00', endDateTime: '2026-11-01T01:30:00-05:00' }),
  ]), now);
  assert.equal(schedule.programmes.length, 2);
  assert.equal(schedule.programmes[1]!.start - schedule.programmes[0]!.start, 3_600_000);
  assert.equal(scheduleStreamKey('http://REFLECT-example.cablecast.tv/live/stream-2/live.m3u8?token=1'), scheduleStreamKey('https://reflect-example.cablecast.tv/live/stream-2/live.m3u8'));
  assert.notEqual(scheduleStreamKey('https://reflect-example.cablecast.tv/live/live.m3u8'), scheduleStreamKey('https://reflect-example.cablecast.tv/live/stream-2/live.m3u8'));
  assert.notEqual(scheduleStreamKey('https://reflect-example.cablecast.tv/live/stream-1/live.m3u8'), scheduleStreamKey('https://reflect-example.cablecast.tv/live/stream-2/live.m3u8'));
});

test('global Pluto supplement accepts exact playout IDs and refuses a foreign station with the same name', () => {
  const id = '61b793ccf571b80007b7a610';
  const raw: Guide = { channels: { [id]: ['Regional channel'], foreign: ['Unrelated'] }, programmes: {
    [id]: [{ channelId: id, title: 'Spanish movie', start: now, stop: now + 3_600_000 }],
    foreign: [{ channelId: 'foreign', title: 'Wrong regional movie', start: now, stop: now + 3_600_000 }],
  }, importedAt: now };
  const a = { ...channel('regional', `https://jmp2.uk/plu-${id}.m3u8`), sourceId: 'stable-id' };
  const b = { ...channel('unrelated', 'https://example.org/live.m3u8'), name: 'Unrelated' };
  const guide = exactProviderSupplement(raw, [a, b], 'pluto', now);
  assert.deepEqual(Object.keys(guide.programmes), ['stillwave:stable-id']);
  assert.equal(guide.programmes['stillwave:stable-id']![0]!.title, 'Spanish movie');
});

test('global Plex supplement rejects conflicting containers for the same stable station', () => {
  const a = '111111111111111111111111-62f42e6cad0081c6ef405723';
  const b = '222222222222222222222222-62f42e6cad0081c6ef405723';
  const raw: Guide = { channels: { [a]: ['CinePride'], [b]: ['CinePride'] }, programmes: {
    [a]: [{ channelId: a, title: 'A', start: now, stop: now + 3_600_000 }],
    [b]: [{ channelId: b, title: 'B', start: now, stop: now + 3_600_000 }],
  }, importedAt: now };
  const c = channel('cine', 'https://example.org/live.m3u8', 'DocumentaryPlus.us@US');
  assert.equal(Object.keys(exactProviderSupplement(raw, [c], 'plex', now).programmes).length, 0);
  raw.programmes[b]![0]!.title = 'A';
  raw.channels['333333333333333333333333-62f42e6cad0081c6ef405723'] = ['Empty retired container'];
  assert.equal(exactProviderSupplement(raw, [c], 'plex', now).programmes['stillwave:cine']![0]!.title, 'A');
});
