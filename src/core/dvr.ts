export interface DvrSnapshot {
  sessionId: string;
  uri: string;
  ready: boolean;
  supported: boolean;
  ended: boolean;
  error: string;
  recordingId?: string;
  startMs: number;
  endMs: number;
  duration: number;
  bytes: number;
  limitSeconds: number;
  limitBytes: number;
  closed?: boolean;
  cancelled?: boolean;
}

export interface Recording {
  id: string;
  channel: string;
  title: string;
  createdAt: number;
  status: 'recording' | 'completed' | 'interrupted';
  note: string;
  duration: number;
  bytes: number;
  position: number;
  uri?: string;
  channelId?: string;
  stopAt?: number;
  programmeStart?: number;
  jobId?: string;
  description?: string;
  episode?: string;
}

export const clock = (seconds: number): string => {
  const value = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  return value >= 3600 ? `${Math.floor(value / 3600)}:${String(Math.floor(value / 60) % 60).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}` : `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`;
};

/** Seek from a wall-clock anchor: a moving HLS window must not change the chosen scene. */
export function dvrSeekTarget(positionMs: number, startMs: number, duration: number) {
  const maximum = Math.max(0, duration - 0.25);
  return { seconds: Math.max(0, Math.min(maximum, (positionMs - startMs) / 1000)), expired: positionMs < startMs };
}

export function playbackWindow(timestampMs: number | null, currentSeconds: number, fallbackStartMs: number) {
  return timestampMs != null && Number.isFinite(timestampMs) && timestampMs > 0 ? timestampMs - currentSeconds * 1000 : fallbackStartMs;
}

export function bufferWarning(positionMs: number, snapshot: DvrSnapshot): string {
  if (positionMs < snapshot.startMs) return 'Your paused position has left the buffer. Resume starts at the oldest available footage.';
  const nearLimit = snapshot.duration >= snapshot.limitSeconds - 90 || snapshot.bytes >= snapshot.limitBytes * 0.85;
  if (nearLimit && positionMs - snapshot.startMs < 60_000) return 'The buffer is almost full. Your paused position will expire soon.';
  return '';
}
