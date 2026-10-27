import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { moveTvFocus, type TvFocus, type TvNavigation } from '../src/core/tvNavigation';
import { DEFAULT_TV_PLAYLIST, completeTvSetup, installTvDefaults } from '../src/core/tvDefaults';
import { EMPTY_LIBRARY } from '../src/types';
import { parseXmltv, createGuideMatcher } from '../src/core/xmltv';

const nav: TvNavigation = { tab: 0, category: 4, channel: 67, body: 'channels', counts: { tabs: 5, categories: 20, channels: 1000, details: 2, settings: 5, recordings: 4 } };
test('TV remote stays in its column, reaches every channel, and returns to the remembered row', () => {
  let focus: TvFocus = { zone: 'channels', index: 67 };
  for (let i = 0; i < 100; i++) focus = moveTvFocus(focus, 'down', nav);
  assert.deepEqual(focus, { zone: 'channels', index: 167 });
  assert.deepEqual(moveTvFocus(focus, 'left', nav), { zone: 'categories', index: 4 });
  assert.deepEqual(moveTvFocus({ zone: 'categories', index: 4 }, 'right', nav), { zone: 'channels', index: 67 });
  assert.deepEqual(moveTvFocus({ zone: 'channels', index: 67 }, 'right', nav), { zone: 'details', index: 0 });
  assert.deepEqual(moveTvFocus({ zone: 'details', index: 1 }, 'left', nav), { zone: 'channels', index: 67 });
});
test('TV navigation reaches tabs without wrapping to unrelated controls and handles empty lists', () => {
  assert.deepEqual(moveTvFocus({ zone: 'channels', index: 0 }, 'up', nav), { zone: 'tabs', index: 0 });
  assert.deepEqual(moveTvFocus({ zone: 'tabs', index: 4 }, 'right', nav), { zone: 'tabs', index: 4 });
  assert.deepEqual(moveTvFocus({ zone: 'channels', index: 999 }, 'down', nav), { zone: 'channels', index: 999 });
  assert.deepEqual(moveTvFocus({ zone: 'tabs', index: 0 }, 'down', { ...nav, counts: { ...nav.counts, channels: 0 } }), { zone: 'categories', index: 4 });
  assert.deepEqual(moveTvFocus({ zone: 'details', index: 0 }, 'left', { ...nav, body: 'recordings', channel: 3 }), { zone: 'recordings', index: 3 });
});
const m3u = '#EXTM3U\n#EXTINF:-1 tvg-id="one" group-title="News",One\nhttps://example.com/live.m3u8\n';
test('TV default installation and refresh keep other playlists and favorites without duplicates', async () => {
  const existing = { id: 'custom', name: 'Custom', url: 'https://example.com/custom.m3u8', group: 'Custom', kind: 'hls' as const, headers: {}, playlistId: 'custom-source' };
  const base = { ...EMPTY_LIBRARY, channels: [existing], playlists: [{ id: 'custom-source', name: 'Custom' }], favorites: ['custom'] };
  const io = { download: async () => m3u, cache: async () => {} };
  const first = await installTvDefaults(base, io, '');
  const second = await installTvDefaults(first.library, io, '');
  assert.equal(second.library.channels.length, 2);
  assert.deepEqual(second.library.favorites, ['custom']);
  assert.equal(second.library.playlists.filter(p => p.url === DEFAULT_TV_PLAYLIST).length, 1);
  assert.equal(second.library.channels[0]?.id, 'custom');
});
test('TV installs an advertised guide scoped to the playlist; guide failure keeps channels and the old guide', async () => {
  const playlist = m3u.replace('#EXTM3U', '#EXTM3U x-tvg-url="https://example.com/guide.xml"');
  const xml = '<tv><channel id="one"><display-name>One</display-name></channel></tv>';
  let cached = '';
  const first = await installTvDefaults({ ...EMPTY_LIBRARY }, { download: async url => url === DEFAULT_TV_PLAYLIST ? playlist : xml, cache: async (_, id) => { cached = id; } }, '');
  assert.equal(first.library.guideSources[0]?.id, cached);
  assert.deepEqual(first.library.guideSources[0]?.playlistIds, ['playlist-tv-us']);
  const second = await installTvDefaults(first.library, { download: async url => { if (url !== DEFAULT_TV_PLAYLIST) throw Error('offline'); return playlist; }, cache: async () => {} }, '');
  assert.equal(second.library.channels.length, 1);
  assert.equal(second.library.guideSources[0], first.library.guideSources[0]);
  assert.match(second.guideError!, /saved guide is kept/);
});
test('failed TV playlist download leaves the original library untouched', async () => {
  const base = { ...EMPTY_LIBRARY };
  await assert.rejects(installTvDefaults(base, { download: async () => { throw Error('offline'); }, cache: async () => {} }));
  assert.equal(base.channels.length, 0);
  assert.equal(base.playlists.length, 0);
});
test('native TV input plugin is idempotent across Android regeneration', () => {
  const require = createRequire(import.meta.url);
  const { addTvDispatch } = require('../plugins/withTvRemote.cjs');
  const source = 'class MainActivity : ReactActivity() {\n  override fun getMainComponentName(): String = "main"\n}';
  const once = addTvDispatch(source);
  assert.equal(addTvDispatch(once), once);
  assert.match(once, /TvRemote.dispatch\(event\)/);
});
test('public Pluto station links match exact guide IDs and retain real episode metadata', async () => {
  const id = '62ba60f059624e000781c436';
  const channel = { id:'fixture',name:'Different playlist label',tvgId:'00sReplay.us@SD',group:'Movies',url:`https://jmp2.uk/plu-${id}.m3u8`,headers:{},kind:'hls' as const };
  const guide = await parseXmltv(`<tv><channel id="${id}"><display-name>Provider name</display-name></channel><programme channel="${id}" start="20261027200000 +0000" stop="20261027210000 +0000"><title>A show</title><episode-num system="xmltv_ns">3.8.</episode-num></programme></tv>`,[channel],{},Date.UTC(2026,9,27,20,30));
  assert.equal(createGuideMatcher(guide)(channel),id);
  assert.equal(guide.programmes[id]?.[0]?.episode,'S4 E9');
  assert.equal(createGuideMatcher(guide)({...channel,url:`https://unrelated.example/plu-${id}.m3u8`}),undefined);
});
test('automatic TV setup preserves favorites and recents changed while the guide downloads', () => {
  const channel = { id:'one',name:'One',group:'News',headers:{},kind:'hls' as const,url:'https://example.com/live.m3u8' };
  const snapshot = { ...EMPTY_LIBRARY, channels:[channel] };
  const latest = { ...snapshot, favorites:['one'],recents:[{channelId:'one',watchedAt:123}],profile:'stable' as const };
  const result = completeTvSetup(snapshot,latest);
  assert.deepEqual(result.favorites,['one']); assert.equal(result.recents[0]?.watchedAt,123); assert.equal(result.profile,'stable');
});
