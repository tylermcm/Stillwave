import test from 'node:test';
import assert from 'node:assert/strict';
import { browseChannelRows, channelCategory, comparePreferredChannels, prioritizeGuideRows } from '../src/core/channelBrowsing';
import { parseM3u } from '../src/core/m3u';
import type { Channel } from '../src/types';

const channel = (id: string, name: string, group: string, languages?: string[]): Channel => ({ id, name, group, languages, url: `https://example.com/${id}.m3u8`, headers: {}, kind: 'hls' });

test('English priority keeps all entries and ranks sports, animation and movies with requested networks first', () => {
  const channels = [channel('news', 'News', 'News', ['eng']), channel('movie', 'Movies', 'Movies', ['eng']),
    channel('anime', 'Cartoons', 'Animation;Kids', ['eng']), channel('sport', 'Sports', 'Sports', ['eng']),
    { ...channel('espn', 'ESPN HD', 'Sports'), tvgId: 'ESPN.us@HD' },
    { ...channel('crunchy', 'Crunchyroll', 'Animation'), tvgId: 'Crunchyroll.us@SD' },
    channel('spanish', 'ESPN Deportes', 'Sports', ['spa']), channel('unknown', 'Unlabeled', 'Sports')];
  const sorted = [...channels].sort(comparePreferredChannels);
  assert.deepEqual(sorted.map(c => c.id), ['espn', 'sport', 'crunchy', 'anime', 'movie', 'news', 'unknown', 'spanish']);
  assert.equal(new Set(sorted.map(c => c.id)).size, channels.length);
  assert.equal(channels[0]!.id, 'news');
});

test('Fox broadcast and sports get sports priority without promoting Fox news or business', () => {
  assert.equal(channelCategory({ ...channel('fox', 'Fox local', 'General'), tvgId: 'Fox.us@KDFW' }), 'sports');
  assert.equal(channelCategory(channel('fs', 'Fox Sports 2', 'Other')), 'sports');
  assert.equal(channelCategory(channel('news', 'Fox News Channel', 'News')), undefined);
  assert.equal(channelCategory(channel('business', 'Fox Business Network', 'Business')), undefined);
  assert.equal(channelCategory(channel('hidive', 'Anime x HIDIVE', 'Other')), 'animation');
});

test('No guide includes missing and expired schedules, retains playback addresses, and All restores the full lineup', () => {
  const rows = ['missing', 'expired', 'future'].map(id => ({ channel: channel(id, id, 'Sports'), number: id,
    programmes: id === 'missing' ? [] : [{ channelId: id, title: 'Program', start: 0, stop: id === 'expired' ? 50 : 200 }] }));
  const noGuide = browseChannelRows(rows, 'noGuide', [], 100);
  assert.deepEqual(noGuide.map(r => r.channel.id), ['missing', 'expired']);
  assert.ok(noGuide.every(r => r.programmes.length === 0 && r.channel.url));
  assert.equal(rows[1]!.programmes.length, 1);
  assert.equal(browseChannelRows(rows, 'all', [], 100).length, 3);
  assert.deepEqual(browseChannelRows(rows, 'withGuide', [], 100).map(r => r.channel.id), ['future']);
  assert.deepEqual(browseChannelRows(rows, 'favorites', ['future'], 100).map(r => r.channel.id), ['future']);
});

test('Playlist language metadata is retained and takes precedence over bundled language hints', () => {
  const parsed = parseM3u('#EXTM3U\n#EXTINF:-1 tvg-id="ESPN.us@HD" tvg-language="Spanish;French" group-title="Sports",ESPN\nhttps://example.com/one.m3u8');
  assert.deepEqual(parsed.channels[0]!.languages, ['Spanish', 'French']);
  assert.ok(comparePreferredChannels(channel('english', 'Other', 'Sports', ['English']), parsed.channels[0]!) < 0);
});

test('guide listings come first across browsing filters, preserving order, numbers and playback identities in both groups', () => {
  const rows = ['missing', 'current', 'expired', 'future', 'endedNow'].map((id, index) => ({ channel: channel(id, id, 'Sports'), number: String(index + 1),
    programmes: ['missing'].includes(id) ? [] : [{ channelId: id, title: 'Program', start: id === 'future' ? 150 : 0, stop: id === 'expired' ? 50 : id === 'endedNow' ? 100 : 200 }] }));
  const sorted = prioritizeGuideRows(rows, 100);
  const expected = ['current', 'future', 'missing', 'expired', 'endedNow'];
  assert.deepEqual(sorted.map(r => r.channel.id), expected);
  assert.deepEqual(browseChannelRows(sorted, 'all', [], 100).map(r => r.channel.id), expected);
  assert.deepEqual(browseChannelRows(sorted, 'sports', [], 100).map(r => r.channel.id), expected);
  assert.deepEqual(browseChannelRows(sorted, 'favorites', ['expired', 'future', 'missing'], 100).map(r => r.channel.id), ['future', 'missing', 'expired']);
  assert.deepEqual(browseChannelRows(sorted, 'noGuide', [], 100).map(r => r.channel.id), ['missing', 'expired', 'endedNow']);
  assert.ok(sorted.every(r => r === rows.find(original => original.channel.id === r.channel.id)));
  assert.deepEqual(rows.map(r => r.channel.id), ['missing', 'current', 'expired', 'future', 'endedNow']);
  assert.deepEqual(prioritizeGuideRows(rows, 200), rows);
});
