import assert from 'node:assert/strict';
import test from 'node:test';
import type { Channel, Programme } from '../src/types';
import type { TvGuideRow } from '../src/core/tvGuide';
import { discoverModules, greeting, homeModel, meshFor, monogram, timeRange } from '../src/core/mobileHub';

const NOW = Date.UTC(2026, 9, 28, 20, 42);
const channel = (id: string, name = id): Channel => ({ id, name, group: 'News', url: `https://example.test/${id}`, headers: {}, kind: 'auto' });
const programme = (channelId: string, start: number, stop: number, title = 'Show'): Programme => ({ channelId, title, start: NOW + start * 60_000, stop: NOW + stop * 60_000 });
const row = (id: string, programmes: Programme[]): TvGuideRow => ({ channel: channel(id), number: id, programmes });

test('featured item is the last watched channel when it is on now', () => {
  const rows = [row('a', [programme('a', -10, 20)]), row('b', [programme('b', -30, 30)])];
  const model = homeModel(rows, [], [{ channelId: 'b', watchedAt: 1 }], NOW);
  assert.equal(model.featured?.row.channel.id, 'b');
  assert.equal(model.featured?.minutesLeft, 30);
  assert.equal(Math.round(model.featured!.progress * 100), 50);
  assert.deepEqual(model.shelf.map(i => i.row.channel.id), ['a']);
});

test('featured falls back to a live favorite, then to anything live', () => {
  const rows = [row('a', [programme('a', -10, 20)]), row('b', [programme('b', -10, 20)]), row('c', [programme('c', 30, 60)])];
  assert.equal(homeModel(rows, ['b'], [], NOW).featured?.row.channel.id, 'b');
  assert.equal(homeModel(rows, [], [], NOW).featured?.row.channel.id, 'a');
  // A recent channel that is not airing does not displace something that is.
  assert.equal(homeModel(rows, [], [{ channelId: 'c', watchedAt: 1 }], NOW).featured?.row.channel.id, 'a');
});

test('the shelf puts favorites first, excludes the featured item and skips channels with nothing on', () => {
  const rows = [row('a', [programme('a', -5, 5)]), row('b', [programme('b', -5, 5)]), row('c', [programme('c', -5, 5)]), row('d', [programme('d', 10, 20)])];
  const model = homeModel(rows, ['c'], [{ channelId: 'a', watchedAt: 1 }], NOW);
  assert.equal(model.featured?.row.channel.id, 'a');
  assert.deepEqual(model.shelf.map(i => i.row.channel.id), ['c', 'b']);
});

test('without guide data the last watched channel can still be featured', () => {
  const rows = [row('a', []), row('b', [])];
  const model = homeModel(rows, [], [{ channelId: 'b', watchedAt: 1 }], NOW);
  assert.equal(model.hasGuide, false);
  assert.equal(model.featured?.row.channel.id, 'b');
  assert.equal(model.featured?.now, undefined);
  assert.equal(model.hasChannels, true);
});

test('empty libraries and hidden channels produce an honest empty model', () => {
  assert.deepEqual(homeModel([], [], [], NOW), { featured: undefined, shelf: [], hasChannels: false, hasGuide: false });
  const hidden = homeModel([row('a', [programme('a', -5, 5)])], [], [], NOW, ['a']);
  assert.equal(hidden.hasChannels, false);
  assert.equal(hidden.featured, undefined);
});

test('discover offers each device only its own modules and honours hidden sections', () => {
  assert.deepEqual(discoverModules('phone').map(m => m.id), ['sports', 'radio', 'dashboard', 'local']);
  assert.deepEqual(discoverModules('tv').map(m => m.id), ['sports', 'radio', 'dashboard', 'world', 'ambient']);
  assert.deepEqual(discoverModules('phone', ['radio', 'local']).map(m => m.id), ['sports', 'dashboard']);
  assert.ok(!discoverModules('phone').some(m => m.id === 'world' || m.id === 'ambient'));
  assert.ok(!discoverModules('tv').some(m => m.id === 'local'));
  assert.deepEqual(discoverModules('phone').filter(m => m.available).map(m => m.id), ['dashboard', 'local']);
});

test('artwork and monograms are deterministic and safe for odd names', () => {
  assert.equal(meshFor('Harbor News 24'), meshFor('Harbor News 24'));
  assert.equal(monogram('Harbor News 24'), 'HN');
  assert.equal(monogram('ESPN'), 'ESP');
  assert.equal(monogram('  ***  '), '·');
});

test('greeting follows the local hour and ranges are formatted', () => {
  const at = (h: number) => new Date(2026, 9, 28, h, 0).getTime();
  assert.equal(greeting(at(9)), 'Good morning');
  assert.equal(greeting(at(14)), 'Good afternoon');
  assert.equal(greeting(at(21)), 'Good evening');
  assert.match(timeRange({ start: at(19), stop: at(20) }), /7:00 PM – 8:00 PM/);
});
