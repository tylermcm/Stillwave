import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';
import { githubAppRelease, RELEASE_API } from '../core/appUpdates';
import { version } from '../../package.json';
interface Updates { install(url: string, digest: string): Promise<string> }
const native = Platform.OS === 'android' ? requireOptionalNativeModule<Updates>('StillwaveUpdates') : null;
const tv = Platform.OS === 'android' ? requireOptionalNativeModule<{ isTv: boolean }>('StillwaveTv') : null;
export async function checkAppRelease() {
  const response = await fetch(RELEASE_API, { headers: { Accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(20_000) });
  if (response.status === 404) return { release: undefined, message: 'No published GitHub release yet.' };
  if (!response.ok) throw new Error(`Update check failed (${response.status}). Try again later.`);
  const data = await response.json();
  const release = githubAppRelease(data, version, Platform.isTV || !!tv?.isTv);
  return { release, message: release ? `StillWave ${release.version} is available. Open Menu to install.` : `No newer compatible release. Installed: ${version}.` };
}
export async function installAppRelease(url: string, digest: string) {
  if (!native) throw new Error('App installation is available on Android phones, Android TV and Fire TV.');
  return native.install(url, digest);
}
