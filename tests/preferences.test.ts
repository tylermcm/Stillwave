import test from 'node:test';
import assert from 'node:assert/strict';
import { captureWindow, DEFAULT_PREFERENCES, guideDateTargets, moveChannel, orderedChannels, preferences, sleepDeadline, startupChannel } from '../src/core/preferences';
import { mobileDashboardLayout } from '../src/core/mobileDashboard';
import { addPlaylist, restoreLibrary } from '../src/core/playlists';
import { completeTvSetup } from '../src/core/tvDefaults';
import { channelHiddenKey } from '../src/core/channelBrowsing';
import { dvrItemActions, recordingConflict, seriesEpisodes } from '../src/core/tvDvr';
import { guideWindow } from '../src/core/tvGuide';
import { EMPTY_LIBRARY, type Channel } from '../src/types';
import { adjacentChannel } from '../src/core/history';

const channel = (id: string): Channel => ({ id: `p:${id}`, sourceId: id, playlistId: 'p', tvgId: `${id}.us`, name: id, number: id, url: `https://example.test/${id}`, kind: 'hls', headers: {}, group: '' });
const channels = ['1', '2', '3'].map(channel);
test('saved preferences migrate safely and survive playlist refresh and background setup', () => {
  assert.deepEqual(preferences(), DEFAULT_PREFERENCES);
  assert.deepEqual(preferences({ guideSize: 'invalid', paddingBefore: NaN, paddingAfter: -5, autoDeleteWatchedDays: 1, startup: 'invalid' } as never), DEFAULT_PREFERENCES);
  const prefs = { ...DEFAULT_PREFERENCES, startup: 'favorites' as const, guideSize: 'large' as const, paddingAfter: 15, autoDeleteWatchedDays: 7 as const };
  const library = restoreLibrary({ ...EMPTY_LIBRARY, channels, favorites: ['p:1'], playlists: [{ id: 'p', name: 'Fixture' }], preferences: prefs, channelOrder: [channelHiddenKey(channels[2]!)] });
  const refreshed = addPlaylist(library, { channels: channels.map(c => ({ ...c, id: c.sourceId!, url: c.url + '/new' })), guideUrls: [], warnings: [] }, { id: 'p', name: 'Fixture' });
  assert.deepEqual(refreshed.preferences, prefs);
  assert.equal(orderedChannels(refreshed.channels, refreshed.channelOrder)[0]?.tvgId, '3.us');
  const restored = restoreLibrary(JSON.parse(JSON.stringify(refreshed)));
  assert.deepEqual(restored.preferences, prefs);
  assert.deepEqual(completeTvSetup({ ...restored, preferences: DEFAULT_PREFERENCES, channelOrder: [] }, library).preferences, prefs);
  assert.deepEqual(completeTvSetup(restored, library).channelOrder, library.channelOrder);
});
test('channel ordering moves both directions and keeps newly imported channels', () => {
  const order = moveChannel(channels, [], 'p:3', 0);
  assert.deepEqual(orderedChannels([...channels, channel('4')], order).map(c => c.id), ['p:3', 'p:1', 'p:2', 'p:4']);
  const lowered = moveChannel(channels, order, 'p:3', 2);
  assert.deepEqual(orderedChannels(channels, lowered).map(c => c.id), channels.map(c => c.id));
  assert.deepEqual(moveChannel(channels, lowered, 'missing', 0), lowered);
  const changed = channels.map(c => ({ ...c, id: c.id + '-new', sourceId: c.sourceId + '-new', url: c.url + '/changed' }));
  assert.equal(orderedChannels(changed, order)[0]?.tvgId, '3.us');
  const ordered = orderedChannels(channels, order);
  assert.equal(adjacentChannel(ordered, 'p:3', 1, true)?.id, 'p:1');
  assert.equal(adjacentChannel(ordered, 'p:3', -1, true)?.id, 'p:2');
});
test('startup skips removed and hidden recent channels and falls back to the guide', () => {
  const library = { ...EMPTY_LIBRARY, channels, recents: [{ channelId: 'removed', watchedAt: 3 }, { channelId: 'p:2', watchedAt: 2 }, { channelId: 'p:1', watchedAt: 1 }], hiddenChannels: [channelHiddenKey(channels[1]!)] };
  assert.equal(startupChannel(library)?.id, 'p:1');
  assert.equal(startupChannel({ ...library, channels: [] }), undefined);
});
test('guide sizes fill the same window and keep touch targets usable', () => {
  for (const [width, height] of [[640, 320], [852, 393], [1280, 800]]) {
    const sizes = (['compact', 'comfortable', 'large'] as const).map(size => mobileDashboardLayout(width!, height!, size));
    assert.ok(sizes[0]!.scale < sizes[1]!.scale && sizes[1]!.scale < sizes[2]!.scale);
    for (const layout of sizes) {
      assert.ok(Math.abs(layout.width * layout.scale - width!) < .001);
      assert.ok(Math.abs(layout.height * layout.scale - height!) < .001);
      assert.ok(layout.rowHeight * layout.scale >= 44 - .001);
    }
  }
  const rows = Array.from({ length: 12 }, (_, i) => ({ channel: channel(String(i)), number: String(i), programmes: [] }));
  assert.ok(guideWindow({ channel: 10, programme: 0, rowTop: 0, windowStart: 0 }, rows, 104).rowTop > guideWindow({ channel: 10, programme: 0, rowTop: 0, windowStart: 0 }, rows, 72).rowTop);
});
test('day picker includes midnight-spanning listings, skips empty dates and expired schedules', () => {
  const now = new Date(2026, 9, 28, 10).getTime();
  const programme = { channelId: 'guide', title: 'Late show', start: new Date(2026, 9, 28, 23).getTime(), stop: new Date(2026, 9, 29, 2).getTime() };
  const rows = [{ channel: channels[0]!, number: '1', programmes: [programme, { ...programme, start: now - 7200_000, stop: now - 3600_000 }] }];
  const targets = guideDateTargets(rows, now);
  assert.equal(targets.length, 3);
  assert.equal(targets[0]?.label, 'Today · now');
  assert.equal(targets[1]?.label, 'Tonight');
  assert.equal(new Date(targets[2]!.at).getDate(), 29);
  assert.equal(new Date(targets[2]!.at).getHours(), 0);
  assert.deepEqual(guideDateTargets([], now), []);
});
test('padding preserves programme identity and conflicts use the padded capture window', () => {
  const programme = { channelId: 'guide', title: 'Game', start: 3600_000, stop: 7200_000 };
  const padded = captureWindow(programme, { paddingBefore: 5, paddingAfter: 15 });
  assert.deepEqual(padded, { captureStart: 3300_000, captureStop: 8100_000 });
  assert.equal(programme.start, 3600_000);
  const rule = { id: 'rule', title: 'Game', channelId: channels[0]!.id, channelName: '1', paddingBefore: 5, paddingAfter: 15 };
  assert.equal(seriesEpisodes([rule], [{ channel: channels[0]!, number: '1', programmes: [programme] }], [], 0)[0]?.paddingAfter, 15);
  const record = { id: 'record', channel: '2', title: 'Other', createdAt: 0, status: 'recording' as const, duration: 1, position: 0, bytes: 1, note: '', stopAt: 3400_000 };
  const plan = { ...programme, ...padded, id: 'plan', channelId: channels[0]!.id, channelName: '1', recordingId: '', error: '', status: 'scheduled' as const };
  assert.match(recordingConflict([record], [plan], 0)!, /Only one stream/);
});
test('protected recordings expose unprotect instead of delete and active captures can extend', () => {
  const item = { id: 'record', kind: 'saved' as const, title: 'Show', channel: '1', right: '', meta: '', description: '', protected: true };
  assert.deepEqual(dvrItemActions(item).map(a => a.action), ['play', 'protect']);
  assert.ok(dvrItemActions({ ...item, kind: 'recording' }).some(a => a.action === 'extend'));
});
test('sleep timer stores an absolute deadline and refuses expired show-end choices', () => {
  assert.equal(sleepDeadline(15, 1000), 901000);
  assert.equal(sleepDeadline('programme', 1000, 2000), 2000);
  assert.equal(sleepDeadline('programme', 2000, 1000), undefined);
  assert.equal(sleepDeadline(0, 1000), undefined);
});
