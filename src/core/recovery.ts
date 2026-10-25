export const MAX_RETRIES = 5;
export const RETRY_DELAYS_MS = [1000, 2000, 4000, 8000, 15000] as const;
export const STALL_TIMEOUT_MS = 20_000;
export const HEALTHY_RESET_MS = 30_000;

export type FailureKind = 'network' | 'auth' | 'missing' | 'unsupported' | 'unknown';

export function classifyFailure(message: string): FailureKind {
  if (/\b(401|403)\b|unauthori[sz]ed|forbidden/i.test(message)) return 'auth';
  if (/\b(404|410)\b|not found/i.test(message)) return 'missing';
  if (/decoder|codec|unsupported|not supported|format.*unsupported/i.test(message)) return 'unsupported';
  if (/network|timed? ?out|connection|internet|offline|http|socket|dns/i.test(message)) return 'network';
  return 'unknown';
}

export function retryDelay(attempt: number, kind: FailureKind): number | null {
  if (['auth', 'missing', 'unsupported'].includes(kind)) return null;
  return RETRY_DELAYS_MS[attempt] ?? null;
}

export function failureMessage(kind: FailureKind): string {
  switch (kind) {
    case 'auth': return 'The provider refused access. Check the playlist or your subscription.';
    case 'missing': return 'This channel address is no longer available. Refresh your playlist.';
    case 'unsupported': return 'This stream format or codec is not supported on this phone. Try an HLS version.';
    default: return 'This channel could not reconnect. Try another channel or retry when the connection improves.';
  }
}
