import test from 'node:test';
import assert from 'node:assert/strict';
import { EMPTY_LIBRARY, type Channel, type Playlist } from '../src/types';
import { addPlaylist, removePlaylist, restoreLibrary } from '../src/core/playlists';

const channel = (id: string): Channel => ({ id, name: id, url: `https://test.invalid/${id}.m3u8`, group: 'News', kind: 'hls', headers: {} });
const parsed = (...ids: string[]): Playlist => ({ channels: ids.map(channel), guideUrls: [], warnings: [] });

test('legacy libraries retain channel IDs, favorites and guide mappings after migration and refresh', () => {
  const legacy = { ...EMPTY_LIBRARY, playlists: undefined, channels: [channel('one')], favorites: ['one'], mappings: { one: 'guide.one' }, playlistName: 'Original', playlistUrl: 'https://test.invalid/list' };
  const migrated = restoreLibrary(legacy);
  assert.equal(migrated.playlists.length, 1);
  assert.equal(migrated.channels[0]?.id, 'one');
  const refreshed = addPlaylist(migrated, parsed('one', 'two'), { ...migrated.playlists[0]!, updatedAt: 123 });
  assert.deepEqual(refreshed.favorites, ['one']);
  assert.equal(refreshed.mappings.one, 'guide.one');
  assert.equal(refreshed.channels[0]?.id, 'one');
  const reloaded = restoreLibrary(JSON.parse(JSON.stringify(refreshed)));
  assert.deepEqual(reloaded.channels, refreshed.channels);
  assert.deepEqual(reloaded.favorites, refreshed.favorites);
  assert.deepEqual(reloaded.mappings, refreshed.mappings);
});

test('multiple playlists coexist even when their provider channel IDs overlap', () => {
  const a = addPlaylist(EMPTY_LIBRARY, parsed('one'), { id: 'a', name: 'A' });
  const b = addPlaylist(a, parsed('one'), { id: 'b', name: 'B' });
  assert.equal(b.playlists.length, 2);
  assert.equal(b.channels.length, 2);
  assert.notEqual(b.channels[0]?.id, b.channels[1]?.id);
});

test('refresh changes only its playlist and prunes only references to removed channels', () => {
  let library = addPlaylist(EMPTY_LIBRARY, parsed('one', 'gone'), { id: 'a', name: 'A', url: 'https://test.invalid/a' });
  library = addPlaylist(library, parsed('one'), { id: 'b', name: 'B' });
  library = { ...library, favorites: ['a:one', 'a:gone', 'b:one'], mappings: { 'a:one': 'g1', 'a:gone': 'g2', 'b:one': 'g3' } };
  const next = addPlaylist(library, parsed('one', 'new'), { id: 'unused-new-id', name: 'A refreshed', url: 'https://test.invalid/a' });
  assert.equal(next.playlists.length, 2);
  assert.deepEqual(next.favorites, ['a:one', 'b:one']);
  assert.deepEqual(next.mappings, { 'a:one': 'g1', 'b:one': 'g3' });
  assert.equal(next.channels.find(c => c.id === 'b:one'), library.channels.find(c => c.id === 'b:one'));
});

test('removing one playlist keeps other channels, favorites, guide and source metadata', () => {
  const a = addPlaylist(EMPTY_LIBRARY, parsed('one'), { id: 'a', name: 'A' });
  const b = addPlaylist({ ...a, favorites: ['a:one'] }, parsed('two'), { id: 'b', name: 'B' });
  const next = removePlaylist({ ...b, favorites: [...b.favorites, 'b:two'] }, 'a');
  assert.deepEqual(next.channels.map(c => c.id), ['b:two']);
  assert.deepEqual(next.favorites, ['b:two']);
  assert.deepEqual(next.playlists.map(p => p.id), ['b']);
});
