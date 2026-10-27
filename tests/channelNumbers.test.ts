import test from 'node:test';
import assert from 'node:assert/strict';
import { addPlaylist, removePlaylist, restoreLibrary } from '../src/core/playlists';
import { enterChannelDigit, findNumberedChannel } from '../src/core/channelNumbers';
import { EMPTY_LIBRARY, type Channel } from '../src/types';

const channel = (id: string, tvgId = id): Channel => ({ id, tvgId, name: id, group: 'Sports', url: `https://example.com/${id}.m3u8`, headers: {}, kind: 'hls' });
const us = { id: 'us', name: 'US channels', url: 'https://iptv-org.github.io/iptv/countries/us.m3u' };
const playlist = (...channels: Channel[]) => ({ channels, guideUrls: [], warnings: [] });

test('numbers are assigned automatically in priority order rather than using the illustrative numbers', () => {
  const library = addPlaylist(EMPTY_LIBRARY, playlist(channel('crunchy', 'Crunchyroll.us@SD'), channel('espn', 'ESPN.us@HD')), us);
  assert.equal(findNumberedChannel(library.channels, '1')?.name, 'espn');
  assert.equal(findNumberedChannel(library.channels, '002')?.name, 'crunchy');
  const reversed = addPlaylist(EMPTY_LIBRARY, playlist(channel('espn', 'ESPN.us@HD'), channel('crunchy', 'Crunchyroll.us@SD')), us);
  assert.deepEqual(reversed.channelNumbers, library.channelNumbers);
  assert.equal(new Set(library.channels.map(c => c.number)).size, 2);
});

test('refresh preserves assigned numbers across title and stream changes; removed numbers are not recycled', () => {
  const original = addPlaylist(EMPTY_LIBRARY, playlist(channel('a'), channel('b')), us);
  const a = original.channels.find(c => c.name === 'a')!;
  const refreshed = addPlaylist(original, playlist({ ...channel('a-new', 'a'), name: 'Renamed', url: 'https://example.com/new.m3u8' }, channel('c')), us);
  assert.equal(refreshed.channels.find(c => c.name === 'Renamed')?.number, a.number);
  assert.ok(!original.channels.some(c => c.number === refreshed.channels.find(c => c.name === 'c')?.number));
  const restored = restoreLibrary(JSON.parse(JSON.stringify(refreshed)));
  assert.deepEqual(restored.channelNumbers, refreshed.channelNumbers);
  assert.deepEqual(restored.channels, refreshed.channels);
});

test('playlists share automatic numbering without collisions and retain numbers after removal and reimport', () => {
  const source = { id: 'other', name: 'Other', url: 'https://example.com/list.m3u' };
  const first = addPlaylist(EMPTY_LIBRARY, playlist({ ...channel('custom'), number: '4' }), source);
  assert.equal(first.channels[0]!.number, '1');
  const withUs = addPlaylist(first, playlist(channel('espn', 'ESPN.us@HD')), us);
  assert.equal(findNumberedChannel(withUs.channels, '2')?.name, 'espn');
  const reimported = addPlaylist(removePlaylist(withUs, 'other'), playlist(channel('custom')), source);
  assert.equal(reimported.channels.find(c => c.name === 'custom')!.number, first.channels[0]!.number);
});

test('the unshipped example-based map is replaced once and subsequent reloads keep automatic assignments', () => {
  const old = { ...EMPTY_LIBRARY, playlists: [us], channels: [{ ...channel('espn', 'ESPN.us@HD'), playlistId: 'us', number: '4' },
    { ...channel('crunchy', 'Crunchyroll.us@SD'), playlistId: 'us', number: '136' }],
    channelNumbers: { '["https://iptv-org.github.io/iptv/countries/us.m3u","ESPN.us@HD"]': '4' } };
  const migrated = restoreLibrary(old);
  assert.deepEqual(migrated.channels.map(c => c.number), ['1', '2']);
  assert.deepEqual(restoreLibrary(JSON.parse(JSON.stringify(migrated))).channelNumbers, migrated.channelNumbers);
});

test('legacy migration assigns numbers without losing channel IDs, favorites or guide mappings', () => {
  const library = restoreLibrary({ ...EMPTY_LIBRARY, channels: [channel('legacy')], favorites: ['legacy'], mappings: { legacy: 'guide-id' }, playlists: undefined });
  assert.ok(library.channels[0]!.number);
  assert.equal(library.channels[0]!.id, 'legacy');
  assert.deepEqual(library.favorites, ['legacy']);
  assert.deepEqual(library.mappings, { legacy: 'guide-id' });
});

test('number entry supports zero digits, bounds long input and never guesses a missing channel', () => {
  assert.equal(enterChannelDigit('13', '6'), '136');
  assert.equal(enterChannelDigit('1', '0'), '10');
  assert.equal(enterChannelDigit('12345', '6'), '6');
  assert.equal(enterChannelDigit('13', 'x'), '13');
  assert.equal(findNumberedChannel([{ ...channel('one'), number: '4' }], '40'), undefined);
  assert.equal(findNumberedChannel([{ ...channel('one'), number: '4' }], ''), undefined);
});
