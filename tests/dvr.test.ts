import test from 'node:test';
import assert from 'node:assert/strict';
import { bufferWarning, clock, dvrSeekTarget, playbackWindow, type DvrSnapshot } from '../src/core/dvr';

test('paused wall-clock position remains the same as the HLS window slides', () => {
  const paused = 1_720_000_120_000;
  assert.deepEqual(dvrSeekTarget(paused, 1_720_000_000_000, 600), { seconds: 120, expired: false });
  assert.deepEqual(dvrSeekTarget(paused, 1_720_000_060_000, 600), { seconds: 60, expired: false });
});
test('expired footage clamps to oldest footage rather than the live edge', () => {
  assert.deepEqual(dvrSeekTarget(100_000, 110_000, 600), { seconds: 0, expired: true });
  assert.deepEqual(dvrSeekTarget(999_000, 110_000, 600), { seconds: 599.75, expired: false });
});
test('seek anchors use the player timeline rather than a newer ingestor snapshot', () => {
  assert.equal(playbackWindow(130_000, 25, 110_000), 105_000);
  assert.equal(playbackWindow(null, 25, 110_000), 110_000);
});
test('resume in a growing live window retains a position beyond its initial loaded duration', () => {
  const start = 1_720_000_000_000;
  const paused = start + 86_000;
  const capturedEnd = start + 154_000;
  // The native wrapper may still report an older 62-second duration. Using
  // the captured window must preserve the scene at 86 seconds.
  assert.equal(dvrSeekTarget(paused, start, (capturedEnd - start) / 1000).seconds, 86);
});
test('buffer expiration warning includes byte pressure before the time limit', () => {
  const snapshot = { startMs: 100_000, duration: 300, bytes: 450, limitBytes: 500, limitSeconds: 1800 } as DvrSnapshot;
  assert.match(bufferWarning(120_000, snapshot), /expire soon/);
  assert.match(bufferWarning(90_000, snapshot), /oldest available/);
  assert.equal(bufferWarning(220_000, snapshot), '');
});
test('DVR labels handle hour-long recordings and unknown durations', () => {
  assert.equal(clock(275), '4:35'); assert.equal(clock(3671), '1:01:11');
  assert.equal(clock(NaN), '0:00'); assert.equal(clock(-5), '0:00');
});
