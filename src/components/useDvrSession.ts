import { useEffect, useState } from 'react';
import type { Channel } from '../types';
import type { DvrSnapshot } from '../core/dvr';
import { dvr, dvrUnavailableReason } from '../data/dvr';

export function useDvrSession(channel: Channel) {
  const [snapshot, setSnapshot] = useState<DvrSnapshot>();
  const [error, setError] = useState('');
  const [generation, setGeneration] = useState(0);
  const [fallback, setFallback] = useState(dvr ? '' : dvrUnavailableReason);
  useEffect(() => {
    if (!dvr) return;
    const client = dvr;
    let mounted = true;
    let polling = false;
    let sessionId = '';
    const owner = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setSnapshot(undefined); setError(''); setFallback('');
    const accept = (next: DvrSnapshot) => {
      if (!mounted || next.cancelled) return;
      if (next.closed) { setError('The DVR session closed. Reopen the channel to start a new buffer.'); return; }
      if (!next.supported) { sessionId = ''; setFallback(next.error || 'DVR is unavailable for this channel.'); client.release(owner); return; }
      setSnapshot(next);
      if (!next.ready && next.ended) setError(next.error || 'The DVR buffer could not start.');
    };
    void client.open(owner, channel.id, channel.name, channel.url, channel.headers).then(next => {
      if (!mounted) { client.release(owner); return; }
      sessionId = next.sessionId; accept(next);
    }).catch(e => { if (mounted) setError(e instanceof Error ? e.message : 'DVR could not start.'); });
    const timer = setInterval(() => {
      if (!sessionId || polling || !mounted) return;
      polling = true;
      void client.snapshot(sessionId).then(accept).catch(() => { if (mounted) setError('Could not read the DVR buffer. Reopen the channel to retry.'); }).finally(() => { polling = false; });
    }, 1000);
    return () => { mounted = false; clearInterval(timer); client.release(owner); };
  }, [channel, generation]);
  return { snapshot, error, fallback, pending: !!dvr && !fallback && !error && !snapshot?.ready, retry: () => setGeneration(g => g + 1) };
}
