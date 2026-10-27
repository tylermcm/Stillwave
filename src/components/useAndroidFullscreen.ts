import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import * as ScreenOrientation from 'expo-screen-orientation';
import { NavigationBar } from 'expo-navigation-bar';
import { isTv } from '../data/tv';

// Serialize rotation requests so rapid enter/exit taps cannot restore an older
// orientation over a newer request. Keep the same VideoView and native player.
export function useAndroidFullscreen(fullscreen: boolean, onError: () => void) {
  const queue = useRef(Promise.resolve());
  const previous = useRef<ScreenOrientation.OrientationLock | undefined>(undefined);
  const reportError = useRef(onError);
  reportError.current = onError;
  useEffect(() => {
    if (Platform.OS !== 'android' || isTv) return;
    let current = true;
    queue.current = queue.current.catch(() => {}).then(async () => {
      if (fullscreen) {
        previous.current ??= await ScreenOrientation.getOrientationLockAsync();
        await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
        NavigationBar.setHidden(true);
      } else {
        if (previous.current !== undefined) await ScreenOrientation.lockAsync(previous.current);
        previous.current = undefined;
        NavigationBar.setHidden(false);
      }
    }).catch(() => { if (current) reportError.current(); });
    return () => { current = false; };
  }, [fullscreen]);
  useEffect(() => () => {
    if (Platform.OS !== 'android' || isTv) return;
    queue.current = queue.current.catch(() => {}).then(async () => {
      if (previous.current !== undefined) await ScreenOrientation.lockAsync(previous.current);
      NavigationBar.setHidden(false);
    }).catch(() => {});
  }, []);
}
