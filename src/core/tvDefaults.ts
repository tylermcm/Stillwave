import type { Library, GuideSource, Channel, Guide } from '../types';
import { MAX_PLAYLIST_BYTES } from './feedBytes';
import { normalizeFeedUrl, parseM3u } from './m3u';
import { addPlaylist } from './playlists';
import { assertGuideRefresh, getGuideSources, sourceChannels, sourceMappings, splitGuideKey, withGuideSources } from './guides';
import { parseXmltv } from './xmltv';

export const DEFAULT_TV_PLAYLIST = 'https://iptv-org.github.io/iptv/countries/us.m3u';
export const DEFAULT_TV_GUIDE = 'https://i.mjh.nz/PlutoTV/us.xml.gz';
export const HOSTED_TV_GUIDE = 'https://tylermcm.github.io/Stillwave/stillwave-us.xml.gz';

export const TV_GUIDE_DEFAULTS_VERSION = 4;
export const DEFAULT_TV_GUIDES = [
  { id: 'guide-tv-us', name: 'Pluto US program guide', url: DEFAULT_TV_GUIDE, refreshHours: 6 },
  { id: 'guide-tv-us-national', name: 'US national and local schedules', url: 'https://iptv-epg.org/files/epg-us.xml.gz', refreshHours: 12 },
  { id: 'guide-tv-us-samsung', name: 'Samsung TV Plus US schedules', url: 'https://i.mjh.nz/SamsungTVPlus/us.xml.gz', refreshHours: 6 },
  { id: 'guide-tv-us-plex', name: 'Plex US schedules', url: 'https://i.mjh.nz/Plex/us.xml.gz', refreshHours: 12 },
  { id: 'guide-tv-us-roku', name: 'Roku US schedules', url: 'https://i.mjh.nz/Roku/all.xml.gz', refreshHours: 6 },
  { id: 'guide-tv-us-pbs', name: 'PBS local station schedules', url: 'https://i.mjh.nz/PBS/all.xml.gz', refreshHours: 12 },
  { id: 'guide-tv-us-tvs', name: 'TVS exact stream schedules', url: 'https://www.watchyour.tv/guide.json', refreshHours: 6 },
  { id: 'guide-tv-us-backup', name: 'US backup schedules', url: 'https://epg.pw/xmltv/epg_US.xml.gz', refreshHours: 12 },
] as const;
export function needsTvGuideUpgrade(library: Library) {
  return library.playlists.some(p => p.url === DEFAULT_TV_PLAYLIST) && library.tvGuideDefaultsVersion !== TV_GUIDE_DEFAULTS_VERSION;
}

/** A background first-run import must not undo remote actions made while it downloads. */
export function completeTvSetup(imported: Library, latest: Library): Library {
  const ids = new Set(imported.channels.map(c => c.id));
  return { ...imported, favorites: latest.favorites.filter(id => ids.has(id)), recents: latest.recents.filter(r => ids.has(r.channelId)),
    reminders: latest.reminders.filter(r => ids.has(r.channelId)), profile: latest.profile,
    mappings: Object.fromEntries(Object.entries(latest.mappings).filter(([id]) => ids.has(id))) };
}

export async function installTvDefaults(library: Library, io: {
  download(url: string, limit?: number): Promise<string>;
  downloadGuide?(url: string, channels: Channel[], mappings: Record<string, string>): Promise<{ guide: Guide; text: string }>;
  cache(text: string, id: string): Promise<void>;
  progress?(name: string): void;
  onUpdate?(library: Library): void | Promise<void>;
}, guideUrl?: string): Promise<{ library: Library; guideError?: string }> {
  const existing = library.playlists.find(p => p.url === DEFAULT_TV_PLAYLIST);
  const parsed = parseM3u(await io.download(DEFAULT_TV_PLAYLIST, MAX_PLAYLIST_BYTES), DEFAULT_TV_PLAYLIST);
  let next = addPlaylist(library, parsed, { id: existing?.id ?? 'playlist-tv-us', name: existing?.name || 'US channels', url: DEFAULT_TV_PLAYLIST, updatedAt: Date.now() });
  await io.onUpdate?.(next);
  const playlistId = next.playlists.find(p => p.url === DEFAULT_TV_PLAYLIST)!.id;
  if (guideUrl === undefined) {
    const sources = getGuideSources(next);
    const previous = sources.find(s => s.url === HOSTED_TV_GUIDE && s.playlistIds.includes(playlistId));
    let id = previous?.id ?? 'guide-tv-hosted';
    for (let suffix = 2; !previous && sources.some(s => s.id === id); suffix++) id = `guide-tv-hosted-${suffix}`;
    io.progress?.('StillWave combined program guide');
    const useful = (guide: Guide) => Object.values(guide.programmes).some(list => list.some(p => p.stop > Date.now()));
    let hosted: GuideSource | undefined;
    try {
      const channels = sourceChannels({ playlistIds: [playlistId] }, next.channels), mappings = sourceMappings(id, next.mappings);
      const result = io.downloadGuide ? await io.downloadGuide(HOSTED_TV_GUIDE, channels, mappings) : await (async () => {
        const text = await io.download(HOSTED_TV_GUIDE); return { text, guide: await parseXmltv(text, channels, mappings) };
      })();
      if (!useful(result.guide)) throw new Error('No current hosted listings.');
      await io.cache(result.text, id);
      hosted = { id, name: 'StillWave combined program guide', url: HOSTED_TV_GUIDE, playlistIds: [playlistId], guide: result.guide, refreshHours: 6, lastAttemptAt: Date.now() };
    } catch {
      if (previous && useful(previous.guide)) hosted = { ...previous, lastAttemptAt: Date.now(), lastError: 'Hosted guide refresh failed. Saved listings are kept.' };
      else {
        const failed: GuideSource = { ...(previous ?? { id, name: 'StillWave combined program guide', url: HOSTED_TV_GUIDE, playlistIds: [playlistId], guide: { channels: {}, programmes: {}, importedAt: 0 }, refreshHours: 6 }), lastAttemptAt: Date.now(), lastError: 'Hosted guide unavailable. Direct guide sources are used until the next retry.' };
        next = withGuideSources(next, [failed, ...sources.filter(s => s.id !== id)]);
      }
    }
    if (hosted) {
      const pinned = new Set(Object.values(next.mappings).flatMap(value => { const pair = splitGuideKey(value); return pair ? [pair[0]] : []; }));
      // Keep manually assigned source schedules active. Other old default caches
      // remain available without downloading the full country feeds again.
      const remaining = sources.filter(s => s.id !== id).map(s => DEFAULT_TV_GUIDES.some(d => d.id === s.id && d.url === s.url) && s.playlistIds.length === 1 && s.playlistIds[0] === playlistId && !pinned.has(s.id) ? { ...s, refreshHours: 0 } : s);
      next = { ...withGuideSources(next, [hosted, ...remaining]), tvGuideDefaultsVersion: TV_GUIDE_DEFAULTS_VERSION };
      await io.onUpdate?.(next);
      return { library: next, guideError: hosted.lastError };
    }
  }
  const explicitUrl = guideUrl || parsed.guideUrls[0] || existing?.guideUrl;
  const defaults = guideUrl === undefined ? DEFAULT_TV_GUIDES : explicitUrl ? [{ id: 'guide-tv-us', name: 'US program guide', url: explicitUrl, refreshHours: 12 }] : [];
  let failures = 0;
  for (const definition of defaults) {
    io.progress?.(definition.name);
    const sources = getGuideSources(next);
    const previous = sources.find(s => s.url === definition.url && s.playlistIds.includes(playlistId));
    let id: string = previous?.id ?? definition.id;
    for (let suffix = 2; !previous && sources.some(s => s.id === id); suffix++) id = `${definition.id}-${suffix}`;
    const scope = { playlistIds: [playlistId] };
    const channels = sourceChannels(scope, next.channels), mappings = sourceMappings(id, next.mappings);
    let source: GuideSource;
    try {
      const normalized = normalizeFeedUrl(definition.url);
      const result = io.downloadGuide ? await io.downloadGuide(normalized, channels, mappings) : await (async () => {
        const text = await io.download(normalized);
        return { text, guide: await parseXmltv(text, channels, mappings) };
      })();
      // Empty/stale responses must not overwrite useful cached schedules.
      assertGuideRefresh(previous?.guide, result.guide);
      await io.cache(result.text, id);
      source = { id, name: previous?.name || definition.name, url: normalized, ...scope, refreshHours: previous?.refreshHours || definition.refreshHours, guide: result.guide, lastAttemptAt: Date.now() };
    } catch {
      failures++;
      source = { ...(previous || { id, name: definition.name, url: definition.url, ...scope, refreshHours: definition.refreshHours, guide: { channels: {}, programmes: {}, importedAt: 0 } }), lastAttemptAt: Date.now(), lastError: 'The latest guide refresh failed.' };
    }
    next = withGuideSources(next, previous ? sources.map(s => s.id === id ? source : s) : [...sources, source]);
    await io.onUpdate?.(next);
  }
  if (guideUrl === undefined) next = { ...next, tvGuideDefaultsVersion: TV_GUIDE_DEFAULTS_VERSION };
  return { library: next, guideError: failures ? 'Some program guides could not refresh; any saved guide is kept. Use Menu to retry the failed sources.' : undefined };
}
