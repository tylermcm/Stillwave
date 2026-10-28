import assert from 'node:assert/strict';
import test from 'node:test';
import { MAX_RECENTS, classifyMedia, formatDuration, localId, markProblem, mergePicked, parseStored, progressFraction, recordProgress, removeItem, resumePosition, type LocalItem } from '../src/core/localMedia';

const file = (name: string, mimeType?: string, uri = `content://media/${name}`) => ({ uri, name, mimeType, size: 1000 });

test('media is classified by MIME type first, then by extension, and other files are ignored', () => {
  assert.equal(classifyMedia('trip', 'video/mp4'), 'video');
  assert.equal(classifyMedia('memo', 'audio/mp4'), 'audio');
  assert.equal(classifyMedia('Concert.MKV'), 'video');
  assert.equal(classifyMedia('lecture.MP3'), 'audio');
  assert.equal(classifyMedia('notes.pdf'), undefined);
  assert.equal(classifyMedia('no-extension'), undefined);
  // The MIME type wins over a misleading extension.
  assert.equal(classifyMedia('clip.mp3', 'video/mp4'), 'video');
});

test('choosing files adds new ones first, skips non-media, and counts what was added', () => {
  const first = mergePicked([], [file('a.mp4'), file('b.mp3'), file('c.pdf')], 100);
  assert.deepEqual(first.items.map(i => i.name), ['b.mp3', 'a.mp4']);
  assert.equal(first.added, 2);
  assert.deepEqual(first.skipped, ['c.pdf']);
  const second = mergePicked(first.items, [file('d.mp4')], 200);
  assert.deepEqual(second.items.map(i => i.name), ['d.mp4', 'b.mp3', 'a.mp4']);
});

test('re-choosing a known file restores it and keeps its progress without duplicating it', () => {
  let items = mergePicked([], [file('a.mp4')], 100).items;
  const id = items[0]!.id;
  items = markProblem(recordProgress(items, id, 60_000, 120_000, 150), id, 'moved');
  const again = mergePicked(items, [file('a.mp4')], 300);
  assert.equal(again.items.length, 1);
  assert.equal(again.added, 0);
  assert.equal(again.items[0]!.problem, undefined);
  assert.equal(again.items[0]!.positionMs, 60_000);
});

test('recents are capped and the newest stay', () => {
  const picked = Array.from({ length: MAX_RECENTS + 5 }, (_, i) => file(`f${i}.mp4`));
  const { items } = mergePicked([], picked, 1);
  assert.equal(items.length, MAX_RECENTS);
  assert.equal(items[0]!.name, `f${MAX_RECENTS + 4}.mp4`);
});

test('progress is recorded, clears a problem, and ignores bad values', () => {
  let items = mergePicked([], [file('a.mp4')], 1).items;
  const id = items[0]!.id;
  items = markProblem(items, id, 'unsupported');
  items = recordProgress(items, id, 30_000, 90_000, 5);
  assert.equal(items[0]!.problem, undefined);
  assert.equal(items[0]!.positionMs, 30_000);
  assert.equal(items[0]!.durationMs, 90_000);
  assert.equal(recordProgress(items, id, Number.NaN, 90_000, 6)[0]!.positionMs, 30_000);
  assert.equal(recordProgress(items, id, -5, 90_000, 6)[0]!.positionMs, 30_000);
  assert.deepEqual(removeItem(items, id), []);
});

test('resume starts from the top when barely started or almost finished', () => {
  assert.equal(resumePosition({ positionMs: 2_000, durationMs: 100_000 }), 0);
  assert.equal(resumePosition({ positionMs: 50_000, durationMs: 100_000 }), 50_000);
  assert.equal(resumePosition({ positionMs: 97_000, durationMs: 100_000 }), 0);
  assert.equal(resumePosition({ positionMs: 50_000 }), 50_000);
  assert.equal(progressFraction({ positionMs: 25_000, durationMs: 100_000 }), 0.25);
  assert.equal(progressFraction({ positionMs: 98_000, durationMs: 100_000 }), 0);
  assert.equal(progressFraction({ positionMs: 25_000 }), 0);
});

test('durations format as m:ss and h:mm:ss', () => {
  assert.equal(formatDuration(65_000), '1:05');
  assert.equal(formatDuration(3_725_000), '1:02:05');
  assert.equal(formatDuration(undefined), '');
  assert.equal(formatDuration(-1), '');
});

test('stored data survives garbage, duplicates and odd fields', () => {
  assert.deepEqual(parseStored(undefined), []);
  assert.deepEqual(parseStored('not json'), []);
  assert.deepEqual(parseStored('{"a":1}'), []);
  const good: LocalItem = { id: 'x', uri: 'content://a', name: 'a.mp4', kind: 'video', openedAt: 5, positionMs: 100, durationMs: 1000 };
  const parsed = parseStored(JSON.stringify([good, good, { uri: 3 }, null, { ...good, uri: 'content://b', kind: 'document' }, { ...good, uri: 'content://c', positionMs: -4, durationMs: 0, problem: 'weird' }]));
  assert.deepEqual(parsed.map(i => i.uri), ['content://a', 'content://c']);
  assert.equal(parsed[0]!.id, localId('content://a'));
  assert.equal(parsed[1]!.positionMs, 0);
  assert.equal(parsed[1]!.durationMs, undefined);
  assert.equal(parsed[1]!.problem, undefined);
});

test('playback errors separate a missing file from an unsupported format', async () => {
  const { classifyPlaybackError } = await import('../src/core/localMedia');
  assert.equal(classifyPlaybackError('java.io.FileNotFoundException: open failed: ENOENT'), 'moved');
  assert.equal(classifyPlaybackError('SecurityException: Permission Denial'), 'moved');
  assert.equal(classifyPlaybackError('MediaCodecRenderer: Decoder init failed'), 'unsupported');
  assert.equal(classifyPlaybackError(undefined), 'unsupported');
});
