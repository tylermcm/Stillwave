import test from 'node:test';
import assert from 'node:assert/strict';
import { adjacentChannel } from '../src/core/history';
import type { Channel } from '../src/types';
const channel = (id: string, number: string): Channel => ({ id, number, name: id, url: 'https://example.com/live.m3u8', group: 'Sports', kind: 'hls', headers: {} });
test('player previous/next follows numeric channel order and wraps without reordering the library', () => {
  const channels = [channel('ten','10'),channel('two','2'),channel('one','1')];
  assert.equal(adjacentChannel(channels,'two',1)?.id,'ten');
  assert.equal(adjacentChannel(channels,'two',-1)?.id,'one');
  assert.equal(adjacentChannel(channels,'ten',1)?.id,'one');
  assert.equal(adjacentChannel(channels,'one',-1)?.id,'ten');
  assert.deepEqual(channels.map(c=>c.id),['ten','two','one']);
});
test('player channel stepping does not invent a neighbor for a missing or single channel', () => {
  assert.equal(adjacentChannel([], 'one', 1),undefined);
  assert.equal(adjacentChannel([channel('one','1')], 'one', 1),undefined);
  assert.equal(adjacentChannel([channel('one','1'),channel('two','2')], 'missing', 1),undefined);
});
