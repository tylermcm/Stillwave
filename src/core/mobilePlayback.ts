type LiveWindow = { progress: number; delayed: boolean; ended?: boolean };
const fraction = (value: number) => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));

/** Live playback is the right edge of a growing buffer, not a movie playhead. */
export function mobilePlaybackTimeline(dvr: LiveWindow | undefined, paused: boolean, mediaProgress: number) {
  const atLive = !!dvr && !dvr.ended && !paused && !dvr.delayed;
  return {
    atLive,
    progress: atLive ? 1 : fraction(dvr?.progress ?? mediaProgress),
    canForward: !atLive,
  };
}

/** A scrub from LIVE can only move backwards from the actual playback point. */
export function mobileSeekFraction(requested: number, dvr: LiveWindow | undefined, paused: boolean) {
  const chosen = fraction(requested);
  return mobilePlaybackTimeline(dvr, paused, 0).atLive ? Math.min(chosen, fraction(dvr!.progress)) : chosen;
}
