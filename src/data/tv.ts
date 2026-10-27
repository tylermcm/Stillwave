import { createContext, useContext, useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';
import type { TvKey } from '../core/tvNavigation';
import { usesRemotePlayer, usesTvLayout } from '../core/tvNavigation';

interface TvModule {
  isTv: boolean;
  setRemoteEnabled(enabled: boolean): void;
  addListener(name: 'remoteKey', handler: (event: { key: TvKey }) => void): { remove(): void };
}
export const tvNative = Platform.OS === 'android' ? requireOptionalNativeModule<TvModule>('StillwaveTv') : null;
// Keep TV browsing on touch devices, with player controls selected separately.
export const usesTvPlayer = usesRemotePlayer(Platform.isTV || !!tvNative?.isTv, Platform.OS === 'web' && typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('remote') === '1');
// The web preview makes the same TV layout and keyboard paths testable on a PC.
export const isTv = usesTvLayout(Platform.OS, Platform.isTV || !!tvNative?.isTv, Platform.OS === 'web' && typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('tv') === '1');
export const TvKeysSuspended = createContext(false);

export function useTvKeys(handler: (key: TvKey) => void, enabled = true) {
  const suspended = useContext(TvKeysSuspended);
  const active = enabled && !suspended;
  const latest = useRef(handler); latest.current = handler;
  useEffect(() => {
    if (!isTv || !active) return;
    const subscription = tvNative?.addListener('remoteKey', event => latest.current(event.key));
    if (Platform.OS !== 'web') return () => subscription?.remove();
    const keyboard = (event: KeyboardEvent) => {
      const key = (/^\d$/.test(event.key) ? `digit${event.key}` as TvKey : undefined) || ({ ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', Enter: 'select', Escape: 'back', Backspace: 'back', ' ': 'playPause', ContextMenu: 'menu', MediaPlayPause: 'playPause', MediaRewind: 'rewind', MediaFastForward: 'fastForward', r: 'record', s: 'series', x: 'delete', d: 'dvr', g: 'guide' } as Record<string, TvKey>)[event.key] || ({ r: 'record', s: 'series', x: 'delete', d: 'dvr', g: 'guide' } as Record<string, TvKey>)[event.key.toLowerCase()];
      if (!key || (event.repeat && !['up', 'down', 'left', 'right', 'rewind', 'fastForward'].includes(key))) return;
      event.preventDefault(); latest.current(key);
    };
    window.addEventListener('keydown', keyboard);
    return () => { subscription?.remove(); window.removeEventListener('keydown', keyboard); };
  }, [active]);
}
