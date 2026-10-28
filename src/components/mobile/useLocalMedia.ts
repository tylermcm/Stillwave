import { useCallback, useEffect, useRef, useState } from 'react';
import { markProblem, mergePicked, recordProgress, removeItem, type LocalItem, type LocalProblem } from '../../core/localMedia';
import { loadLocalMedia, pickLocalMedia, saveLocalMedia } from '../../data/localMedia';

/** Owns the list of files the person has chosen, and keeps it saved. */
export function useLocalMedia() {
  const [items, setItems] = useState<LocalItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [notice, setNotice] = useState('');
  const latest = useRef<LocalItem[]>([]);
  const commit = useCallback((next: LocalItem[]) => {
    latest.current = next; setItems(next);
    void saveLocalMedia(next).catch(() => setNotice('Your recent files could not be saved on this device.'));
  }, []);
  useEffect(() => {
    let mounted = true;
    loadLocalMedia().then(saved => { if (mounted) { latest.current = saved; setItems(saved); } }).catch(() => undefined).finally(() => { if (mounted) setLoaded(true); });
    return () => { mounted = false; };
  }, []);
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(''), 3600); return () => clearTimeout(timer); }, [notice]);

  const choose = useCallback(async () => {
    try {
      const picked = await pickLocalMedia();
      if (!picked.length) return;
      const result = mergePicked(latest.current, picked, Date.now());
      commit(result.items);
      setNotice(result.skipped.length ? `${result.skipped.length} ${result.skipped.length === 1 ? 'file was' : 'files were'} skipped because they are not video or audio.`
        : result.added ? `${result.added} ${result.added === 1 ? 'item' : 'items'} added.` : 'Already in your list.');
    } catch { setNotice('The file picker could not open. Try again.'); }
  }, [commit]);
  const progress = useCallback((id: string, positionMs: number, durationMs?: number) => commit(recordProgress(latest.current, id, positionMs, durationMs, Date.now())), [commit]);
  const problem = useCallback((id: string, kind: LocalProblem | undefined) => commit(markProblem(latest.current, id, kind)), [commit]);
  const remove = useCallback((id: string) => commit(removeItem(latest.current, id)), [commit]);
  const clear = useCallback(() => { commit([]); setNotice('Recents cleared. Your files on this phone are untouched.'); }, [commit]);
  return { items, loaded, notice, choose, progress, problem, remove, clear };
}
