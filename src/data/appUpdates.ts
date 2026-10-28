import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';
import { fetchAppRelease, installLatestAppRelease } from '../core/appUpdates';
import { version } from '../../package.json';
interface Updates { install(url: string, digest: string): Promise<string> }
const native = Platform.OS === 'android' ? requireOptionalNativeModule<Updates>('StillwaveUpdates') : null;
const tv = Platform.OS === 'android' ? requireOptionalNativeModule<{ isTv: boolean }>('StillwaveTv') : null;
export async function checkAppRelease() {
  return fetchAppRelease(version, Platform.isTV || !!tv?.isTv);
}
export async function installAppRelease() {
  if (!native) throw new Error('App installation is available on Android phones, Android TV and Fire TV.');
  return installLatestAppRelease(checkAppRelease, (url, digest) => native.install(url, digest));
}
