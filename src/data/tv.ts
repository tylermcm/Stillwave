import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';
import type { TvKey } from '../core/tvNavigation';

interface TvModule {
  isTv: boolean;
  setRemoteEnabled(enabled: boolean): void;
  addListener(name: 'remoteKey', handler: (event: { key: TvKey }) => void): { remove(): void };
}
export const tvNative = Platform.OS === 'android' ? requireOptionalNativeModule<TvModule>('StillwaveTv') : null;
// The web preview makes the same TV layout and keyboard paths testable on a PC.
export const isTv = Platform.isTV || !!tvNative?.isTv || (Platform.OS === 'web' && typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('tv') === '1');

export function useTvKeys(handler: (key: TvKey) => void, enabled = true) {
  const latest = useRef(handler); latest.current = handler;
  useEffect(() => {
    if (!isTv || !enabled) return;
    const subscription = tvNative?.addListener('remoteKey', event => latest.current(event.key));
    if (Platform.OS !== 'web') return () => subscription?.remove();
    const keyboard = (event: KeyboardEvent) => {
      const key = ({ ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', Enter: 'select', Escape: 'back', Backspace: 'back', ' ': 'playPause', ContextMenu: 'menu', MediaPlayPause: 'playPause', MediaRewind: 'rewind', MediaFastForward: 'fastForward', r: 'record', s: 'series', x: 'delete', d: 'dvr', g: 'guide', '1': 'record', '2': 'series', '3': 'delete', '4': 'dvr', '5': 'guide' } as Record<string, TvKey>)[event.key] || ({ r: 'record', s: 'series', x: 'delete', d: 'dvr', g: 'guide' } as Record<string, TvKey>)[event.key.toLowerCase()];
      if (!key || (event.repeat && !['up', 'down', 'left', 'right', 'rewind', 'fastForward'].includes(key))) return;
      event.preventDefault(); latest.current(key);
    };
    window.addEventListener('keydown', keyboard);
    return () => { subscription?.remove(); window.removeEventListener('keydown', keyboard); };
  }, [enabled]);
}
