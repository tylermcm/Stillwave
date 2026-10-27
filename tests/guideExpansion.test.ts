import test from 'node:test';
import assert from 'node:assert/strict';
import { gzipSync } from 'fflate';
import type { Channel, Guide, GuideSource } from '../src/types';
import { EMPTY_LIBRARY } from '../src/types';
import { importGuideBytes, serializeGuide } from '../src/core/guideImport';
import { createGuideMatcher, parseXmltv } from '../src/core/xmltv';
import { assertGuideRefresh, createGuideView, guideCoverage, guideKey } from '../src/core/guides';
import { DEFAULT_TV_GUIDES, DEFAULT_TV_PLAYLIST, HOSTED_TV_GUIDE, installTvDefaults, needsTvGuideUpgrade } from '../src/core/tvDefaults';

const now = Date.now();
const station = (tvgId = 'ESPN.us@HD', name = 'ESPN (United States) HD (720p)'): Channel => ({ id: tvgId, tvgId, name, group: 'Sports', url: 'https://example.com/live.m3u8', headers: {}, kind: 'hls', playlistId: 'playlist-tv-us' });
const makeGuide = (channels: Record<string, string[]>, programmes: Guide['programmes'] = {}): Guide => ({ channels, programmes, importedAt: now });
const show = (id: string, start = now - 1000, stop = now + 3600_000) => ({ channelId: id, title: 'Live game', start, stop });
const source = (id: string, guide: Guide): GuideSource => ({ id, name: id, guide, playlistIds: [], refreshHours: 12 });
async function* chunks(bytes: Uint8Array, size = 1) { for (let i = 0; i < bytes.length; i += size) yield bytes.subarray(i, i + size); }

test('resolution IDs connect national feeds and remain case insensitive without changing the channel identity', () => {
  const guide = makeGuide({ 'ESPN.us': ['US - ESPN'] });
  const match = createGuideMatcher(guide);
  assert.equal(match(station()), 'ESPN.us');
  assert.equal(match(station('espn.us@SD')), 'ESPN.us');
  assert.equal(station().tvgId, 'ESPN.us@HD');
});
test('resolution and provider name cleanup rejects ambiguous guides and preserves region/time shifts', () => {
  const match = createGuideMatcher(makeGuide({ east: ['Movie HD'], west: ['Movie SD'], network: ['AMC'] }));
  assert.equal(match(station('Movie.us@HD', 'Movie (720p)')), undefined);
  assert.equal(match(station('AMC.us@West', 'AMC')), undefined);
  assert.equal(match(station('AMC.us@East', 'AMC')), undefined);
  assert.equal(createGuideMatcher(makeGuide({ 'AMC.us@West': ['AMC West'] }))(station('AMC.us@West', 'AMC')), 'AMC.us@West');
});
test('Fox affiliates match their actual station, never another affiliate or a generic West feed', () => {
  const guide = makeGuide({ 'FOXKDFW.us': ['US - FOX KDFW Dallas TX'], 'FOXKMPH.us': ['US - FOX KMPH Fresno CA'], sub: ['KMPH-DT2'] });
  const match = createGuideMatcher(guide);
  assert.equal(match(station('Fox.us@KDFW', 'Fox Dallas')), 'FOXKDFW.us');
  assert.equal(match(station('Fox.us@KMPHTV', 'Fox Fresno')), 'FOXKMPH.us');
  assert.equal(match(station('Fox.us@KMPHDT2', 'Fox Fresno')), 'sub');
  assert.equal(match(station('Fox.us@West', 'Fox')), undefined);
});
test('main digital callsigns and redundant FS1 labels match without absorbing subchannels', () => {
  const guide = makeGuide({ main: ['KABC-DT'], sub: ['KABC-DT2'], sports: ['FS1 Fox Sports 1 HD'] });
  assert.equal(createGuideMatcher(guide)(station('KABC.us@HD', 'ABC Los Angeles')), 'main');
  assert.equal(createGuideMatcher(guide)(station('FoxSports1.us@HD', 'Fox Sports 1 (720p)')), 'sports');
  assert.equal(createGuideMatcher(makeGuide({ sub: ['KABC-DT2'] }))(station('KABC.us@HD', 'ABC Los Angeles')), undefined);
  assert.equal(createGuideMatcher(guide)(station('MeTV.us@KABC', 'MeTV Los Angeles')), undefined);
});

test('regional aliases preserve Pacific times and only infer Eastern from a distinct paired Pacific entry', () => {
  const paired = makeGuide({ east: ['US - AMC HD'], west: ['US - AMC West'] });
  assert.equal(createGuideMatcher(paired)(station('AMC.us@EastHD', 'AMC (United States) (720p)')), 'east');
  assert.equal(createGuideMatcher(paired)(station('AMC.us@West', 'AMC West (720p)')), 'west');
  assert.equal(createGuideMatcher(makeGuide({ only: ['AMC HD'] }))(station('AMC.us@EastHD', 'AMC')), undefined);
  const pacific = makeGuide({ p: ['Cartoon Network HD (Pacific)'] });
  assert.equal(createGuideMatcher(pacific)(station('CartoonNetwork.us@West', 'Cartoon Network (United States)')), 'p');
});

const xml = '<?xml version="1.0"?><tv><channel id="ESPN.us"><display-name>US - ESPN</display-name></channel><channel id="other"><display-name>Other</display-name></channel>' +
  '<programme channel="ESPN.us" start="20261027200000 +0000" stop="20261027210000 +0000"><title>Café &amp; game 🏀</title><desc>A &lt; B</desc><episode-num system="onscreen">S2 E3</episode-num></programme>' +
  '<programme channel="other" start="20261027200000 +0000" stop="20261027210000 +0000"><title>Unrelated</title></programme></tv>';
const fixtureTime = Date.UTC(2026, 9, 27, 20, 30);
test('streaming handles split gzip magic bytes, UTF-8 and plain XML; retains only relevant programmes', async () => {
  const bytes = new TextEncoder().encode(xml);
  const plain = await importGuideBytes(chunks(bytes), [station()], {}, fixtureTime);
  const compressed = await importGuideBytes(chunks(gzipSync(bytes)), [station()], {}, fixtureTime);
  assert.deepEqual(compressed, plain);
  assert.equal(plain.programmes['ESPN.us']?.[0]?.title, 'Café & game 🏀');
  assert.equal(plain.programmes.other, undefined);
  assert.deepEqual(plain.channels.other, ['Other']);
  const restored = await parseXmltv(serializeGuide(plain), [station()], {}, fixtureTime);
  assert.deepEqual(restored, plain);
});
test('streamed feeds enforce compressed/expanded limits and reject truncated XML and internal entities', async () => {
  const bytes = new TextEncoder().encode(xml);
  await assert.rejects(importGuideBytes(chunks(bytes), [station()], {}, fixtureTime, { compressed: 10, expanded: 10000 }), /too large/);
  await assert.rejects(importGuideBytes(chunks(gzipSync(bytes), 32), [station()], {}, fixtureTime, { compressed: 10000, expanded: 10 }), /too large/);
  await assert.rejects(importGuideBytes(chunks(bytes.subarray(0, bytes.length - 10)), [station()], {}, fixtureTime), /invalid XML/);
  const entity = new TextEncoder().encode('<!DOCTYPE tv [<!ENTITY x SYSTEM "file:///private">]><tv/>');
  await assert.rejects(importGuideBytes(chunks(entity), [], {}, fixtureTime), /document type/);
});

test('a stale first source cannot hide a fresh backup; explicit manual assignments remain authoritative', () => {
  const a = source('empty', makeGuide({ 'ESPN.us': ['ESPN'] }));
  const b = source('fresh', makeGuide({ 'ESPN.us': ['ESPN'] }, { 'ESPN.us': [show('ESPN.us')] }));
  const view = createGuideView({ ...EMPTY_LIBRARY, guideSources: [a, b] });
  assert.equal(view.matcher(station()), guideKey('fresh', 'ESPN.us'));
  assert.deepEqual(guideCoverage([station()], view, now), { total: 1, available: 1, live: 1, missing: 0 });
  const manual = { [station().id]: guideKey('empty', 'ESPN.us') };
  assert.equal(view.matcher(station(), manual), guideKey('empty', 'ESPN.us'));
});
test('current listings take priority over a future-only match, then use future listings when no current show exists', () => {
  const future = source('future', makeGuide({ 'ESPN.us': ['ESPN'] }, { 'ESPN.us': [show('ESPN.us', now + 60_000)] }));
  const live = source('live', makeGuide({ 'ESPN.us': ['ESPN'] }, { 'ESPN.us': [show('ESPN.us')] }));
  assert.equal(createGuideView({ ...EMPTY_LIBRARY, guideSources: [future, live] }).matcher(station()), guideKey('live', 'ESPN.us'));
  assert.equal(createGuideView({ ...EMPTY_LIBRARY, guideSources: [future] }).matcher(station()), guideKey('future', 'ESPN.us'));
});

const playlist = '#EXTM3U\n#EXTINF:-1 tvg-id="ESPN.us@HD",ESPN\nhttps://example.com/live.m3u8\n';
test('an unavailable hosted guide falls back to every direct source and keeps a retry entry without duplicates', async () => {
  const base = { ...EMPTY_LIBRARY, channels: [station()], playlists: [{ id: 'playlist-tv-us', name: 'US', url: DEFAULT_TV_PLAYLIST }] };
  assert.equal(needsTvGuideUpgrade(base), true);
  const cached: string[] = [], updates: number[] = [];
  const io = { download: async () => playlist, downloadGuide: async (url: string) => { if (url === HOSTED_TV_GUIDE) throw Error('offline'); return { text: '<tv/>', guide: makeGuide({ 'ESPN.us': ['ESPN'] }, { 'ESPN.us': [show('ESPN.us')] }) }; }, cache: async (_: string, id: string) => { cached.push(id); }, onUpdate: (library: typeof base) => { updates.push(library.channels.length); } };
  const first = await installTvDefaults(base, io);
  assert.equal(first.library.guideSources.length, DEFAULT_TV_GUIDES.length + 1);
  assert.ok(first.library.guideSources.find(s => s.url === HOSTED_TV_GUIDE)?.lastError);
  assert.equal(first.guideError, undefined);
  assert.equal(needsTvGuideUpgrade(first.library), false);
  assert.equal(cached.length, DEFAULT_TV_GUIDES.length);
  assert.equal(updates.length, DEFAULT_TV_GUIDES.length + 1);
  const again = await installTvDefaults(first.library, io);
  assert.equal(again.library.guideSources.length, DEFAULT_TV_GUIDES.length + 1);
});
test('one failed default keeps its cached guide while other feeds succeed and exposes retry state', async () => {
  const cachedGuide = makeGuide({ 'ESPN.us': ['ESPN'] }, { 'ESPN.us': [show('ESPN.us')] });
  const old = { ...source('guide-tv-us', cachedGuide), url: DEFAULT_TV_GUIDES[0].url, playlistIds: ['playlist-tv-us'] };
  const base = { ...EMPTY_LIBRARY, guideSources: [old] };
  const result = await installTvDefaults(base, { download: async () => playlist, downloadGuide: async url => { if (url === old.url || url === HOSTED_TV_GUIDE) throw Error('offline'); return { text: '<tv/>', guide: cachedGuide }; }, cache: async () => {} });
  assert.equal(result.library.guideSources.find(s => s.id === old.id)?.guide, cachedGuide);
  assert.ok(result.library.guideSources.find(s => s.id === old.id)?.lastError);
  assert.equal(result.library.guideSources.find(s => s.id === DEFAULT_TV_GUIDES[1].id)?.lastError, undefined);
  assert.equal(result.library.guideSources.length, DEFAULT_TV_GUIDES.length + 1);
  assert.match(result.guideError!, /saved guide is kept/);
});

test('empty and expired provider responses cannot replace usable schedules or their cache', async () => {
  const saved = makeGuide({ 'ESPN.us': ['ESPN'] }, { 'ESPN.us': [show('ESPN.us')] });
  const expired = makeGuide({ 'ESPN.us': ['ESPN'] }, { 'ESPN.us': [show('ESPN.us', now - 7200_000, now - 3600_000)] });
  assert.throws(() => assertGuideRefresh(saved, expired, now), /saved guide is kept/);
  assert.throws(() => assertGuideRefresh(saved, makeGuide({}), now), /saved guide is kept/);
  assert.doesNotThrow(() => assertGuideRefresh(expired, saved, now));
  assert.doesNotThrow(() => assertGuideRefresh(undefined, expired, now));
  const old = { ...source('guide-tv-us', saved), url: DEFAULT_TV_GUIDES[0].url, playlistIds: ['playlist-tv-us'] };
  const cached: string[] = [];
  const result = await installTvDefaults({ ...EMPTY_LIBRARY, guideSources: [old] }, {
    download: async () => playlist, downloadGuide: async () => ({ text: '<tv/>', guide: expired }),
    cache: async (_text, id) => { cached.push(id); },
  });
  assert.equal(result.library.guideSources.find(s => s.id === old.id)?.guide, saved);
  assert.ok(result.library.guideSources.find(s => s.id === old.id)?.lastError);
  assert.equal(cached.includes(old.id), false);
});

test('hosted setup uses one small guide, upgrades version 3 and keeps manual-source refreshes active', async () => {
  const saved = makeGuide({ 'ESPN.us': ['ESPN'] }, { 'ESPN.us': [show('ESPN.us')] });
  const channelOnly = await installTvDefaults(EMPTY_LIBRARY, { download: async () => playlist, cache: async () => {} }, '');
  const old = DEFAULT_TV_GUIDES.slice(0, 2).map(d => ({ ...d, playlistIds: ['playlist-tv-us'], guide: saved }));
  const base = { ...channelOnly.library, tvGuideDefaultsVersion: 3 as const, guideSources: old,
    mappings: { [channelOnly.library.channels[0]!.id]: guideKey(old[1]!.id, 'ESPN.us') } };
  assert.equal(needsTvGuideUpgrade(base), true);
  const downloads: string[] = [];
  const io = { download: async () => playlist, downloadGuide: async (url: string) => { downloads.push(url); return { text: '<tv/>', guide: saved }; }, cache: async () => {} };
  const first = await installTvDefaults(base, io);
  assert.deepEqual(downloads, [HOSTED_TV_GUIDE]);
  assert.equal(first.library.guideSources[0]?.url, HOSTED_TV_GUIDE);
  assert.equal(first.library.guideSources.find(s => s.id === old[0]!.id)?.refreshHours, 0);
  assert.equal(first.library.guideSources.find(s => s.id === old[1]!.id)?.refreshHours, old[1]!.refreshHours);
  assert.deepEqual(first.library.mappings, base.mappings);
  assert.equal(needsTvGuideUpgrade(first.library), false);
  const again = await installTvDefaults(first.library, io);
  assert.equal(again.library.guideSources.length, first.library.guideSources.length);
});

test('a hosted outage keeps useful cached listings without downloading the country feeds', async () => {
  const saved = makeGuide({ 'ESPN.us': ['ESPN'] }, { 'ESPN.us': [show('ESPN.us')] });
  const hosted = { ...source('guide-tv-hosted', saved), url: HOSTED_TV_GUIDE, playlistIds: ['playlist-tv-us'] };
  const downloads: string[] = [], cached: string[] = [];
  const result = await installTvDefaults({ ...EMPTY_LIBRARY, guideSources: [hosted] }, {
    download: async () => playlist, downloadGuide: async url => { downloads.push(url); throw Error('offline'); }, cache: async (_text, id) => { cached.push(id); },
  });
  assert.deepEqual(downloads, [HOSTED_TV_GUIDE]);
  assert.deepEqual(cached, []);
  assert.equal(result.library.guideSources[0]?.guide, saved);
  assert.match(result.guideError!, /Saved listings are kept/);
});
