const RELEASE_PREFIX = 'https://github.com/tylermcm/Stillwave/releases/download/';
export const RELEASE_API = 'https://api.github.com/repos/tylermcm/Stillwave/releases/latest';
export interface AppRelease { version: string; url: string; digest: string; size: number }
function versionParts(version: string) {
  const m = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(version);
  return m ? m.slice(1).map(Number) : undefined;
}
export function newerVersion(candidate: string, installed: string) {
  const a = versionParts(candidate), b = versionParts(installed);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i]! > b[i]!;
  return false;
}
export function githubAppRelease(data: unknown, installed: string, television = true): AppRelease | undefined {
  const release = data as { draft?: boolean; prerelease?: boolean; tag_name?: string; assets?: { name: string; browser_download_url: string; size: number; digest?: string }[] };
  if (!release || release.draft || release.prerelease || typeof release.tag_name !== 'string' || !newerVersion(release.tag_name, installed) || !Array.isArray(release.assets)) return undefined;
  const version = release.tag_name.replace(/^v/, '');
  const matches = release.assets.filter(a => a && [`Stillwave-FireTV-${version}.apk`, `Stillwave-${version}.apk`].includes(a.name) && typeof a.browser_download_url === 'string' && a.browser_download_url.startsWith(RELEASE_PREFIX) && a.size > 0 && a.size <= 150 * 1024 * 1024);
  const asset = matches.find(a => television ? a.name.startsWith('Stillwave-FireTV-') : a.name === `Stillwave-${version}.apk`) ?? matches[0];
  if (!asset) return undefined;
  let url: URL;
  try { url = new URL(asset.browser_download_url); } catch { return undefined; }
  if (url.protocol !== 'https:' || url.hostname !== 'github.com' || url.username || url.password || url.port || !url.href.startsWith(RELEASE_PREFIX) || !url.pathname.toLowerCase().endsWith('.apk')) return undefined;
  if (asset.digest && !/^sha256:[a-f\d]{64}$/i.test(asset.digest)) return undefined;
  return { version, url: url.href, digest: asset.digest?.slice(7).toLowerCase() || '', size: asset.size };
}
