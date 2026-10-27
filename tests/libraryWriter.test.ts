import test from 'node:test';
import assert from 'node:assert/strict';
import { createLibraryWriter, type SnapshotName } from '../src/core/libraryWriter';
import { EMPTY_LIBRARY } from '../src/types';

test('favorites/settings saves do not serialize an unchanged playlist or guide', async () => {
  const names: SnapshotName[] = [];
  const save = createLibraryWriter(async name => { names.push(name); });
  const library = { ...EMPTY_LIBRARY, guide: { channels: {}, programmes: {}, importedAt: 1 } };
  await save(library);
  await save({ ...library, favorites: ['one'] });
  await save({ ...library, profile: 'stable' });
  assert.deepEqual(names, ['channels', 'guide', 'guides', 'library', 'library', 'library']);
});

test('concurrent saves serialize completely and leave the latest metadata last', async () => {
  const events: string[] = [];
  const save = createLibraryWriter(async (name, data) => {
    events.push(`start:${name}`);
    await new Promise(resolve => setTimeout(resolve, 1));
    events.push(`end:${name}:${name === 'library' ? (data as { playlistName: string }).playlistName : ''}`);
  });
  const a = save({ ...EMPTY_LIBRARY, playlistName: 'first' });
  const b = save({ ...EMPTY_LIBRARY, playlistName: 'latest' });
  await Promise.all([a, b]);
  assert.equal(events.at(-1), 'end:library:latest');
  assert.ok(events.indexOf('end:library:first') < events.lastIndexOf('start:library'));
});

test('a failed snapshot is retried on the next save instead of poisoning the queue', async () => {
  let fail = true;
  const names: string[] = [];
  const save = createLibraryWriter(async name => {
    names.push(name);
    if (fail) { fail = false; throw new Error('disk full'); }
  });
  await assert.rejects(save(EMPTY_LIBRARY), /disk full/);
  await save(EMPTY_LIBRARY);
  assert.deepEqual(names, ['channels', 'channels', 'guide', 'guides', 'library']);
});

test('loading existing snapshots avoids rewriting them on the first favorite', async () => {
  const names: SnapshotName[] = [];
  const save = createLibraryWriter(async name => { names.push(name); });
  const library = { ...EMPTY_LIBRARY, guide: { channels: {}, programmes: {}, importedAt: 1 } };
  save.seed(library);
  await save({ ...library, favorites: ['one'] });
  assert.deepEqual(names, ['library']);
});
