import test from 'node:test';
import assert from 'node:assert/strict';
import { EMPTY_LIBRARY, type Channel, type Guide, type GuideSource } from '../src/types';
import { createGuideView, getGuideSources, guideKey, makeReminder, programIndex, reminderKey, searchPrograms, sourceMappings, splitGuideKey, withGuideSources } from '../src/core/guides';
import { previousChannel, rememberChannel } from '../src/core/history';
import { removePlaylist, restoreLibrary } from '../src/core/playlists';

const channel = (id: string, playlistId: string): Channel => ({ id, playlistId, name: 'Station', tvgId: 'same-id', group: 'Sports', url: 'https://fixture.invalid/live.m3u8', headers: {}, kind: 'hls' });
const a = channel('a:station', 'a'), b = channel('b:station', 'b');
const guide = (title: string): Guide => ({ channels: { 'same-id': ['Station'] }, programmes: { 'same-id': [{ channelId: 'same-id', title, description: 'Team Wolves playoff game', start: 1000, stop: 5000 }, { channelId: 'same-id', title: 'Next match', start: 5000, stop: 9000 }] }, importedAt: 1000 });
const source = (id: string, playlistIds: string[], title: string): GuideSource => ({ id, name: id, playlistIds, guide: guide(title), refreshHours: 12 });

test('provider-scoped guide IDs keep stations with the same XMLTV ID separate', () => {
  const library = { ...EMPTY_LIBRARY, channels: [a, b], guideSources: [source('ga', ['a'], 'Football'), source('gb', ['b'], 'Local news')] };
  const view = createGuideView(library);
  assert.equal(view.guide!.programmes[view.matcher(a)!]![0]!.title, 'Football');
  assert.equal(view.guide!.programmes[view.matcher(b)!]![0]!.title, 'Local news');
  assert.notEqual(view.matcher(a), view.matcher(b));
  assert.deepEqual(view.choices(a).map(c => c.sourceName), ['ga']);
});
test('playlist guide wins over shared guide; explicit applicable mapping can override priority', () => {
  const library = { ...EMPTY_LIBRARY, guideSources: [source('shared', [], 'Shared'), source('specific', ['a'], 'Specific')] };
  const view = createGuideView(library);
  assert.equal(view.matcher(a), guideKey('specific', 'same-id'));
  assert.equal(view.matcher(b), guideKey('shared', 'same-id'));
  assert.equal(view.matcher(a, { [a.id]: guideKey('shared', 'same-id') }), guideKey('shared', 'same-id'));
  assert.equal(view.matcher(b, { [b.id]: guideKey('specific', 'same-id') }), guideKey('shared', 'same-id'));
});
test('legacy guide and manual matches remain readable, then migrate without resurrection on removal', () => {
  const library = restoreLibrary({ ...EMPTY_LIBRARY, guide: guide('Legacy'), guideUrl: 'https://guide.invalid/guide.xml', mappings: { [a.id]: 'same-id' }, channels: [a] });
  const view = createGuideView(library);
  assert.equal(view.matcher(a), guideKey('legacy-guide', 'same-id'));
  const sources = getGuideSources(library);
  assert.equal(sources[0]!.url, library.guideUrl);
  const migrated = withGuideSources(library, sources);
  assert.equal(migrated.guide, undefined);
  assert.equal(createGuideView(migrated).matcher(a), view.matcher(a));
  assert.equal(createGuideView(withGuideSources(migrated, [])).guide, undefined);
});
test('namespaced manual mappings decode arbitrary XMLTV IDs without bleeding into another source', () => {
  const key = guideKey('source-one', 'network::station/one');
  assert.deepEqual(splitGuideKey(key), ['source-one', 'network::station/one']);
  const mappings = { a: key, b: guideKey('other', 'station'), c: 'legacy-id' };
  assert.deepEqual(sourceMappings('source-one', mappings), { a: 'network::station/one', c: 'legacy-id' });
});
test('removing a playlist does not accidentally turn its private guide into a shared guide', () => {
  const library = { ...EMPTY_LIBRARY, channels: [a, b], playlists: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], guideSources: [source('only-a', ['a'], 'A'), source('both', ['a', 'b'], 'Both'), source('all', [], 'All')] };
  const next = removePlaylist(library, 'a');
  assert.deepEqual(next.guideSources.map(s => [s.id, s.playlistIds]), [['both', ['b']], ['all', []]]);
});
test('program search uses titles/descriptions/channels and honest now/soon filters', () => {
  const view = createGuideView({ ...EMPTY_LIBRARY, guideSources: [source('guide', [], 'Championship')] });
  const index = programIndex([a, b], view);
  assert.equal(searchPrograms(index, 'wolves playoff', 'now', 2000, []).length, 2);
  assert.equal(searchPrograms(index, 'Next match', 'now', 2000, []).length, 0);
  assert.equal(searchPrograms(index, 'Next match', 'soon', 2000, []).length, 2);
  assert.equal(searchPrograms(index, '', 'now', 2000, [], new Set([a.id])).length, 1);
  assert.equal(programIndex([{ ...a, tvgId: 'missing', name: 'Unmatched' }], view).length, 0);
});
test('reminders retain channel identity and time, reject started shows, and avoid ID collisions across playlists', () => {
  const programme = guide('Game').programmes['same-id']![1]!;
  const ra = makeReminder(a, programme, true, 2000), rb = makeReminder(b, programme, false, 2000);
  assert.notEqual(ra.id, rb.id); assert.equal(ra.fireAt, 3000); assert.equal(rb.notify, false);
  assert.equal(ra.id, reminderKey(a.id, programme));
  assert.throws(() => makeReminder(a, programme, true, 6000), /already started/);
});
test('recent history is unique, bounded, and supports a previous-channel toggle', () => {
  let library = { ...EMPTY_LIBRARY, channels: [a, b] };
  library = rememberChannel(library, a.id, 1000);
  library = rememberChannel(library, b.id, 2000);
  assert.equal(previousChannel(library, b.id)?.id, a.id);
  library = rememberChannel(library, a.id, 3000);
  assert.equal(previousChannel(library, a.id)?.id, b.id);
  assert.deepEqual(library.recents.map(r => r.channelId), [a.id, b.id]);
  assert.equal(rememberChannel(library, 'unknown'), library);
  const many = { ...EMPTY_LIBRARY, channels: Array.from({ length: 40 }, (_, i) => channel(`c${i}`, 'a')) };
  let bounded = many;
  for (const c of many.channels) bounded = rememberChannel(bounded, c.id);
  assert.equal(bounded.recents.length, 30);
  const removed = removePlaylist({ ...library, playlists: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }] }, 'a');
  assert.deepEqual(removed.recents.map(r => r.channelId), [b.id]);
});
