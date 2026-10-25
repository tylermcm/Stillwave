import test from 'node:test';
import assert from 'node:assert/strict';
import { diagnosePlayback, sanitizeDiagnosticText, type PlaybackEvidence } from '../src/core/diagnostics';

const evidence = (overrides: Partial<PlaybackEvidence> = {}): PlaybackEvidence => ({ online: true, state: 'loading', bufferSeconds: 0, stalledMs: 21_000, eventLoopDelayMs: 0, hasProgress: false, ...overrides });

test('observed HTTP access and server failures are distinguished from app health', () => {
  for (const code of [401, 403, 404, 410, 429, 500, 502, 503]) {
    const result = diagnosePlayback(evidence({ error: `HTTP ${code}` }));
    assert.equal(result.area, 'source', String(code));
    assert.equal(result.confidence, 'observed');
    assert.match(result.explanation, new RegExp(String(code)));
  }
});

test('an offline device has a clear actionable explanation', () => {
  const result = diagnosePlayback(evidence({ online: false }));
  assert.equal(result.area, 'connection');
  assert.equal(result.confidence, 'observed');
  assert.match(result.title, /offline/);
});

test('timeouts and empty buffers are explicitly uncertain, not blamed on the provider', () => {
  const result = diagnosePlayback(evidence({ error: 'Network timed out' }));
  assert.equal(result.area, 'unknown');
  assert.equal(result.confidence, 'uncertain');
  assert.match(result.explanation, /player failure/);
});

test('buffered video with a stopped clock identifies a possible player issue', () => {
  const result = diagnosePlayback(evidence({ bufferSeconds: 12 }));
  assert.equal(result.area, 'playback');
  assert.equal(result.confidence, 'likely');
  assert.match(result.title, /player may be stuck/);
});

test('a delayed foreground app timer is surfaced as app responsiveness evidence', () => {
  const result = diagnosePlayback(evidence({ eventLoopDelayMs: 3500 }));
  assert.equal(result.area, 'app');
  assert.equal(result.confidence, 'observed');
  assert.match(result.explanation, /app or phone was busy/);
});

test('decoder failures are not presented as a confirmed bad channel', () => {
  const result = diagnosePlayback(evidence({ error: 'Video decoder crashed' }));
  assert.equal(result.area, 'playback');
  assert.equal(result.confidence, 'likely');
  assert.match(result.explanation, /app\/player issue/);
});

test('a ready state without observed progress is not called healthy', () => {
  const waiting = diagnosePlayback(evidence({ state: 'readyToPlay', stalledMs: 0 }));
  assert.equal(waiting.confidence, 'uncertain');
  const playing = diagnosePlayback(evidence({ state: 'readyToPlay', stalledMs: 500, hasProgress: true }));
  assert.equal(playing.area, 'healthy');
  assert.match(playing.explanation, /does not guarantee/);
});

test('diagnostic details hide source addresses and provider credentials', () => {
  const value = sanitizeDiagnosticText('Source https://user:secret@example.com/live?token=123 failed\npassword=top-secret token=private-key\nAuthorization: Bearer very-secret-value\nCookie: session=secret');
  for (const secret of ['user:secret', 'example.com', '123', 'top-secret', 'private-key', 'very-secret-value', 'session=secret']) assert.ok(!value.includes(secret), secret);
  assert.match(value, /address hidden/);
  const result = diagnosePlayback(evidence({ error: 'HTTP 403 https://example.com/live?token=private' }));
  assert.ok(!JSON.stringify(result).includes('token=private'));
});

test('an opaque native failure is not left in a misleading still-checking state', () => {
  const result = diagnosePlayback(evidence({ error: 'PipelineStatus::DEMUXER_ERROR_COULD_NOT_PARSE', stalledMs: 0 }));
  assert.equal(result.confidence, 'uncertain');
  assert.equal(result.title, 'The channel could not play');
});
