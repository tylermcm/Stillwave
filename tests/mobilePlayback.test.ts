import test from 'node:test';
import assert from 'node:assert/strict';
import { mobilePlaybackTimeline, mobileSeekFraction } from '../src/core/mobilePlayback';
import { createRequire } from 'node:module';

test('growing live buffers keep the playhead at the right edge and disable forwarding', () => {
  for (const progress of [.1, .8, .995]) {
    assert.deepEqual(mobilePlaybackTimeline({ progress, delayed: false }, false, 0), { atLive: true, progress: 1, canForward: false });
  }
});

test('paused and rewound broadcasts can seek forward, while live scrubs never seek ahead of real playback', () => {
  const live = { progress: .8, delayed: false };
  assert.equal(mobileSeekFraction(1, live, false), .8);
  assert.equal(mobileSeekFraction(.95, live, false), .8);
  assert.equal(mobileSeekFraction(.4, live, false), .4);
  assert.deepEqual(mobilePlaybackTimeline(live, true, 0), { atLive: false, progress: .8, canForward: true });
  assert.equal(mobileSeekFraction(.95, live, true), .95);
  assert.equal(mobileSeekFraction(.95, { ...live, delayed: true }, false), .95);
  assert.deepEqual(mobilePlaybackTimeline({ progress: .4, delayed: true }, false, 0), { atLive: false, progress: .4, canForward: true });
});

test('finite recordings and ended captures retain ordinary playback progress and seeking', () => {
  assert.deepEqual(mobilePlaybackTimeline(undefined, false, .25), { atLive: false, progress: .25, canForward: true });
  assert.deepEqual(mobilePlaybackTimeline({ progress: .6, delayed: false, ended: true }, false, 0), { atLive: false, progress: .6, canForward: true });
  assert.equal(mobileSeekFraction(2, undefined, false), 1);
  assert.equal(mobileSeekFraction(-1, undefined, false), 0);
  assert.equal(mobileSeekFraction(NaN, undefined, false), 0);
});

test('mobile cutout configuration is repeatable and leaves television window policy unchanged', () => {
  const { addMobileCutout } = createRequire(import.meta.url)('../plugins/withMobileCutout.cjs');
  const source = 'class MainActivity : ReactActivity() {\n override fun onCreate(state: Bundle?) {\n super.onCreate(null)\n }\n}';
  const generated: string = addMobileCutout(source);
  assert.equal(addMobileCutout(generated), generated);
  assert.equal((generated.match(/stillwave-mobile-cutout/g) || []).length, 2);
  assert.match(generated, /mode != android\.content\.res\.Configuration\.UI_MODE_TYPE_TELEVISION/);
  assert.match(generated, /LAYOUT_IN_DISPLAY_CUTOUT_MODE_ALWAYS/);
  assert.match(generated, /LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES/);
  assert.match(generated, /window\.attributes = attributes/);
  assert.throws(() => addMobileCutout('class MainActivity {}'), /Could not find/);
});
