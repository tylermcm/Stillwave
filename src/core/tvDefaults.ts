import type { Library, GuideSource } from '../types';
import { MAX_PLAYLIST_BYTES } from './feedBytes';
import { normalizeFeedUrl, parseM3u } from './m3u';
import { addPlaylist } from './playlists';
import { getGuideSources, sourceChannels, sourceMappings, withGuideSources } from './guides';
import { parseXmltv } from './xmltv';

export const DEFAULT_TV_PLAYLIST = 'https://iptv-org.github.io/iptv/countries/us.m3u';
export const DEFAULT_TV_GUIDE = 'https://i.mjh.nz/PlutoTV/us.xml.gz';

/** A background first-run import must not undo remote actions made while it downloads. */
export function completeTvSetup(imported: Library, latest: Library): Library {
  const ids = new Set(imported.channels.map(c => c.id));
  return { ...imported, favorites: latest.favorites.filter(id => ids.has(id)), recents: latest.recents.filter(r => ids.has(r.channelId)),
    reminders: latest.reminders.filter(r => ids.has(r.channelId)), profile: latest.profile,
    mappings: Object.fromEntries(Object.entries(latest.mappings).filter(([id]) => ids.has(id))) };
}

export async function installTvDefaults(library: Library, io: {
  download(url: string, limit?: number): Promise<string>;
  cache(text: string, id: string): Promise<void>;
}, guideUrl = DEFAULT_TV_GUIDE): Promise<{ library: Library; guideError?: string }> {
  const existing = library.playlists.find(p => p.url === DEFAULT_TV_PLAYLIST);
  const parsed = parseM3u(await io.download(DEFAULT_TV_PLAYLIST, MAX_PLAYLIST_BYTES), DEFAULT_TV_PLAYLIST);
  let next = addPlaylist(library, parsed, { id: existing?.id ?? 'playlist-tv-us', name: existing?.name || 'US channels', url: DEFAULT_TV_PLAYLIST, updatedAt: Date.now() });
  const playlistId = next.playlists.find(p => p.url === DEFAULT_TV_PLAYLIST)!.id;
  const url = guideUrl || parsed.guideUrls[0] || existing?.guideUrl;
  if (!url) return { library: next };
  try {
    const normalized = normalizeFeedUrl(url);
    const sources = getGuideSources(next);
    const previous = sources.find(s => s.url === normalized && s.playlistIds.includes(playlistId));
    const id = previous?.id ?? 'guide-tv-us';
    const text = await io.download(normalized);
    const source: GuideSource = { id, name: normalized === DEFAULT_TV_GUIDE ? 'Pluto US program guide' : 'US program guide', url: normalized, playlistIds: [playlistId], refreshHours: 12,
      guide: await parseXmltv(text, sourceChannels({ playlistIds: [playlistId] }, next.channels), sourceMappings(id, next.mappings)), lastAttemptAt: Date.now() };
    await io.cache(text, id);
    next = withGuideSources(next, previous ? sources.map(s => s.id === id ? source : s) : [...sources, source]);
    return { library: next };
  } catch {
    return { library: next, guideError: 'Channels are ready. The program guide could not refresh; any saved guide is kept.' };
  }
}
